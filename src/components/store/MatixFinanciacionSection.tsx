import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, MessageCircle, Headphones } from "lucide-react";
import { getWhatsAppDigits } from "@/config/whatsapp";

/** Matix, personaje de Tradexpar (PNG transparente en public/images/matix). */
const MATIX_SALUDANDO = "/images/matix/matix-saludando-v2.png";

/**
 * Logos de los bancos aliados. Dejá los PNG (fondo transparente o blanco) en
 * public/images/bancos/ con estos nombres y se muestran solos. Si el archivo
 * no existe todavía, se muestra el nombre del banco estilizado.
 */
const UENO_LOGO = "/images/bancos/ueno-bank.png";
const FPJ_LOGO = "/images/bancos/financiera-paraguayo-japonesa.png";

const GREETING =
  "¡Hola Matix! 👋 Vengo desde la web de Tradexpar y quería una recomendación.";

const planes = [
  {
    banco: "Ueno Bank",
    logo: UENO_LOGO,
    titulo: "12 cuotas sin intereses",
    desc: "Pagá en 12 cuotas fijas con tu tarjeta Ueno, sin recargos ni intereses.",
    badge: "Sin intereses",
  },
  {
    banco: "Financiera Paraguayo Japonesa",
    logo: FPJ_LOGO,
    titulo: "Hasta 24 meses",
    desc: "Financiá tu compra hasta en 24 cuotas y empezá a pagar recién a los 60 días.",
    badge: "1ª cuota a los 60 días",
  },
];

/** Logo del banco (PNG) con fallback al nombre estilizado si aún no se cargó. */
function BankLogo({ src, name }: { src: string; name: string }) {
  const [ok, setOk] = useState(true);
  if (ok) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setOk(false)}
        className="h-9 w-auto rounded-lg object-contain shadow-sm sm:h-10"
        loading="lazy"
      />
    );
  }
  return (
    <span className="text-sm font-bold text-primary-foreground sm:text-base">{name}</span>
  );
}

/**
 * Sección de portada con Matix como asesor inteligente de Tradexpar: acompaña,
 * asiste y recomienda (incluida la financiación con los bancos aliados —
 * Ueno Bank y Financiera Paraguayo Japonesa). Estilo de marca (gradiente azul).
 */
export function MatixFinanciacionSection() {
  const waHref = `https://wa.me/${getWhatsAppDigits()}?text=${encodeURIComponent(GREETING)}`;

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
          {/* Matix (saludo animado) */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative mx-auto w-[210px] shrink-0 sm:w-[250px] lg:mx-0 lg:w-full lg:max-w-[340px]"
          >
            <div className="pointer-events-none absolute inset-x-6 bottom-2 h-6 rounded-[50%] bg-black/30 blur-xl" />
            <img
              src={MATIX_SALUDANDO}
              alt="Matix, el asesor inteligente de Tradexpar, saludando"
              className="relative mx-auto h-auto w-full origin-bottom drop-shadow-[0_18px_30px_rgba(0,0,0,0.35)] motion-safe:animate-[matixWave_2.8s_ease-in-out_infinite]"
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
              Asesor inteligente
            </motion.span>

            <h2 className="mt-4 text-[clamp(1.35rem,3.5vw+0.4rem,2.75rem)] font-bold leading-tight text-primary-foreground [text-wrap:balance] sm:text-3xl lg:text-4xl">
              Conocé a <span className="text-gradient">Matix</span>, tu asesor
              siempre listo para ayudarte
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-primary-foreground/60 [text-wrap:balance] sm:text-base lg:mx-0">
              Matix te acompaña y asiste en todo: te ayuda a elegir, responde tus
              dudas y te muestra cómo financiar tu compra en cuotas con nuestros
              bancos aliados. 😄
            </p>

            {/* CTA para hablar con Matix */}
            <div className="mt-5 flex flex-wrap justify-center gap-3 lg:justify-start">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground gradient-celeste shadow-brand transition-opacity hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" />
                Consultá con Matix
              </a>
              <span className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/15 px-4 py-3 text-sm font-medium text-primary-foreground/70">
                <Headphones className="h-4 w-4" />
                Atención 24/7
              </span>
            </div>

            {/* Beneficios de financiación con los bancos aliados */}
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
                  {/* Logo del banco (o nombre estilizado si falta el PNG) */}
                  <div className="flex items-center">
                    <BankLogo src={p.logo} name={p.banco} />
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
