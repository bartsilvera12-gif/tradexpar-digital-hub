import { motion, useReducedMotion } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  Compass,
  Cog,
  Gem,
  Globe2,
  Hexagon,
  LayoutGrid,
  Lightbulb,
  LineChart,
  Network,
  Package,
  Share2,
  Sparkles,
  Users,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SOBRE_TRADEXPAR_IMAGES, SOBRE_TRADEXPAR_ALT, SOBRE_TRADEXPAR_NARRATIVE_FRAME } from "@/config/aboutImagery";

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-48px" },
  transition: { duration: 0.5, ease: easeOut },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.06 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOut } },
};

function SectionEyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-bold uppercase tracking-[0.24em] text-primary", className)}>{children}</p>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "flex flex-wrap items-center justify-center gap-3 text-balance text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl",
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-[0_0_24px_-4px_hsl(195_89%_47%/0.35)] ring-1 ring-primary/25">
        <Icon className="h-6 w-6 shrink-0" strokeWidth={1.75} />
      </span>
      <span>{children}</span>
    </h2>
  );
}

function SectionDivider() {
  return (
    <div className="flex w-full justify-center py-6 sm:py-8" aria-hidden>
      <div className="relative h-px w-full max-w-lg overflow-hidden rounded-full bg-gradient-to-r from-transparent via-primary/35 to-transparent">
        <motion.div
          className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-primary/60 to-transparent"
          initial={{ x: "-100%" }}
          whileInView={{ x: "400%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

function HeroOrbs({ reduced }: { reduced: boolean }) {
  if (reduced) return null;
  return (
    <>
      <motion.div
        className="pointer-events-none absolute -left-20 top-1/4 h-[min(55vw,420px)] w-[min(55vw,420px)] rounded-full bg-primary/15 blur-[100px]"
        animate={{ scale: [1, 1.06, 1], opacity: [0.45, 0.6, 0.45] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -right-24 bottom-0 h-[min(50vw,380px)] w-[min(50vw,380px)] rounded-full bg-primary/10 blur-[90px]"
        animate={{ scale: [1, 1.08, 1], y: [0, -16, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
    </>
  );
}

export default function AboutTradexparPage() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative min-h-[50vh] overflow-x-hidden bg-background">
      {/* —— Hero —— */}
      <section className="relative isolate min-h-[min(88vh,760px)] overflow-hidden border-b border-border/40">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,hsl(195_89%_47%_/_0.22),transparent_55%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.12] via-background/80 to-muted/50"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_35%,black,transparent)]"
          aria-hidden
        />
        <HeroOrbs reduced={Boolean(reduceMotion)} />

        <div className="relative z-[1] mx-auto flex min-h-[min(88vh,760px)] max-w-5xl flex-col items-center justify-center px-4 pb-20 pt-24 text-center sm:px-8 sm:pb-24 sm:pt-28">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: easeOut }}
          >
            <h1 className="text-[2.5rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground text-balance drop-shadow-sm sm:text-6xl lg:text-[4rem]">
              Sobre <span className="text-gradient">Tradexpar</span>
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-base font-medium leading-relaxed text-pretty text-muted-foreground/95 sm:text-lg sm:leading-relaxed">
              Distribuidora digital con visión contemporánea: orden, ejecución y flexibilidad para acercar productos de
              calidad a quienes los buscan.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="relative">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/40 via-background to-muted/30"
          aria-hidden
        />

        <div className="relative mx-auto max-w-6xl space-y-16 px-4 py-16 sm:space-y-20 sm:px-6 sm:py-20 lg:space-y-24 lg:px-10 lg:py-24">
          {/* —— Identidad —— */}
          <motion.section {...fadeUp} className="scroll-mt-8">
            <div className="text-center">
              <SectionEyebrow>Identidad</SectionEyebrow>
              <SectionTitle icon={Compass}>Nuestra identidad</SectionTitle>
            </div>
            <div className="mt-12 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className="order-2 space-y-5 text-center text-base leading-[1.75] text-pretty text-muted-foreground sm:text-[17px] sm:leading-[1.8] lg:order-1 lg:text-left">
                <p>
                  <strong className="font-semibold text-foreground">Tradexpar</strong> es una{" "}
                  <strong className="font-medium text-foreground">distribuidora digital</strong> que trabaja con un modelo
                  de comercialización claro, actual y sostenible.
                </p>
                <p>
                  Conectamos productos con el mercado mediante procesos ágiles, comunicación transparente y herramientas
                  pensadas para el comercio de hoy.
                </p>
                <p className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent p-5 font-semibold text-foreground/95 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)] sm:p-6">
                  No solo movemos stock: damos estructura a la forma en que los productos llegan a las personas.
                </p>
              </div>
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, ease: easeOut }}
                className="order-1 lg:order-2"
              >
                <div
                  className={cn(
                    "relative overflow-hidden rounded-3xl border border-border/50 shadow-[0_24px_60px_-28px_hsl(213_63%_17%/0.2)] ring-1 ring-primary/10",
                    SOBRE_TRADEXPAR_NARRATIVE_FRAME.distribuidoraDigital
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-transparent" aria-hidden />
                  <img
                    src={SOBRE_TRADEXPAR_IMAGES.distribuidoraDigital}
                    alt={SOBRE_TRADEXPAR_ALT.distribuidoraDigital}
                    className="absolute inset-0 h-full w-full object-cover object-center"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent" aria-hidden />
                </div>
              </motion.div>
            </div>
          </motion.section>

          <SectionDivider />

          {/* —— Enfoque —— */}
          <motion.section {...fadeUp}>
            <div className="text-center">
              <SectionEyebrow>Metodología</SectionEyebrow>
              <SectionTitle icon={Hexagon}>Enfoque</SectionTitle>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
                Tres pilares que guían cada decisión operativa y cada experiencia en la tienda.
              </p>
            </div>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-32px" }}
              className="mt-12 grid gap-6 sm:grid-cols-3"
            >
              {[
                {
                  n: "01",
                  title: "Estructura",
                  desc: "Procesos definidos que aseguran orden, trazabilidad y consistencia en cada paso.",
                },
                {
                  n: "02",
                  title: "Ejecución",
                  desc: "Capacidad real para llevar productos al mercado con rapidez y estándares claros.",
                },
                {
                  n: "03",
                  title: "Adaptación",
                  desc: "Canales digitales integrados a la dinámica comercial, sin fricción para el cliente.",
                },
              ].map((item) => (
                <motion.div
                  key={item.title}
                  variants={staggerItem}
                  whileHover={reduceMotion ? undefined : { y: -6, transition: { duration: 0.25 } }}
                  className="group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-card to-card/40 p-6 text-center shadow-card ring-1 ring-black/[0.03] transition-shadow duration-300 hover:border-primary/30 hover:shadow-[0_20px_50px_-24px_hsl(195_89%_47%/0.22)] sm:p-8"
                >
                  <div
                    className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/15 blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-70"
                    aria-hidden
                  />
                  <p className="font-light tabular-nums text-5xl leading-none text-primary/[0.2] transition-colors duration-300 group-hover:text-primary/30 sm:text-6xl">
                    {item.n}
                  </p>
                  <h3 className="mt-4 text-lg font-bold tracking-tight text-foreground">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">{item.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.section>

          <SectionDivider />

          {/* —— Operación —— */}
          <motion.section {...fadeUp}>
            <div className="text-center">
              <SectionEyebrow>Operación</SectionEyebrow>
              <SectionTitle icon={Cog}>Operación</SectionTitle>
            </div>
            <div className="mt-12 space-y-10">
              <div className="mx-auto max-w-3xl rounded-3xl border border-border/50 bg-card/50 p-6 text-center shadow-inner backdrop-blur-sm sm:p-8">
                <p className="text-base leading-[1.75] text-pretty text-muted-foreground sm:text-[17px] sm:leading-[1.8]">
                  Integramos gestión, canales digitales y seguimiento en un mismo sistema de trabajo:
                </p>
              </div>
              <ul className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2">
                {[
                  { text: "Gestión y curaduría de productos", icon: Package },
                  { text: "Comercialización en entornos digitales", icon: Share2 },
                  { text: "Coordinación operativa entre actores", icon: Network },
                  { text: "Seguimiento y mejora continua", icon: LineChart },
                ].map((row, i) => (
                  <motion.li
                    key={row.text}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06, duration: 0.4, ease: easeOut }}
                    className="flex items-center gap-4 rounded-2xl border border-border/50 bg-gradient-to-r from-card/90 to-muted/20 px-4 py-4 shadow-sm transition-all duration-300 hover:border-primary/25 hover:shadow-md sm:px-5 sm:py-4"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
                      <row.icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="text-left text-base font-medium leading-snug text-foreground/90">{row.text}</span>
                  </motion.li>
                ))}
              </ul>
              <p className="mx-auto max-w-3xl rounded-2xl border border-primary/20 bg-primary/[0.05] px-6 py-5 text-center text-base font-semibold leading-relaxed text-foreground sm:px-8 sm:py-6 sm:text-[17px]">
                Cada etapa apunta al mismo objetivo: eficiencia y confianza en la venta.
              </p>
            </div>
          </motion.section>

          <SectionDivider />

          {/* —— Contexto —— */}
          <motion.section
            {...fadeUp}
            className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] via-muted/30 to-background px-5 py-12 shadow-[0_24px_70px_-40px_hsl(195_89%_47%/0.25)] sm:px-10 sm:py-16"
          >
            <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden />
            <div className="relative text-center">
              <SectionEyebrow className="text-primary">Mercado</SectionEyebrow>
              <SectionTitle icon={Globe2}>Contexto</SectionTitle>
              <p className="mx-auto mt-6 max-w-3xl text-base leading-[1.75] text-pretty text-muted-foreground sm:text-[17px]">
                Entendemos el entorno local: hoy el mercado exige experiencias simples, mensajes claros y confianza en
                cada clic.
              </p>
            </div>
            <div className="relative mx-auto mt-10 flex max-w-3xl flex-col gap-3">
              {[
                "Simplicidad en la experiencia de compra",
                "Claridad en precios, stock y entregas",
                "Confianza en cada interacción con la marca",
              ].map((t, i) => (
                <motion.div
                  key={t}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className="flex items-start gap-3 rounded-2xl border border-border/40 bg-card/70 px-4 py-3.5 text-left shadow-sm backdrop-blur-md sm:items-center sm:px-5 sm:py-4"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-0" strokeWidth={2} />
                  <span className="text-sm font-medium leading-relaxed text-foreground/90 sm:text-base">{t}</span>
                </motion.div>
              ))}
            </div>
            <p className="relative mx-auto mt-10 max-w-2xl text-center text-base font-semibold text-foreground">
              Por eso diseñamos la tienda y los procesos desde esa realidad.
            </p>
          </motion.section>

          <SectionDivider />

          {/* —— Base operativa —— */}
          <motion.section {...fadeUp}>
            <div className="text-center">
              <SectionEyebrow>Plataforma</SectionEyebrow>
              <SectionTitle icon={Boxes}>Base operativa</SectionTitle>
              <p className="mx-auto mt-6 max-w-3xl text-base leading-[1.75] text-pretty text-muted-foreground sm:text-[17px]">
                <strong className="font-semibold text-foreground">Tradexpar</strong> articula dos dimensiones que se
                complementan:
              </p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              {[
                {
                  title: "Dimensión operativa",
                  body: "Gestión, coordinación y control de procesos comerciales con criterios profesionales.",
                },
                {
                  title: "Dimensión digital",
                  body: "Plataformas y canales que hacen accesible el catálogo y acompañan al cliente de punta a punta.",
                },
              ].map((b, i) => (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.45 }}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                  className="rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/20 p-8 shadow-card ring-1 ring-primary/5 transition-shadow duration-300 hover:border-primary/25 hover:shadow-card-hover sm:p-10"
                >
                  <h3 className="text-xl font-bold tracking-tight text-foreground">{b.title}</h3>
                  <div className="mt-4 h-px w-12 rounded-full bg-gradient-to-r from-primary to-primary/20" aria-hidden />
                  <p className="mt-5 text-base leading-relaxed text-pretty text-muted-foreground">{b.body}</p>
                </motion.div>
              ))}
            </div>
            <p className="mx-auto mt-10 max-w-3xl text-center leading-relaxed text-pretty text-muted-foreground">
              Esa combinación permite operar con estabilidad y escalar sin perder claridad.
            </p>
          </motion.section>

          <SectionDivider />

          {/* —— Relación con el mercado —— */}
          <motion.section {...fadeUp}>
            <div className="text-center">
              <SectionEyebrow>Ecosistema</SectionEyebrow>
              <SectionTitle icon={Users}>Relación con el mercado</SectionTitle>
              <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-pretty text-muted-foreground">
                Trabajamos con distintos perfiles que comparten la necesidad de canales serios y productos bien presentados:
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { text: "Empresas que quieren posicionar productos con respaldo", icon: Building2 },
                { text: "Equipos y personas ligadas a la comercialización", icon: Users },
                { text: "Emprendedores que construyen su propio canal de ventas", icon: Lightbulb },
              ].map((row, i) => (
                <motion.div
                  key={row.text}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.45 }}
                  whileHover={reduceMotion ? undefined : { y: -5 }}
                  className="flex flex-col rounded-2xl border border-border/55 bg-card/80 p-6 text-center shadow-sm ring-1 ring-black/[0.02] transition-all duration-300 hover:border-primary/30 hover:shadow-lg dark:ring-white/[0.04] sm:p-7"
                >
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner">
                    <row.icon className="h-7 w-7" strokeWidth={1.65} />
                  </span>
                  <p className="mt-5 text-sm font-medium leading-relaxed text-pretty text-foreground/90 sm:text-base">{row.text}</p>
                </motion.div>
              ))}
            </div>
            <p className="mx-auto mt-10 max-w-3xl text-center text-base font-semibold text-foreground/90">
              Nuestro rol es ordenar el entorno para que esas relaciones fluyan con menos fricción.
            </p>
          </motion.section>

          <SectionDivider />

          {/* —— Criterios —— */}
          <motion.section {...fadeUp}>
            <div className="text-center">
              <SectionEyebrow>Valores</SectionEyebrow>
              <SectionTitle icon={Gem}>Criterios de trabajo</SectionTitle>
              <p className="mx-auto mt-6 max-w-3xl text-base text-pretty text-muted-foreground">
                En <strong className="font-semibold text-foreground">Tradexpar</strong> sostenemos estándares explícitos:
              </p>
            </div>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-24px" }}
              className="mt-12 grid gap-5 sm:grid-cols-2"
            >
              {[
                { title: "Claridad", desc: "Procesos y mensajes comprensibles para todos los actores." },
                { title: "Consistencia", desc: "Misma calidad de servicio en el tiempo, pedido tras pedido." },
                { title: "Responsabilidad", desc: "Compromiso con lo acordado en cada operación." },
                { title: "Evolución", desc: "Mejora continua de sistemas, catálogo y experiencia." },
              ].map((item) => (
                <motion.div
                  key={item.title}
                  variants={staggerItem}
                  whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card to-muted/25 p-7 text-center shadow-sm transition-shadow duration-300 hover:border-primary/25 hover:shadow-md sm:text-left"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-80" aria-hidden />
                  <div className="mb-3 flex justify-center sm:justify-start">
                    <LayoutGrid className="h-5 w-5 text-primary/80 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">{item.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.section>

          {/* —— Cierre —— */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, ease: easeOut }}
            className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-secondary via-secondary to-secondary/95 px-6 py-14 text-center text-primary-foreground shadow-[0_28px_80px_-32px_hsl(213_63%_12%/0.55)] sm:px-10 sm:py-16"
          >
            <div className="pointer-events-none absolute -left-16 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-primary/20 blur-[100px]" aria-hidden />
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/15 blur-3xl" aria-hidden />
            <div className="relative">
              <SectionEyebrow className="text-primary-foreground/70">En síntesis</SectionEyebrow>
              <h2 className="mx-auto mt-4 flex flex-wrap items-center justify-center gap-3 text-3xl font-extrabold tracking-tight text-balance text-primary-foreground sm:text-4xl">
                <Sparkles className="h-8 w-8 shrink-0 text-primary" strokeWidth={1.75} />
                Qué es Tradexpar
              </h2>
              <p className="mx-auto mt-8 max-w-3xl text-base font-medium leading-relaxed text-pretty text-primary-foreground/90 sm:text-lg md:text-xl">
                <strong className="text-primary-foreground">Tradexpar</strong> es una distribuidora digital que organiza,
                gestiona y facilita la comercialización de productos en Paraguay, con un modelo estructurado y alineado a
                los canales que el mercado utiliza hoy.
              </p>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
