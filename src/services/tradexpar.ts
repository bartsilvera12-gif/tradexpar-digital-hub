/**
 * Acceso directo a Supabase: GoTrue (Auth) + PostgREST sobre el schema `tradexpar`.
 * No hay servidor HTTP propio ni rutas /api: todo es la instancia configurada en .env.
 */
import {
  getSupabaseAuth,
  getSupabaseData,
  isSupabaseConfigured,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl,
  runAuthExclusive,
  setDataClientAccessToken,
  syncDataClientTokenFromAuthSession,
  tryReadAuthAccessTokenFromStorage,
} from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import type {
  Product,
  Order,
  OrderLineItem,
  CreateOrderPayload,
  PaymentResponse,
  PaymentStatus,
  CustomerUser,
  CustomerWishlistItem,
  CustomerLocation,
} from "@/types";
import { deriveOrderKind } from "@/lib/adminOrdersUtils";
import {
  formatSupabaseErrorForUser,
  isTransientNetworkOrServerError,
  sleep,
} from "@/lib/networkResilience";

function oauthProviderFromUser(user: User): "google" | "facebook" | null {
  for (const id of user.identities ?? []) {
    if (id.provider === "google") return "google";
    if (id.provider === "facebook") return "facebook";
  }
  const meta = user.app_metadata as { provider?: string; providers?: string[] } | undefined;
  const fromMeta = meta?.provider;
  const fromProviders = meta?.providers ?? [];
  const fromIdentities = user.identities?.map((i) => i.provider) ?? [];
  const all = [fromMeta, ...fromProviders, ...fromIdentities].filter((x): x is string => typeof x === "string");
  if (all.includes("google")) return "google";
  if (all.includes("facebook")) return "facebook";
  return null;
}

/** Hash (#access_token) o PKCE (?code=) al volver de Google/Facebook. */
export function isOAuthCallbackUrl(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hash;
  if (h) {
    if (h.includes("access_token") || h.includes("refresh_token")) return true;
    const hp = new URLSearchParams(h.startsWith("#") ? h.slice(1) : h);
    if (hp.has("code") || hp.has("error")) return true;
  }
  const q = new URLSearchParams(window.location.search);
  if (q.has("code") || q.has("error") || q.has("error_description")) return true;
  return false;
}

const OAUTH_PENDING_TTL_MS = 90_000;

/** Se setea al iniciar OAuth; la URL pierde ?code= tras initialize() pero el sync sigue en curso. */
export function isOAuthReturnPending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  if (sessionStorage.getItem("tradexpar_oauth_pending") !== "1") return false;
  const at = Number(sessionStorage.getItem("tradexpar_oauth_pending_at") || "0");
  if (!at || Date.now() - at > OAUTH_PENDING_TTL_MS) {
    clearOAuthReturnPending();
    return false;
  }
  return true;
}

export function clearOAuthReturnPending(): void {
  try {
    sessionStorage.removeItem("tradexpar_oauth_pending");
    sessionStorage.removeItem("tradexpar_oauth_pending_at");
  } catch {
    /* ignore */
  }
}

function tx() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env (y reinicia vite)."
    );
  }
  return getSupabaseData();
}

const STORE_JWT_SYNC_MS = 12_000;

function requestAbortSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

const STORE_CATALOG_TIMEOUT_MS = 32_000;
const STORE_CATALOG_RETRIES = 2;

/** Asegura que las RPC de tienda vean el mismo JWT que la sesión de Auth (evita auth.uid() null en PostgREST). */
async function syncStoreJwtToDataClient(): Promise<void> {
  const fast = tryReadAuthAccessTokenFromStorage();
  if (fast) {
    setDataClientAccessToken(fast);
    return;
  }
  try {
    await Promise.race([
      runAuthExclusive(async () => {
        const { data: { session }, error } = await getSupabaseAuth().auth.getSession();
        if (error) throw new Error(formatSupabaseErrorForUser(error.message));
        if (session?.access_token) setDataClientAccessToken(session.access_token);
      }),
      new Promise<never>((_, rej) =>
        setTimeout(
          () => rej(new Error("__STORE_JWT_SYNC_TIMEOUT__")),
          STORE_JWT_SYNC_MS
        )
      ),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "__STORE_JWT_SYNC_TIMEOUT__") {
      const again = tryReadAuthAccessTokenFromStorage();
      if (again) {
        setDataClientAccessToken(again);
        return;
      }
      throw new Error(
        "No se pudo sincronizar la sesión a tiempo. Cerrá otras pestañas de este sitio o volvé a iniciar sesión."
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

async function fetchProductsOnce(): Promise<Product[]> {
  const signal = requestAbortSignal(STORE_CATALOG_TIMEOUT_MS);
  const { data, error } = await tx()
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .abortSignal(signal);
  if (error) throw new Error(formatSupabaseErrorForUser(error.message));
  return (data ?? []).map((r) => mapProduct(r as Record<string, unknown>));
}

const ADMIN_AUTH_SYNC_MS = 6000;
const ADMIN_FETCH_MS = 60_000;

function withAdminFetchTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, rej) =>
      setTimeout(
        () => rej(new Error(`${label}: tiempo de espera agotado. Revisá la conexión o reintentá.`)),
        ADMIN_FETCH_MS
      )
    ),
  ]);
}

