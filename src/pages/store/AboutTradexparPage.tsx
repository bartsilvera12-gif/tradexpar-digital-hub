import { motion } from "framer-motion";
import {
  Compass,
  LayoutGrid,
  Cog,
  Globe2,
  Boxes,
  Users,
  Gem,
  Hexagon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fade = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary mb-3">{children}</p>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  align = "left",
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <h2
      className={cn(
        "text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-3",
        align === "center" && "w-full justify-center text-center text-balance flex-wrap"
      )}
    >
      <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-primary shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </h2>
  );
}

/** Separador entre bloques: centrado respecto al mismo ancho que los textos (max-w-3xl). */
function SectionDivider() {
  return (
    <div className="w-full flex justify-center py-5 sm:py-7" role="presentation" aria-hidden>
      <div className="w-full max-w-3xl mx-auto flex items-center justify-center gap-0 px-1">
        <div className="h-[2px] flex-1 min-w-0 rounded-full bg-gradient-to-r from-transparent via-primary/20 to-primary/45 max-w-[min(42%,18rem)]" />
        <div className="mx-4 sm:mx-8 flex shrink-0 items-center justify-center">
          <div className="relative grid place-items-center">
            <span className="absolute h-8 w-8 rounded-full bg-primary/[0.12] blur-md" />
            <Hexagon className="relative h-5 w-5 sm:h-6 sm:w-6 text-primary/65" strokeWidth={1.65} />
          </div>
        </div>
        <div className="h-[2px] flex-1 min-w-0 rounded-full bg-gradient-to-l from-transparent via-primary/20 to-primary/45 max-w-[min(42%,18rem)]" />
      </div>
    </div>
  );
}

