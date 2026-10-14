import { motion } from "framer-motion";
import { CreditCard, CalendarClock, Sparkles } from "lucide-react";

/** Matix, personaje de Tradexpar (PNG transparente en public/images/matix). */
const MATIX_SALUDANDO = "/images/matix/matix-saludando.png";

const planes = [
  {
    banco: "Ueno Bank",
    titulo: "12 cuotas sin intereses",
    desc: "Pagá en 12 cuotas fijas con tu tarjeta Ueno, sin recargos ni intereses.",
    icon: CreditCard,
    badge: "Sin intereses",
  },
  {
    banco: "Financiera Paraguayo Japonesa",
    titulo: "Hasta 24 meses",
    desc: "Financiá tu compra hasta en 24 cuotas y empezá a pagar recién a los 60 días.",
    icon: CalendarClock,
    badge: "1ª cuota a los 60 días",
  },
];

/**
 * Sección de financiación con Matix. Muestra los beneficios vigentes con los
 * bancos aliados (Ueno Bank y Financiera Paraguayo Japonesa). Estilo alineado
 * a la marca (gradiente azul + tarjetas con blur), como el resto del home.
 */
export function MatixFinanciacionSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 50%, hsl(195 89% 47%) 0%, transparent 45%), radial-gradient(circle at 85% 30%, hsl(195 89% 60%) 0%, transparent 40%)",
        }}
      />
      <div className="container mx-auto relative z-10 max-w-full py-12 sm:py-16 md:py-20">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,320px),1fr] lg:gap-12">
          {/* Matix */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative mx-auto w-[180px] shrink-0 sm:w-[230px] lg:mx-0 lg:w-full lg:max-w-[320px]"
          >
            <div className="pointer-events-none absolute inset-x-6 bottom-2 h-6 rounded-[50%] bg-black/30 blur-xl" />
            <img
              src={MATIX_SALUDANDO}
              alt="Matix, el personaje de Tradexpar, saludando"
              loading="lazy"
              className="relative mx-auto h-auto w-full drop-shadow-[0_18px_30px_rgba(0,0,0,0.35)]"
            />
          </motion.div>

          {/* Contenido */}
          <div className="text-center lg:text-left">
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-widest text-primary-foreground gradient-celeste sm:text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Financiación
            </motion.span>

            <h2 className="mt-4 text-[clamp(1.35rem,3.5vw+0.4rem,2.75rem)] font-bold leading-tight text-primary-foreground [text-wrap:balance] sm:text-3xl lg:text-4xl">
              Comprá ahora y pagá en cuotas con{" "}
              <span className="text-gradient">Matix</span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-primary-foreground/60 [text-wrap:balance] sm:text-base lg:mx-0">
              Llevate lo que quieras y financialo con nuestros bancos aliados.
              Matix te lo deja fácil 😄
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {planes.map((p) => (
                <motion.div
                  key={p.banco}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5 }}
                  className="group rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.04] p-5 text-left backdrop-blur-md transition-all duration-500 hover:border-primary/40 hover:bg-primary-foreground/[0.08] sm:p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl gradient-celeste text-primary-foreground">
                      <p.icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold text-primary-foreground/80">
                      {p.banco}
                    </span>
                  </div>
                  <p className="mt-4 text-xl font-bold text-primary-foreground sm:text-2xl">
                    {p.titulo}
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-primary/15 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-primary-foreground/90">
                    {p.badge}
                  </span>
                  <p className="mt-3 text-sm leading-relaxed text-primary-foreground/55">
                    {p.desc}
                  </p>
                </motion.div>
              ))}
            </div>

            <p className="mt-5 text-xs text-primary-foreground/40 [text-wrap:balance]">
              Consultá las condiciones vigentes al finalizar tu compra. Sujeto a
              aprobación de cada entidad.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
