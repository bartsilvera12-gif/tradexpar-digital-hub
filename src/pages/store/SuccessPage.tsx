import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, Clock, XCircle, Copy, Check, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import type { PaymentStatus } from "@/types";

export default function SuccessPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<string>("pending");
  const [displayOrderId, setDisplayOrderId] = useState("");
  const [copied, setCopied] = useState(false);

  const orderId = searchParams.get("order_id") || sessionStorage.getItem("tradexpar_order_id") || "";
  const ref = searchParams.get("ref") || sessionStorage.getItem("tradexpar_payment_ref") || "";
  const hashFromReturn = searchParams.get("hash") || "";

  useEffect(() => {
    const hash = hashFromReturn;
    if (!orderId && !hash) return;
    if (orderId && !ref && !hash) return;
    let active = true;

    const mapStatus = (s: string) => {
      if (s === "approved" || s === "completed" || s === "paid") {
        return "approved" as const;
      }
      if (s === "rejected" || s === "failed") {
        return "rejected" as const;
      }
      return "pending" as const;
    };

    const applyPaymentPayload = (data: PaymentStatus) => {
      if (data.order_id) {
        if (!sessionStorage.getItem("tradexpar_order_id")) {
          sessionStorage.setItem("tradexpar_order_id", data.order_id);
        }
        setDisplayOrderId(data.order_id);
      }
      if (data.ref && !sessionStorage.getItem("tradexpar_payment_ref")) {
        sessionStorage.setItem("tradexpar_payment_ref", data.ref);
      }
      return mapStatus(data.status);
    };

    const poll = async () => {
      for (let i = 0; i < 30; i++) {
        if (!active) return;
        try {
          if (hash && i === 0) {
            try {
              const sync = await api.getPagoparStatus(hash);
              if (!active) return;
              const s = applyPaymentPayload(sync);
              if (s === "approved" || s === "rejected") {
                setStatus(s);
                return;
              }
            } catch {
              /* luego: lectura vía payment-status (Supabase) */
            }
          }

          const data = orderId
            ? await api.getPaymentStatus(orderId, ref, hash || undefined)
            : await api.getPaymentStatusByHash(hash, ref || undefined);

          if (!active) return;
          const s = applyPaymentPayload(data);
          if (s === "approved" || s === "rejected") {
            setStatus(s);
            return;
          }
        } catch {
          /* continuar */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      setStatus("timeout");
    };

    if (orderId) setDisplayOrderId(orderId);
    void poll();
    return () => {
      active = false;
    };
  }, [orderId, ref, hashFromReturn]);

  const config: Record<string, { icon: React.ReactNode; title: string; desc: string }> = {
    pending: {
      icon: <Clock className="h-16 w-16 text-primary" />,
      title: "Procesando tu pago...",
      desc: "Estamos verificando tu transacción. Esto puede tomar unos momentos.",
    },
    approved: {
      icon: <CheckCircle className="h-16 w-16 text-green-500" />,
      title: "¡Pago confirmado!",
      desc: "Tu pedido ha sido procesado exitosamente. Recibirás un email de confirmación.",
    },
    rejected: {
      icon: <XCircle className="h-16 w-16 text-destructive" />,
      title: "Pago rechazado",
      desc: "Hubo un problema con tu pago. Intenta nuevamente o contacta soporte.",
    },
    timeout: {
      icon: <Clock className="h-16 w-16 text-muted-foreground" />,
      title: "Verificación en proceso",
      desc: "No pudimos confirmar tu pago automáticamente. Recibirás una notificación pronto.",
    },
  };

  const c = config[status] || config.pending;

  const handleCopy = async () => {
    if (!displayOrderId) return;
    try {
      await navigator.clipboard.writeText(displayOrderId);
      setCopied(true);
      toast.success("Código del pedido copiado");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error("No se pudo copiar. Seleccioná el código manualmente.");
    }
  };

  const showOrderCard = Boolean(displayOrderId);
  const isApproved = status === "approved";

  return (
    <div className="container mx-auto px-4 py-12 sm:py-20 flex flex-col items-center text-center max-w-2xl">
      <div className="mb-6">{c.icon}</div>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">{c.title}</h1>
      <p className="text-muted-foreground max-w-md mb-8 [text-wrap:balance]">{c.desc}</p>

      {showOrderCard && (
        <div
          className={
            "w-full mb-8 rounded-2xl border-2 px-4 py-5 sm:px-6 sm:py-6 text-left shadow-sm " +
            (isApproved
              ? "border-green-500/40 bg-green-500/5"
              : "border-primary/30 bg-primary/5")
          }
          aria-live="polite"
        >
          <div className="flex items-center gap-2 mb-2 text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <BookmarkCheck className="h-4 w-4 text-primary" aria-hidden />
            Código de tu pedido
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-3 mb-3">
            <code
              className="flex-1 min-w-0 break-all font-mono text-base sm:text-lg font-semibold text-foreground bg-background/60 border border-border/70 rounded-lg px-3 py-2.5 select-all"
              aria-label="Código del pedido"
            >
              {displayOrderId}
            </code>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="shrink-0 inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-muted/50 active:bg-muted transition-colors text-sm font-medium text-foreground touch-manipulation"
              aria-label="Copiar código del pedido"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" aria-hidden />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden />
                  Copiar código
                </>
              )}
            </button>
          </div>

          <p className="text-xs sm:text-sm text-foreground/85 [text-wrap:balance]">
            <span className="font-semibold">Guardá este número de pedido.</span>{" "}
            Vas a poder utilizarlo para realizar consultas o reclamos sobre tu compra.
          </p>
        </div>
      )}

      <Link
        to="/"
        className="inline-flex px-6 py-3 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
