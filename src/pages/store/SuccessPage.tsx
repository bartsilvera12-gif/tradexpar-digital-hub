import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { api } from "@/services/api";

export default function SuccessPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<string>("pending");
  const [displayOrderId, setDisplayOrderId] = useState("");

  const orderId = searchParams.get("order_id") || sessionStorage.getItem("tradexpar_order_id") || "";
  const ref = searchParams.get("ref") || sessionStorage.getItem("tradexpar_payment_ref") || "";
  const hashFromReturn = searchParams.get("hash") || "";

  useEffect(() => {
    const hash = hashFromReturn;
    if (!orderId && !hash) return;
    if (orderId && !ref && !hash) return;
    let active = true;

    const poll = async () => {
      for (let i = 0; i < 30; i++) {
        if (!active) return;
        try {
          const data = orderId
            ? await api.getPaymentStatus(orderId, ref, hash || undefined)
            : await api.getPaymentStatusByHash(hash, ref || undefined);

          if (data.order_id) {
            if (!sessionStorage.getItem("tradexpar_order_id")) {
              sessionStorage.setItem("tradexpar_order_id", data.order_id);
            }
            setDisplayOrderId(data.order_id);
          }
          if (data.ref && !sessionStorage.getItem("tradexpar_payment_ref")) {
            sessionStorage.setItem("tradexpar_payment_ref", data.ref);
          }

          if (data.status === "approved" || data.status === "completed" || data.status === "paid") {
            setStatus("approved");
            return;
          }
          if (data.status === "rejected" || data.status === "failed") {
            setStatus("rejected");
            return;
          }
        } catch { /* continue polling */ }
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

  return (
    <div className="container mx-auto px-4 py-20 flex flex-col items-center text-center">
      <div className="mb-6">{c.icon}</div>
      <h1 className="text-3xl font-bold text-foreground mb-4">{c.title}</h1>
      <p className="text-muted-foreground max-w-md mb-8">{c.desc}</p>
      {displayOrderId && (
        <p className="text-sm text-muted-foreground mb-8">
          Pedido: <span className="font-mono text-foreground">{displayOrderId}</span>
        </p>
      )}
      <Link to="/" className="inline-flex px-6 py-3 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">
        Volver al inicio
      </Link>
    </div>
  );
}