/** PostgREST con JWT vigente desde Auth (evita «JWT expired» en el panel admin). */
async function txAdmin() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env (y reinicia vite)."
    );
  }
  try {
    await Promise.race([
      syncDataClientTokenFromAuthSession(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("__ADMIN_SYNC_TIMEOUT__")), ADMIN_AUTH_SYNC_MS)
      ),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "__ADMIN_SYNC_TIMEOUT__") {
      const t =
        typeof sessionStorage !== "undefined" ? sessionStorage.getItem("tradexpar_admin_token") : null;
      if (t) {
        setDataClientAccessToken(t);
      } else {
        throw new Error("No se pudo sincronizar la sesión. Volvé a iniciar sesión en el panel.");
      }
    } else {
      throw e instanceof Error ? e : new Error(msg);
    }
  }
  return getSupabaseData();
}

function mapProduct(row: Record<string, unknown>): Product {
  const rawImages = row.images;
  let imageUrls: string[] = [];
  if (Array.isArray(rawImages)) {
    imageUrls = rawImages.filter((x) => typeof x === "string") as string[];
  }
  const primary =
    (typeof row.image === "string" && row.image) || imageUrls[0] || "";
  const allImages =
    imageUrls.length > 0 ? imageUrls : primary ? [primary] : [];

  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    price: Number(row.price ?? row.sale_price ?? 0),
    stock: Number(row.stock ?? 0),
    stock_min: row.stock_min != null ? Number(row.stock_min) : null,
    stock_max: row.stock_max != null ? Number(row.stock_max) : null,
    image: primary,
    images: allImages.length > 0 ? allImages : undefined,
    sku: String(row.sku ?? ""),
    description: String(row.description ?? ""),
    category: String(row.category ?? ""),
    created_at:
      row.created_at != null
        ? String(row.created_at)
        : row.inserted_at != null
          ? String(row.inserted_at)
          : row.createdAt != null
            ? String(row.createdAt)
            : undefined,
    product_source_type: (row.product_source_type as Product["product_source_type"]) ?? "tradexpar",
    discount_type: (row.discount_type as Product["discount_type"]) ?? null,
    discount_value: row.discount_value != null ? Number(row.discount_value) : null,
    discount_starts_at: row.discount_starts_at != null ? String(row.discount_starts_at) : null,
    discount_ends_at: row.discount_ends_at != null ? String(row.discount_ends_at) : null,
  };
}

function productToRow(p: Partial<Product>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.sku !== undefined) row.sku = p.sku;
  if (p.description !== undefined) row.description = p.description;
  if (p.category !== undefined) row.category = p.category;
  if (p.price !== undefined) row.price = p.price;
  if (p.stock !== undefined) row.stock = p.stock;
  if (p.stock_min !== undefined) row.stock_min = p.stock_min;
  if (p.stock_max !== undefined) row.stock_max = p.stock_max;
  if (p.image !== undefined) row.image = p.image;
  if (p.product_source_type !== undefined) row.product_source_type = p.product_source_type;
  if (p.discount_type !== undefined) row.discount_type = p.discount_type;
  if (p.discount_value !== undefined) row.discount_value = p.discount_value;
  if (p.discount_starts_at !== undefined) row.discount_starts_at = p.discount_starts_at || null;
  if (p.discount_ends_at !== undefined) row.discount_ends_at = p.discount_ends_at || null;
  if (p.images !== undefined) row.images = p.images.length ? p.images : [];
  return row;
}

function mapOrderItemRow(it: Record<string, unknown>): OrderLineItem {
  return {
    id: it.id != null ? String(it.id) : undefined,
    product_id: String(it.product_id ?? ""),
    quantity: Number(it.quantity ?? 0),
    price: Number(it.unit_price ?? it.price ?? 0),
    product_name: it.product_name != null ? String(it.product_name) : undefined,
    line_subtotal: it.line_subtotal != null ? Number(it.line_subtotal) : undefined,
    line_index: it.line_index != null ? Number(it.line_index) : undefined,
    line_status: it.line_status != null ? String(it.line_status) : "pending",
    external_provider: it.external_provider != null ? String(it.external_provider) : null,
    external_product_id: it.external_product_id != null ? String(it.external_product_id) : null,
    external_order_id: it.external_order_id != null ? String(it.external_order_id) : null,
    external_status: it.external_status != null ? String(it.external_status) : null,
    external_url: it.external_url != null ? String(it.external_url) : null,
  };
}

function mapOrder(row: Record<string, unknown>): Order {
  const rawItems = row.order_items as Record<string, unknown>[] | null | undefined;
  const items: OrderLineItem[] = Array.isArray(rawItems)
    ? [...rawItems]
        .sort((a, b) => Number(a.line_index ?? 0) - Number(b.line_index ?? 0))
        .map(mapOrderItemRow)
    : [];

  return {
    id: String(row.id),
    items,
    total: Number(row.total ?? 0),
    status: String(row.status ?? "pending"),
    created_at: String(row.created_at ?? new Date().toISOString()),
    checkout_type: row.checkout_type != null ? String(row.checkout_type) : undefined,
    external_order_url: row.external_order_url != null ? String(row.external_order_url) : null,
    order_kind: deriveOrderKind(items),
    customer: {
      name: String(row.customer_name ?? ""),
      email: row.customer_email != null ? String(row.customer_email) : undefined,
      phone: row.customer_phone != null ? String(row.customer_phone) : undefined,
    },
  };
}

