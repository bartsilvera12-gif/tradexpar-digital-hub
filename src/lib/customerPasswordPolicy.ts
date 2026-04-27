/** `customers.provider`: manual = registro con email+contraseña; google/facebook = solo OAuth. */
export function allowsPasswordFromCustomerProvider(provider: string | undefined): boolean | null {
  const p = (provider ?? "").toLowerCase();
  if (p === "google" || p === "facebook") return false;
  if (p === "manual" || p === "email" || p === "credentials") return true;
  return null;
}

/** Cuentas registradas vía Google o Facebook en la tienda (no asignar contraseña desde el panel admin). */
export function customerProviderBlocksAdminPasswordReset(provider: string | undefined): boolean {
  const p = (provider ?? "").trim().toLowerCase();
  return p === "google" || p === "facebook";
}
