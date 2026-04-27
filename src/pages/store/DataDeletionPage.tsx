import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";

export default function DataDeletionPage() {
  useEffect(() => {
    document.title = "Eliminación de datos — Tradexpar";
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
            <Trash2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Eliminación de datos
          </h1>
        </div>

        <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          <p>
            Si deseas eliminar tu cuenta y todos tus datos asociados, puedes solicitarlo enviando un correo a:
          </p>
          <p>
            <a
              href="mailto:info@tradexpar.com.py"
              className="font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
            >
              info@tradexpar.com.py
            </a>
          </p>
          <p>Procesaremos tu solicitud en un plazo máximo de 72 horas.</p>
        </div>
      </div>
    </div>
  );
}
