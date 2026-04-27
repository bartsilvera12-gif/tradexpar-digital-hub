import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
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
 * "Los más virales": misma estructura que otras secciones del home + rotación y animaciones suaves.
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
      className="min-w-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-3"
      >
        <div className="min-w-0 pr-1">
          <h2 className="text-lg font-bold text-foreground sm:text-xl md:text-2xl break-words [text-wrap:balance]">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 sm:mt-1 text-sm text-muted-foreground line-clamp-2">{subtitle}</p> : null}
        </div>
        <Link
          to={linkTo}
          className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:inline-flex"
        >
          Ver todos
          <ChevronRight className="h-4 w-4" />
        </Link>
      </motion.header>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4 lg:gap-5 min-w-0">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((p, i) => (
            <motion.div
              key={`${p.id}-slot-${i}-${offset}`}
              layout
              className="min-w-0"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 16, scale: 0.97 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 32,
                mass: 0.75,
                delay: i * 0.055,
              }}
            >
              <div
                className={cn(
                  "rounded-xl transition-shadow duration-300 will-change-transform",
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
        className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline sm:hidden"
      >
        Ver todos
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
