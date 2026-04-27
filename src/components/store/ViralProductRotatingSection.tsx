import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Sparkles, TrendingUp } from "lucide-react";
import type { Product } from "@/types";
import { ProductCard } from "./ProductCard";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 3000;
const VISIBLE_COUNT = 4;

function takeVisibleRotating(all: Product[], start: number): Product[] {
  if (all.length === 0) return [];
  if (all.length <= VISIBLE_COUNT) return all;
  const n = all.length;
  return Array.from({ length: VISIBLE_COUNT }, (_, i) => all[(start + i) % n]!);
}

type Props = {
  title: string;
  subtitle?: string;
  linkTo: string;
  products: Product[];
};

/**
 * "Los más virales": grilla con rotación automática (e‑commerce style) y pausa al hover.
 */
export function ViralProductRotatingSection({ title, subtitle, linkTo, products }: Props) {
  const all = useMemo(
    () => (products.length > 0 ? products : []),
    [products]
  );
  const canRotate = all.length > VISIBLE_COUNT;
  const [offset, setOffset] = useState(0);
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);

  const visible = useMemo(
    () => (canRotate ? takeVisibleRotating(all, offset) : all),
    [all, canRotate, offset]
  );

  const slideCount = canRotate ? all.length : 0;

  const tick = useCallback(() => {
    if (!canRotate || reduceMotion) return;
    setOffset((o) => (o + 1) % all.length);
  }, [all.length, canRotate, reduceMotion]);

  useEffect(() => {
    if (!canRotate || reduceMotion || paused) return;
    const id = window.setInterval(tick, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [canRotate, reduceMotion, paused, tick]);

  if (all.length === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#ff6a00]/20 bg-gradient-to-b from-[#ff6a00]/[0.08] via-background/80 to-background shadow-[0_0_0_1px_rgba(255,106,0,0.06),0_20px_50px_-20px_rgba(255,106,0,0.15)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Fondo decorativo suave */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-[#ff6a00]/20 to-transparent blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-gradient-to-tr from-primary/10 to-transparent blur-2xl"
        aria-hidden
      />

      <div className="relative p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ff6a00]/35 bg-[#ff6a00]/10 px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-[#c2410c] dark:text-orange-300">
                <TrendingUp className="h-3.5 w-3.5" />
                Tendencia
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {canRotate && !reduceMotion
                  ? paused
                    ? "Pausado (pasá el cursor fuera para reanudar)"
                    : "Cambiando cada 3s"
                  : "Selección especial"}
              </span>
            </div>
            <h2 className="text-xl font-bold text-foreground sm:text-2xl break-words">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <Link
            to={linkTo}
            className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:inline-flex"
          >
            Ver todos
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Barra de progreso 3s (solo rotación activa) */}
        {canRotate && !reduceMotion && !paused && (
          <div className="mb-5 h-0.5 w-full overflow-hidden rounded-full bg-muted/50">
            <motion.div
              key={offset}
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-[#ff6a00] to-amber-500"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: INTERVAL_MS / 1000, ease: "linear" }}
              style={{ transformOrigin: "left" }}
            />
          </div>
        )}

        {canRotate && !reduceMotion && !paused && slideCount > 0 && (
          <div
            className="mb-4 flex justify-center gap-1.5"
            role="list"
            aria-label="Página del carrusel de productos virales"
          >
            {Array.from({ length: slideCount }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-all duration-300",
                  i === offset ? "w-5 bg-[#ff6a00]" : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-5">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((p, i) => (
              <motion.div
                key={`${p.id}-slot-${i}-${offset}`}
                layout
                className="min-w-0"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, filter: "blur(4px)" }}
                transition={{
                  type: "spring",
                  stiffness: 320,
                  damping: 30,
                  delay: i * 0.04,
                }}
              >
                <div
                  className={cn(
                    "rounded-xl transition-shadow duration-300",
                    canRotate && "hover:shadow-md"
                  )}
                >
                  <ProductCard product={p} index={i} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <Link
          to={linkTo}
          className="mt-5 flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline sm:hidden"
        >
          Ver todos
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