async function enrichOrdersWithProductMeta(
  sb: Awaited<ReturnType<typeof txAdmin>>,
  orders: Order[]
): Promise<Order[]> {
  const ids = new Set<string>();
  for (const o of orders) {
    for (const i of o.items) {
      if (i.product_id) ids.add(i.product_id);
    }
  }
  const idArr = [...ids];
  if (idArr.length === 0) {
    return orders.map((o) => ({ ...o, order_kind: deriveOrderKind(o.items) }));
  }

  const { data: prows, error } = await sb.from("products").select("id,sku,product_source_type").in("id", idArr);
  if (error) {
    return orders.map((o) => ({ ...o, order_kind: deriveOrderKind(o.items) }));
  }

  const pmap = new Map<string, { sku: string; product_source_type: string }>();
  for (const r of prows ?? []) {
    const rec = r as Record<string, unknown>;
    pmap.set(String(rec.id), {
      sku: String(rec.sku ?? ""),
      product_source_type: String(rec.product_source_type ?? "tradexpar"),
    });
  }

  return orders.map((o) => {
    const items = o.items.map((i) => {
      const p = pmap.get(i.product_id);
      const pst =
        p?.product_source_type === "dropi" ? "dropi" : ("tradexpar" as const);
      return {
        ...i,
        sku: p?.sku ?? i.sku,
        product_source_type: pst,
      };
    });
    return { ...o, items, order_kind: deriveOrderKind(items) };
  });
}