export default function AboutTradexparPage() {
  return (
    <div className="min-h-[60vh] bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/50">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-20%,hsl(195_89%_47%_/_0.14),transparent_50%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-muted/40"
          aria-hidden
        />
        <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-14 sm:py-20 lg:py-24 text-center">
          <motion.div {...fade}>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-foreground tracking-tight text-balance">
              Sobre <span className="text-gradient">Tradexpar</span>
            </h1>
            <p className="mt-6 text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed text-pretty">
              Distribuidora digital con visión contemporánea: orden, ejecución y flexibilidad para acercar productos de
              calidad a quienes los buscan.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Cuerpo — ancho generoso, sin tarjetas */}
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/50 via-background to-muted/30"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-[min(42vw,520px)] bg-[radial-gradient(ellipse_80%_50%_at_0%_30%,hsl(195_89%_47%_/_0.06),transparent_70%)]"
          aria-hidden
        />

        <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-16 sm:py-20 lg:py-28 space-y-20 sm:space-y-28 lg:space-y-32">
          <motion.section {...fade} className="scroll-mt-8 text-center">
            <SectionEyebrow>Identidad</SectionEyebrow>
            <SectionTitle icon={Compass} align="center">
              Nuestra identidad
            </SectionTitle>
            <div className="mt-8 max-w-3xl mx-auto space-y-5 text-base sm:text-[17px] text-muted-foreground leading-[1.7] text-pretty text-center">
              <p>
                <strong className="text-foreground font-semibold">Tradexpar</strong> es una{" "}
                <strong className="text-foreground font-medium">distribuidora digital</strong> que trabaja con un modelo
                de comercialización claro, actual y sostenible.
              </p>
              <p>
                Conectamos productos con el mercado mediante procesos ágiles, comunicación transparente y herramientas
                pensadas para el comercio de hoy.
              </p>
              <p className="text-foreground/90 font-medium">
                No solo movemos stock: damos estructura a la forma en que los productos llegan a las personas.
              </p>
            </div>
          </motion.section>

          <SectionDivider />

          <motion.section {...fade} className="text-center">
            <SectionEyebrow>Metodología</SectionEyebrow>
            <SectionTitle icon={Hexagon} align="center">
              Enfoque
            </SectionTitle>
            <p className="mt-6 text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed text-pretty text-center">
              Tres pilares que guían cada decisión operativa y cada experiencia en la tienda.
            </p>
            <div className="mt-12 grid sm:grid-cols-3 gap-10 sm:gap-8 lg:gap-12 max-w-5xl mx-auto">
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
                <div key={item.title} className="relative pt-2 flex flex-col items-center text-center">
                  <span className="text-4xl sm:text-5xl font-bold text-primary/[0.15] tabular-nums leading-none select-none">
                    {item.n}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-foreground tracking-tight">{item.title}</h3>
                  <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed text-pretty">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.section>

          <SectionDivider />

          <motion.section {...fade} className="text-center">
            <SectionEyebrow>Operación</SectionEyebrow>
            <SectionTitle icon={Cog} align="center">
              Operación
            </SectionTitle>
            <p className="mt-8 max-w-3xl mx-auto text-base sm:text-[17px] text-muted-foreground leading-[1.7] text-pretty text-center">
              Integramos gestión, canales digitales y seguimiento en un mismo sistema de trabajo:
            </p>
            <ul className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-6 max-w-3xl mx-auto justify-items-center">
              {[
                "Gestión y curaduría de productos",
                "Comercialización en entornos digitales",
                "Coordinación operativa entre actores",
                "Seguimiento y mejora continua",
              ].map((t) => (
                <li
                  key={t}
                  className="flex flex-col items-center gap-2 text-base text-muted-foreground leading-relaxed text-center max-w-xs"
                >
                  <span className="h-1 w-8 shrink-0 rounded-full bg-gradient-to-r from-primary/80 to-primary/30" aria-hidden />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-foreground font-medium text-base sm:text-[17px] max-w-3xl mx-auto leading-relaxed text-pretty text-center">
              Cada etapa apunta al mismo objetivo: eficiencia y confianza en la venta.
            </p>
          </motion.section>

          <SectionDivider />

          <motion.section {...fade} className="text-center">
            <SectionEyebrow>Mercado</SectionEyebrow>
            <SectionTitle icon={Globe2} align="center">
              Contexto
            </SectionTitle>
            <div className="mt-8 max-w-3xl mx-auto space-y-6 text-base sm:text-[17px] text-muted-foreground leading-[1.7] text-pretty text-center">
              <p>
                Entendemos el entorno local: hoy el mercado exige experiencias simples, mensajes claros y confianza en
                cada clic.
              </p>
              <ul className="space-y-4 flex flex-col items-center">
                {[
                  "Simplicidad en la experiencia de compra",
                  "Claridad en precios, stock y entregas",
                  "Confianza en cada interacción con la marca",
                ].map((t) => (
                  <li key={t} className="flex flex-col items-center gap-2 max-w-md">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <p className="text-foreground/90 font-medium">Por eso diseñamos la tienda y los procesos desde esa realidad.</p>
            </div>
          </motion.section>

          <SectionDivider />

          <motion.section {...fade} className="text-center">
            <SectionEyebrow>Plataforma</SectionEyebrow>
            <SectionTitle icon={Boxes} align="center">
              Base operativa
            </SectionTitle>
            <p className="mt-8 max-w-3xl mx-auto text-base sm:text-[17px] text-muted-foreground leading-[1.7] text-pretty text-center">
              <strong className="text-foreground font-semibold">Tradexpar</strong> articula dos dimensiones que se
              complementan:
            </p>
            <div className="mt-10 grid lg:grid-cols-2 gap-10 lg:gap-16 max-w-4xl mx-auto lg:divide-x lg:divide-border/60">
              <div className="lg:pr-10 space-y-3 flex flex-col items-center text-center">
                <h3 className="text-lg font-semibold text-foreground">Dimensión operativa</h3>
                <p className="text-base text-muted-foreground leading-relaxed text-pretty">
                  Gestión, coordinación y control de procesos comerciales con criterios profesionales.
                </p>
              </div>
              <div className="lg:pl-10 space-y-3 flex flex-col items-center text-center">
                <h3 className="text-lg font-semibold text-foreground">Dimensión digital</h3>
                <p className="text-base text-muted-foreground leading-relaxed text-pretty">
                  Plataformas y canales que hacen accesible el catálogo y acompañan al cliente de punta a punta.
                </p>
              </div>
            </div>
            <p className="mt-10 max-w-3xl mx-auto text-muted-foreground leading-relaxed text-pretty text-center">
              Esa combinación permite operar con estabilidad y escalar sin perder claridad.
            </p>
          </motion.section>

          <SectionDivider />

          <motion.section {...fade} className="text-center">
            <SectionEyebrow>Ecosistema</SectionEyebrow>
            <SectionTitle icon={Users} align="center">
              Relación con el mercado
            </SectionTitle>
            <p className="mt-8 text-muted-foreground text-base max-w-3xl mx-auto leading-relaxed text-pretty text-center">
              Trabajamos con distintos perfiles que comparten la necesidad de canales serios y productos bien presentados:
            </p>
            <ul className="mt-8 space-y-5 max-w-3xl mx-auto flex flex-col items-center">
              {[
                "Empresas que quieren posicionar productos con respaldo",
                "Equipos y personas ligadas a la comercialización",
                "Emprendedores que construyen su propio canal de ventas",
              ].map((t) => (
                <li
                  key={t}
                  className="flex flex-col items-center gap-2 text-base text-muted-foreground leading-relaxed text-center max-w-lg"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-foreground/90 font-medium text-base max-w-3xl mx-auto leading-relaxed text-pretty text-center">
              Nuestro rol es ordenar el entorno para que esas relaciones fluyan con menos fricción.
            </p>
          </motion.section>

          <SectionDivider />

          <motion.section {...fade} className="text-center">
            <SectionEyebrow>Valores</SectionEyebrow>
            <SectionTitle icon={Gem} align="center">
              Criterios de trabajo
            </SectionTitle>
            <p className="mt-6 text-muted-foreground text-base max-w-3xl mx-auto text-pretty text-center">
              En <strong className="text-foreground font-semibold">Tradexpar</strong> sostenemos estándares explícitos:
            </p>
            <div className="mt-10 grid sm:grid-cols-2 gap-x-14 gap-y-10 max-w-4xl mx-auto">
              {[
                { title: "Claridad", desc: "Procesos y mensajes comprensibles para todos los actores." },
                { title: "Consistencia", desc: "Misma calidad de servicio en el tiempo, pedido tras pedido." },
                { title: "Responsabilidad", desc: "Compromiso con lo acordado en cada operación." },
                { title: "Evolución", desc: "Mejora continua de sistemas, catálogo y experiencia." },
              ].map((item) => (
                <div key={item.title} className="flex flex-col items-center text-center gap-3">
                  <LayoutGrid className="h-5 w-5 text-primary shrink-0" strokeWidth={1.75} />
                  <div>
                    <h3 className="font-semibold text-foreground text-base">{item.title}</h3>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mt-1.5 text-pretty">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section
            {...fade}
            className="relative pt-8 sm:pt-12 border-t border-primary/15 text-center"
          >
            <div
              className="pointer-events-none absolute -inset-x-4 sm:-inset-x-8 top-0 h-32 bg-gradient-to-b from-primary/[0.06] to-transparent rounded-t-[2rem]"
              aria-hidden
            />
            <div className="relative">
              <SectionEyebrow>En síntesis</SectionEyebrow>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex flex-wrap items-center justify-center gap-3 w-full text-center text-balance">
                <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-primary shrink-0" strokeWidth={1.75} />
                Qué es Tradexpar
              </h2>
              <p className="mt-8 text-base sm:text-lg md:text-xl text-foreground/90 leading-relaxed max-w-3xl mx-auto font-medium text-pretty text-center">
                <strong className="text-foreground">Tradexpar</strong> es una distribuidora digital que organiza, gestiona
                y facilita la comercialización de productos en Paraguay, con un modelo estructurado y alineado a los
                canales que el mercado utiliza hoy.
              </p>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
