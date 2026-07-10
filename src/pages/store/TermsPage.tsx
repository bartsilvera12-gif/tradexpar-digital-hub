import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";

const SECTIONS = [
  {
    title: "1. Aceptación",
    body: "Al acceder a Tradexpar, crear una cuenta o realizar una compra, aceptás estas condiciones. Si no estás de acuerdo, no utilices el sitio.",
  },
  {
    title: "2. Cuentas",
    body: "Podés registrarte con tu email o mediante Google o Facebook. Sos responsable de mantener la confidencialidad de tus credenciales y de la actividad realizada desde tu cuenta. Podemos suspender cuentas ante uso fraudulento o incumplimiento de estas condiciones.",
  },
  {
    title: "3. Productos y precios",
    body: "Los precios se expresan en guaraníes e incluyen impuestos, salvo indicación contraria. Procuramos que la información de los productos sea exacta, pero pueden existir errores de descripción, stock o precio. Ante un error evidente, podemos cancelar el pedido y reintegrar el importe abonado.",
  },
  {
    title: "4. Pedidos y pagos",
    body: "El pedido se confirma una vez acreditado el pago. Nos reservamos el derecho de rechazar o cancelar pedidos por falta de stock, sospecha de fraude o datos de envío incorrectos.",
  },
  {
    title: "5. Envíos",
    body: "Los plazos de entrega son estimados y pueden variar según la zona y el servicio de logística. Los costos de envío se muestran antes de confirmar la compra.",
  },
  {
    title: "6. Cambios y devoluciones",
    body: "Podés solicitar cambio o devolución dentro de los 7 días de recibido el producto, siempre que se encuentre sin uso y en su empaque original. Escribinos para coordinar el proceso.",
  },
  {
    title: "7. Programa de afiliados",
    body: "La participación en el programa de afiliados está sujeta a aprobación. Las comisiones se liquidan sobre pedidos efectivamente pagados y no cancelados. El uso de spam, publicidad engañosa o marca no autorizada da lugar a la baja del programa.",
  },
  {
    title: "8. Propiedad intelectual",
    body: "Las marcas, textos, imágenes y demás contenidos del sitio pertenecen a Tradexpar o a sus titulares y no pueden reproducirse sin autorización.",
  },
  {
    title: "9. Responsabilidad",
    body: "El sitio se ofrece tal como está. No garantizamos disponibilidad ininterrumpida ni respondemos por daños indirectos derivados del uso del servicio.",
  },
  {
    title: "10. Cambios en las condiciones",
    body: "Podemos actualizar estas condiciones en cualquier momento. La versión vigente es la publicada en esta página.",
  },
  {
    title: "11. Ley aplicable",
    body: "Estas condiciones se rigen por las leyes de la República del Paraguay y se someten a la jurisdicción de los tribunales de Asunción.",
  },
];

export default function TermsPage() {
  useEffect(() => {
    document.title = "Condiciones del Servicio — Tradexpar";
    return () => {
      document.title = "Tradexpar — Distribución Digital Premium";
    };
  }, []);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-primary/[0.08] to-transparent" aria-hidden />
      <div className="relative mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Inicio
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Condiciones del Servicio
          </h1>
        </div>

        <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          <p>
            Estas condiciones regulan el uso del sitio de Tradexpar y la compra de productos a través de él.
          </p>

          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-base font-semibold text-foreground sm:text-lg">{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}

          <p>
            Para consultas:{" "}
            <a
              href="mailto:info@tradexpar.com.py"
              className="font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
            >
              info@tradexpar.com.py
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