function parseRpcJsonArray(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === "string") {
    try {
      const p = JSON.parse(data) as unknown;
      return Array.isArray(p) ? (p as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseRpcJsonObject(data: unknown): Record<string, unknown> | null {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (typeof data === "string") {
    try {
      const p = JSON.parse(data) as unknown;
      if (p != null && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function jsonTruth(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "string") return v === "true" || v === "1";
  if (typeof v === "number") return v === 1;
  return false;
}

function rowToCustomerUser(row: Record<string, unknown>): CustomerUser {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    provider: row.provider != null ? String(row.provider) : undefined,
    is_affiliate: jsonTruth(row.is_affiliate),
  };
}

/**
 * Marca `is_affiliate` si hay fila en `affiliates` por `customer_id` o por **mismo email**
 * (muchos distribuidores digitales independientes aún no tienen `customer_id` vinculado al crear la cuenta en la tienda).
 */
async function mergeCustomerAffiliateFlags(
  sb: Awaited<ReturnType<typeof txAdmin>>,
  users: CustomerUser[]
): Promise<CustomerUser[]> {
  if (users.length === 0) return users;
  const { data, error } = await sb.from("affiliates").select("customer_id, email");
  if (error) return users;

  const byCustomerId = new Set<string>();
  const byEmailNorm = new Set<string>();
  for (const r of (data as { customer_id?: string | null; email?: string | null }[] | null) ?? []) {
    const cid = r.customer_id != null ? String(r.customer_id) : "";
    if (cid.length > 0) byCustomerId.add(cid);
    const em = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
    if (em.length > 0) byEmailNorm.add(em);
  }

  return users.map((u) => {
    const emailNorm = (u.email ?? "").trim().toLowerCase();
    const linked =
      byCustomerId.has(u.id) || (emailNorm.length > 0 && byEmailNorm.has(emailNorm));
    return { ...u, is_affiliate: Boolean(u.is_affiliate) || linked };
  });
}

async function assertAdminProfile(userId: string) {
  if (import.meta.env.VITE_ADMIN_REQUIRE_SUPER !== "true") return;
  const { data, error } = await tx()
    .from("profiles")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle()
    .abortSignal(AbortSignal.timeout(12_000));
  if (error) {
    const msg = error.message ?? String(error);
    await getSupabaseAuth().auth.signOut({ scope: "local" });
    setDataClientAccessToken(null);
    if (/does not exist|schema cache|42P01|PGRST/i.test(msg)) {
      throw new Error(
        "No se pudo leer `tradexpar.profiles` (¿falta la tabla o políticas RLS?). Revisá el SQL del proyecto o desactivá VITE_ADMIN_REQUIRE_SUPER."
      );
    }
    throw new Error(`No se pudo verificar permisos de administrador: ${msg}`);
  }
  if (!(data as { is_super_admin?: boolean } | null)?.is_super_admin) {
    await getSupabaseAuth().auth.signOut({ scope: "local" });
    setDataClientAccessToken(null);
    throw new Error("Tu usuario no tiene permisos de administrador.");
  }
}

async function fetchCustomerByAuthId(authUserId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await tx()
    .from("customers")
    .select("id,name,email,created_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>) ?? null;
}

function paymentRef(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isRpcMissingError(message: string): boolean {
  return /PGRST202|does not exist|Could not find|schema cache|function.*admin_set_customer_auth_password/i.test(
    message
  );
}

function throwSetPasswordRpcReason(o: Record<string, unknown>): never {
  const r = String(o.reason ?? "");
  const m = typeof o.message === "string" ? o.message : "";
  if (r === "password_too_short") throw new Error("La contraseña debe tener al menos 6 caracteres.");
  if (r === "no_auth_user") {
    throw new Error("Este cliente no tiene cuenta de inicio de sesión vinculada en Auth (falta auth_user_id).");
  }
  if (r === "auth_user_not_found") {
    throw new Error("No existe el usuario en Auth para ese cliente.");
  }
  if (r === "insufficient_privilege") {
    throw new Error(
      "La base no permite actualizar auth.users con este rol. Ejecutá el SQL como superusuario o usá una Edge Function."
    );
  }
  if (r === "pgcrypto_missing") {
    throw new Error("Falta la extensión pgcrypto (extensions). Instalala en Postgres y reintentá.");
  }
  if (r === "auth_update_error" && m) throw new Error(m);
  throw new Error("No se pudo cambiar la contraseña.");
}

/** Respaldo: Edge Function (útil en Supabase Cloud con función desplegada). */
async function adminSetCustomerPasswordViaEdge(customerId: string, newPassword: string): Promise<void> {
  const base = resolveSupabaseUrl().replace(/\/$/, "");
  const anon = resolveSupabaseAnonKey().trim();
  const token =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem("tradexpar_admin_token") : null;
  if (!token?.trim()) {
    throw new Error("No hay sesión de administrador. Volvé a iniciar sesión.");
  }
  const url = `${base}/functions/v1/admin-set-customer-password`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer_id: customerId, password: newPassword }),
    });
  } catch (e) {
    const net = e instanceof Error ? e.message : String(e);
    throw new Error(
      /failed to fetch|network|load failed|networkerror/i.test(net)
        ? "No se pudo conectar con la Edge Function (red o CORS)."
        : net
    );
  }

  const rawText = await res.text();
  let body: Record<string, unknown> = {};
  try {
    if (rawText.trim()) body = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  const errRaw = body.error ?? body.code;
  const err = String(errRaw ?? "").toLowerCase();
  const msg =
    typeof body.message === "string"
      ? body.message
      : typeof body.msg === "string"
        ? body.msg
        : "";

  if (res.ok && body.ok === true) return;

  if (res.status === 404) {
    throw new Error(
      "No hay RPC de contraseña en la base y la Edge Function no está desplegada. Ejecutá supabase/tradexpar_admin_set_customer_auth_password.sql en el SQL Editor (self-hosted) o desplegá admin-set-customer-password."
    );
  }
  if (res.status === 401 || err === "unauthorized") {
    throw new Error(
      msg || "Sesión inválida o token vencido. Volvé a iniciar sesión en el panel de administración."
    );
  }
  if (res.status === 403 || err === "forbidden") {
    throw new Error(msg || "Tu usuario no tiene permiso para esta acción.");
  }
  if (err === "no_auth_user") {
    throw new Error(
      "Este cliente no tiene cuenta de inicio de sesión vinculada en Auth (falta auth_user_id en la fila de customers)."
    );
  }
  if (err === "password_too_short") throw new Error("La contraseña debe tener al menos 6 caracteres.");
  if (err === "server_misconfigured") {
    throw new Error("La Edge Function no tiene configurado el service role en el entorno.");
  }
  if (err === "lookup_failed") {
    throw new Error(msg || "No se pudo leer el cliente en la base.");
  }
  if (err === "auth_update_failed") {
    throw new Error(msg || "Auth rechazó la contraseña.");
  }
  if (msg) throw new Error(msg);
  if (rawText.trim() && rawText.length < 400) {
    throw new Error(`Respuesta inesperada (${res.status}): ${rawText.trim().slice(0, 200)}`);
  }
  throw new Error(`No se pudo cambiar la contraseña (HTTP ${res.status}).`);
}

export const tradexpar = {
  getProducts: async (): Promise<Product[]> => {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= STORE_CATALOG_RETRIES; attempt++) {
      try {
        return await fetchProductsOnce();
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (attempt < STORE_CATALOG_RETRIES && isTransientNetworkOrServerError(lastErr.message)) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr ?? new Error("No se pudo cargar el catálogo.");
  },

  /** Pedido + líneas en una transacción (RPC `tradexpar.create_checkout_order` en SQL). */
  createOrder: async (payload: CreateOrderPayload): Promise<Order> => {
    const p_items = payload.items.map((i, line_index) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      price: i.price,
      line_subtotal: i.price * i.quantity,
      line_index,
      product_name: i.product_name ?? null,
    }));

    const { data, error } = await tx().rpc("create_checkout_order", {
      p_checkout_type: payload.checkout_type ?? "tradexpar",
      p_location_url: payload.location_url,
      p_customer_name: payload.customer.name,
      p_customer_email: payload.customer.email ?? null,
      p_customer_phone: payload.customer.phone ?? null,
      p_customer_location_id: payload.customer_location_id ?? null,
      p_affiliate_ref: payload.affiliate_ref ?? null,
      p_items,
      p_affiliate_campaign_slug: null,
      p_checkout_client_ip: payload.checkout_client_ip?.trim() || null,
    });

    if (error) throw new Error(error.message);
    const o = data as Record<string, unknown>;
    const cust = (o.customer || {}) as Record<string, unknown>;
    return {
      id: String(o.id),
      total: Number(o.total),
      status: String(o.status),
      created_at: String(o.created_at),
      checkout_type: String(o.checkout_type),
      customer: {
        name: String(cust.name ?? ""),
        email: cust.email ? String(cust.email) : undefined,
        phone: cust.phone ? String(cust.phone) : undefined,
      },
      items: payload.items,
    };
  },

  createPayment: async (orderId: string): Promise<PaymentResponse> => {
    const ref = paymentRef();
    const { error } = await tx()
      .from("orders")
      .update({ payment_reference: ref, payment_status: "pending" })
      .eq("id", orderId);
    if (error) throw new Error(error.message);
    const template = import.meta.env.VITE_PAYMENT_REDIRECT_URL?.trim();
    const paymentLink = template
      ? template.replaceAll("{orderId}", orderId).replaceAll("{ref}", ref)
      : "";
    return { paymentLink, ref };
  },

  getPaymentStatus: async (orderId: string, ref: string): Promise<PaymentStatus> => {
    const { data, error } = await tx().rpc("get_order_payment_status", {
      p_order: orderId,
      p_ref: ref,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") {
      throw new Error("No se encontró el estado del pago");
    }
    const r = row as Record<string, unknown>;
    return {
      status: String(r.status ?? "pending"),
      ref: String(r.ref ?? ref),
      order_id: String(r.order_id ?? orderId),
    };
  },

  customerRegister: async (payload: { name: string; email: string; password: string }) => {
    const { data, error } = await runAuthExclusive(() =>
      getSupabaseAuth().auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          data: { full_name: payload.name },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
        },
      })
    );
    if (error) {
      const raw = error.message || "";
      if (/confirmation email|sending confirmation/i.test(raw)) {
        throw new Error(
          "Supabase no pudo enviar el correo de confirmación. En el dashboard del proyecto: Authentication → Providers → Email, desactivá «Confirm email» (útil en desarrollo) o configurá SMTP propio (Resend, SendGrid, etc.) en Authentication → Emails."
        );
      }
      throw new Error(raw || "No se pudo registrar.");
    }
    if (!data.user) throw new Error("No se pudo registrar.");
    if (!data.session) {
      throw new Error("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
    }
    setDataClientAccessToken(data.session.access_token);
    const { data: ins, error: insErr } = await tx()
      .from("customers")
      .insert({
        auth_user_id: data.user.id,
        name: payload.name,
        email: payload.email,
        provider: "manual",
      })
      .select("id,name,email,created_at")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { user: rowToCustomerUser(ins as Record<string, unknown>) };
  },

  customerLogin: async (payload: { email: string; password: string }) => {
    const { data, error } = await runAuthExclusive(() =>
      getSupabaseAuth().auth.signInWithPassword({
        email: payload.email,
        password: payload.password,
      })
    );
    if (error) throw new Error(error.message);
    const uid = data.user?.id;
    if (!uid) throw new Error("Sesión inválida");
    /** Solo usar el token de esta respuesta: refreshSession/getSession aquí puede bloquearse con el lock de GoTrue. */
    const accessToken = data.session?.access_token ?? null;
    if (accessToken) setDataClientAccessToken(accessToken);

    let row = await fetchCustomerByAuthId(uid);
    if (!row) {
      const email = data.user.email ?? payload.email;
      const name =
        (data.user.user_metadata?.full_name as string) ||
        (data.user.user_metadata?.name as string) ||
        email.split("@")[0] ||
        "Usuario";
      const { error: insErr } = await tx().from("customers").insert({
        auth_user_id: uid,
        name,
        email,
        provider: "manual",
      });
      if (insErr) throw new Error(insErr.message);
      row = await fetchCustomerByAuthId(uid);
    }
    if (!row) throw new Error("No se pudo cargar el perfil de cliente.");
    return { user: rowToCustomerUser(row) };
  },

  /** Estado del cooldown 24h para cambiar contraseña (RPC `customer_password_change_status`). */
  customerPasswordChangeStatus: async (): Promise<{
    can_change: boolean;
    reason?: string;
    next_change_after?: string;
  }> => {
    await syncStoreJwtToDataClient();
    const { data, error } = await tx().rpc("customer_password_change_status");
    if (error) throw new Error(error.message);
    const o = parseRpcJsonObject(data);
    if (!o) return { can_change: false, reason: "unknown_response" };
    const can = o.can_change === true || o.can_change === "true";
    let next: string | undefined;
    const raw = o.next_change_after;
    if (raw != null) {
      if (typeof raw === "string") next = raw;
      else next = String(raw);
    }
    const reason = o.reason != null ? String(o.reason) : undefined;
    return { can_change: can, reason, next_change_after: next };
  },

  /** Cambia la contraseña del usuario actual (Auth + marca cooldown en customers). */
  customerChangeOwnPassword: async (newPassword: string) => {
    await syncStoreJwtToDataClient();
    const { data, error } = await tx().rpc("customer_change_own_password", {
      p_new_password: newPassword,
    });
    if (error) throw new Error(error.message);
    const o = parseRpcJsonObject(data);
    if (o?.ok === true) return;
    const r = String(o?.reason ?? "");
    const rawNext = o?.next_change_after;
    const nextIso = rawNext != null ? String(rawNext) : "";
    if (r === "cooldown") {
      const when = nextIso ? new Date(nextIso).toLocaleString("es-PY") : null;
      throw new Error(
        when
          ? `Podés volver a cambiar la contraseña el ${when} (24 h entre cambios).`
          : "Debés esperar 24 horas entre cada cambio de contraseña."
      );
    }
    if (r === "password_too_short") throw new Error("La contraseña debe tener al menos 6 caracteres.");
    if (r === "no_customer") throw new Error("No se encontró tu perfil de cliente.");
    if (r === "auth_user_not_found") throw new Error("No se pudo actualizar la cuenta de acceso.");
    if (r === "insufficient_privilege") {
      throw new Error("El servidor no permite este cambio. Ejecutá el SQL del repositorio o contactá al administrador.");
    }
    if (r === "pgcrypto_missing") throw new Error("Falta la extensión pgcrypto en la base de datos.");
    if (r === "auth_update_error" && typeof o.message === "string") throw new Error(o.message);
    throw new Error("No se pudo cambiar la contraseña.");
  },

  customerOAuthStart: async (provider: "google" | "facebook") => {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/account` : undefined;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("tradexpar_oauth_pending", "1");
      sessionStorage.setItem("tradexpar_oauth_pending_at", String(Date.now()));
    }
    /**
     * skipBrowserRedirect: el SDK no navega solo; devuelve la URL y nosotros redirigimos.
     * Facebook: Supabase requiere email; los scopes deben coincidir con lo habilitado en la app de Meta.
     * @see https://supabase.com/docs/guides/auth/social-login/auth-facebook (permisos public_profile + email)
     */
    try {
      const { data, error } = await getSupabaseAuth().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          ...(provider === "facebook"
            ? { scopes: "public_profile email" }
            : provider === "google"
              ? { scopes: "openid email profile" }
              : {}),
        },
      });
      if (error) throw new Error(error.message);
      return { url: data.url ?? "" };
    } catch (e) {
      clearOAuthReturnPending();
      throw e;
    }
  },

  getWishlist: async (customerId: string) => {
    const { data, error } = await tx()
      .from("customer_wishlists")
      .select("id,customer_id,product_id,created_at")
      .eq("customer_id", customerId);
    if (error) throw new Error(error.message);
    return { items: (data ?? []) as CustomerWishlistItem[] };
  },

  addWishlistItem: async (customerId: string, productId: string) => {
    const { data, error } = await tx()
      .from("customer_wishlists")
      .insert({ customer_id: customerId, product_id: productId })
      .select("id,customer_id,product_id,created_at")
      .single();
    if (error) throw new Error(error.message);
    return data as CustomerWishlistItem;
  },

  removeWishlistItem: async (customerId: string, productId: string) => {
    const { error } = await tx()
      .from("customer_wishlists")
      .delete()
      .eq("customer_id", customerId)
      .eq("product_id", productId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  getCustomerLocations: async (customerId: string) => {
    const { data, error } = await tx()
      .from("customer_locations")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .abortSignal(requestAbortSignal(15_000));
    if (error) throw new Error(formatSupabaseErrorForUser(error.message));
    return { locations: (data ?? []) as CustomerLocation[] };
  },

  createCustomerLocation: async (
    customerId: string,
    payload: { label: string; location_url: string; is_default?: boolean }
  ) => {
    const { data, error } = await tx()
      .from("customer_locations")
      .insert({
        customer_id: customerId,
        label: payload.label,
        location_url: payload.location_url,
        is_default: payload.is_default ?? false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as CustomerLocation;
  },

  adminLogin: async (payload: { email: string; password: string }) => {
    /**
     * `runAuthExclusive` serializa con otros `getSession`/signOut de la app.
     * No anidar otro `runAuthExclusive` dentro de `assertAdminProfile` (signOut directo).
     * Sin `Promise.race` artificial: si falla, debe verse el error real de red o de Supabase.
     */
    return runAuthExclusive(async () => {
      const { data, error } = await getSupabaseAuth().auth.signInWithPassword({
        email: payload.email.trim(),
        password: payload.password,
      });
      if (error) throw new Error(error.message);
      const uid = data.user?.id;
      if (!uid) throw new Error("Sesión inválida");
      const accessToken = data.session?.access_token ?? null;
      if (accessToken) setDataClientAccessToken(accessToken);
      await assertAdminProfile(uid);
      const meta = data.user;
      const name =
        (meta.user_metadata?.full_name as string) ||
        (meta.user_metadata?.name as string) ||
        meta.email?.split("@")[0] ||
        "Admin";
      return {
        token: accessToken ?? "",
        user: {
          id: uid,
          email: meta.email ?? payload.email,
          name,
          role: "admin",
        },
      };
    });
  },

  adminGetOrders: async () => {
    return withAdminFetchTimeout(
      (async () => {
        const sb = await txAdmin();
        const { data, error } = await sb
          .from("orders")
          .select("*, order_items(*)")
          .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        const base = (data ?? []).map((r) => mapOrder(r as Record<string, unknown>));
        const orders = await enrichOrdersWithProductMeta(sb, base);
        return { orders };
      })(),
      "Pedidos"
    );
  },

  adminUpdateOrderStatus: async (orderId: string, status: string) => {
    const sb = await txAdmin();
    const { error } = await sb.from("orders").update({ status }).eq("id", orderId);
    if (error) throw new Error(error.message);
  },

  adminUpdateOrderItemLine: async (
    itemId: string,
    patch: { line_status?: string; external_status?: string }
  ) => {
    const sb = await txAdmin();
    const { error } = await sb.from("order_items").update(patch).eq("id", itemId);
    if (error) throw new Error(error.message);
  },

  adminGetUsers: async () => {
    return withAdminFetchTimeout(
      (async () => {
        const isLockSteal = (m: string) => /lock broken|steal/i.test(m);

        for (let attempt = 0; attempt < 3; attempt++) {
          const sb = await txAdmin();
          const { data: rpcData, error: rpcError } = await sb.rpc("admin_list_customers");

          if (rpcError && isLockSteal(rpcError.message ?? "") && attempt < 2) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }

          if (!rpcError && rpcData != null) {
            const arr = parseRpcJsonArray(rpcData);
            if (arr.length > 0) {
              const users = arr.map((r) => rowToCustomerUser(r));
              return { users: await mergeCustomerAffiliateFlags(sb, users) };
            }
          }

          const { data, error } = await sb
            .from("customers")
            .select("id,name,email,provider,created_at")
            .order("created_at", { ascending: false });

          if (error && isLockSteal(error.message ?? "") && attempt < 2) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }

          if (error) throw new Error(rpcError?.message ?? error.message);
          const users = (data ?? []).map((r) => rowToCustomerUser(r as Record<string, unknown>));
          if (users.length > 0) return { users: await mergeCustomerAffiliateFlags(sb, users) };
          if (rpcError) {
            const msg = rpcError.message ?? "";
            if (/does not exist|not found|schema cache|Could not find|PGRST202/i.test(msg)) {
              throw new Error(
                "No se pudo cargar el listado de clientes. En el SQL Editor de Supabase ejecutá el archivo supabase/tradexpar_admin_list_customers.sql (función admin_list_customers) y volvé a intentar."
              );
            }
            throw new Error(msg);
          }
          return { users: await mergeCustomerAffiliateFlags(sb, users) };
        }

        throw new Error("No se pudo cargar usuarios. Reintentá en un momento.");
      })(),
      "Usuarios"
    );
  },

  adminUpdateCustomer: async (customerId: string, patch: { name: string; email: string }) => {
    const sb = await txAdmin();
    const { data, error } = await sb.rpc("admin_update_customer", {
      p_customer_id: customerId,
      p_name: patch.name.trim(),
      p_email: patch.email.trim(),
    });
    if (error) throw new Error(error.message);
    const o = data as Record<string, unknown> | null;
    if (!o || o.ok !== true) {
      const r = String(o?.reason ?? "");
      if (r === "email_taken") throw new Error("Ese correo ya está registrado en otro cliente.");
      if (r === "name_and_email_required") throw new Error("Nombre y correo son obligatorios.");
      if (r === "not_found") throw new Error("Cliente no encontrado.");
      throw new Error("No se pudo actualizar el cliente.");
    }
  },

  /**
   * Asigna contraseña nueva al usuario de Auth del cliente (sin pedir la actual).
   * 1) RPC `admin_set_customer_auth_password` (recomendado en self-hosted; ejecutar SQL del repo).
   * 2) Si el RPC no existe, intenta la Edge Function `admin-set-customer-password` (Supabase Cloud).
   */
  adminSetCustomerPassword: async (customerId: string, newPassword: string) => {
    const useEdgeOnly = import.meta.env.VITE_ADMIN_PASSWORD_VIA_EDGE === "true";
    if (!useEdgeOnly) {
      const sb = await txAdmin();
      const { data, error } = await sb.rpc("admin_set_customer_auth_password", {
        p_customer_id: customerId,
        p_password: newPassword,
      });
      let parsed: Record<string, unknown> | null = null;
      if (data != null && typeof data === "object" && !Array.isArray(data)) {
        parsed = data as Record<string, unknown>;
      } else if (typeof data === "string") {
        try {
          const j = JSON.parse(data) as unknown;
          if (j && typeof j === "object" && !Array.isArray(j)) parsed = j as Record<string, unknown>;
        } catch {
          parsed = null;
        }
      }
      if (!error && parsed) {
        if (parsed.ok === true) return;
        if (parsed.ok === false) throwSetPasswordRpcReason(parsed);
      }
      if (error) {
        const em = error.message ?? "";
        if (isRpcMissingError(em)) {
          await adminSetCustomerPasswordViaEdge(customerId, newPassword);
          return;
        }
        throw new Error(em);
      }
      await adminSetCustomerPasswordViaEdge(customerId, newPassword);
      return;
    }
    await txAdmin();
    await adminSetCustomerPasswordViaEdge(customerId, newPassword);
  },

  adminDeleteCustomer: async (
    customerId: string
  ): Promise<{ affiliate: "none" | "deleted" | "unlinked_suspended" }> => {
    const sb = await txAdmin();
    const { data, error } = await sb.rpc("admin_delete_customer", { p_customer_id: customerId });
    if (error) throw new Error(error.message);
    const o = data as Record<string, unknown> | null;
    if (!o || o.ok !== true) {
      const r = String(o?.reason ?? "");
      if (r === "not_found") throw new Error("Cliente no encontrado.");
      throw new Error("No se pudo eliminar el cliente.");
    }
    const a = o.affiliate;
    const affiliate =
      a === "deleted" || a === "unlinked_suspended" || a === "none" ? a : "none";
    return { affiliate };
  },

  adminCreateProduct: async (payload: Partial<Product>) => {
    const { data, error } = await (await txAdmin())
      .from("products")
      .insert(productToRow(payload))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapProduct(data as Record<string, unknown>);
  },

  adminUpdateProduct: async (productId: string, payload: Partial<Product>) => {
    const { data, error } = await (await txAdmin())
      .from("products")
      .update(productToRow(payload))
      .eq("id", productId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapProduct(data as Record<string, unknown>);
  },

  adminDeleteProduct: async (productId: string) => {
    const { error } = await (await txAdmin()).from("products").delete().eq("id", productId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  syncStoreCustomer: async (): Promise<CustomerUser | null> => {
    if (!isSupabaseConfigured()) {
      clearOAuthReturnPending();
      return null;
    }
    try {
      return await syncStoreCustomerInner();
    } finally {
      clearOAuthReturnPending();
    }
  },
};

/**
 * Sin `runAuthExclusive` aquí: durante `initialize()` GoTrue puede emitir `INITIAL_SESSION` y
 * `CustomerAuthContext` llama otra vez a `syncStoreCustomer`; si ambas usan la misma cadena
 * `runAuthExclusive`, la segunda espera a la primera y la primera espera la segunda → login colgado.
 * Las operaciones de Auth siguen serializadas por el cliente de Supabase (lock nativo + cola interna).
 */
async function syncStoreCustomerInner(): Promise<CustomerUser | null> {
  if (!isSupabaseConfigured()) return null;
  const auth = getSupabaseAuth().auth;
  /** `initialize()` puede limpiar el hash; guardar antes si venimos de OAuth. */
  const oauthReturn = isOAuthCallbackUrl() || isOAuthReturnPending();
  await auth.initialize();
  let session = (await auth.getSession()).data.session;
  /** Tras redirect OAuth (PKCE puede tardar), la sesión puede aparecer tarde. */
  if (oauthReturn && !session?.user) {
    /** ~4s máx.; el hydrate global lleva otro timeout para no colgar la app. */
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      session = (await auth.getSession()).data.session;
      if (session?.user) break;
    }
  }
  if (!session?.user) return null;
  if (session.access_token) setDataClientAccessToken(session.access_token);
  const { data: gu } = await auth.getUser();
  const u = gu.user ?? session.user;
  const uid = u.id;
  let row = await fetchCustomerByAuthId(uid);
  if (row) return rowToCustomerUser(row);

  const prov = oauthProviderFromUser(u);
  if (prov !== "google" && prov !== "facebook") return null;

  const oauthIdentity = u.identities?.find((i) => i.provider === "google" || i.provider === "facebook");
  const emailFromIdentity =
    oauthIdentity && oauthIdentity.identity_data && typeof oauthIdentity.identity_data === "object"
      ? String((oauthIdentity.identity_data as { email?: string }).email ?? "").trim()
      : "";
  const email = (u.email ?? session.user.email ?? emailFromIdentity ?? "").trim();
  if (!email) return null;

  const name =
    (u.user_metadata?.full_name as string) ||
    (u.user_metadata?.name as string) ||
    (session.user.user_metadata?.full_name as string) ||
    (session.user.user_metadata?.name as string) ||
    email.split("@")[0] ||
    "Usuario";

  const sb = tx();
  const { data: rpcData, error: rpcErr } = await sb.rpc("upsert_customer_oauth", {
    p_name: name,
    p_email: email,
    p_provider: prov,
  });
  if (!rpcErr && rpcData != null) {
    const raw =
      typeof rpcData === "string"
        ? (JSON.parse(rpcData) as Record<string, unknown>)
        : (rpcData as Record<string, unknown>);
    return rowToCustomerUser(raw);
  }
  const rpcMsg = rpcErr?.message ?? "";
  const rpcMissing =
    rpcErr &&
    (rpcMsg.includes("Could not find") ||
      rpcMsg.includes("does not exist") ||
      rpcMsg.includes("schema cache") ||
      rpcErr.code === "PGRST202");
  if (rpcErr && !rpcMissing) {
    throw new Error(rpcErr.message);
  }

  const { error: insErr } = await sb.from("customers").insert({
    auth_user_id: uid,
    name,
    email,
    provider: prov,
  });
  if (insErr) throw new Error(insErr.message);
  row = await fetchCustomerByAuthId(uid);
  return row ? rowToCustomerUser(row) : null;
}
