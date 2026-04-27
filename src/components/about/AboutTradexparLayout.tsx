import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const frameRing =
  "rounded-2xl border border-border/60 bg-card/40 shadow-[0_1px_0_0_hsl(var(--border)/0.5),0_24px_48px_-28px_hsl(213_63%_17%/0.18)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]";

/** Marco premium: imagen al 100 % del contenedor, sin bandas (aspecto = archivo). */
export function AboutPremiumImage({
  src,
  alt,
  aspectClassName,
  className,
  sizes,
  priority,
}: {
  src: string;
  alt: string;
  aspectClassName: string;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden", frameRing, aspectClassName, className)}>
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover object-center"
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : undefined}
      />
    </div>
  );
}

/** Sección imagen + texto; `imageSide` = lado de la imagen en desktop. */
export function AboutStorySection({
  eyebrow,
  title,
  titleIcon: TitleIcon,
  imageSide,
  visual,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  titleIcon: ComponentType<{ className?: string; strokeWidth?: number }>;
  imageSide: "left" | "right";
  visual: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const gridCols =
    imageSide === "left"
      ? "lg:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]"
      : "lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]";

  return (
    <section className={cn("scroll-mt-12", className)}>
      <div
        className={cn(
          "grid grid-cols-1 items-center gap-8 sm:gap-12 lg:gap-14 xl:gap-16",
          gridCols
        )}
      >
        <div
          className={cn(
            "min-h-0 w-full",
            imageSide === "right" && "lg:order-2",
            imageSide === "left" && "lg:order-1"
          )}
        >
          {visual}
        </div>
        <div
          className={cn(
            "flex min-h-0 flex-col justify-center space-y-5 lg:space-y-6",
            imageSide === "right" && "lg:order-1",
            imageSide === "left" && "lg:order-2"
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">{eyebrow}</p>
          <h2 className="flex flex-wrap items-center gap-2.5 text-balance text-xl font-bold tracking-tight text-foreground sm:gap-3 sm:text-3xl lg:text-[2rem] lg:leading-snug">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.12] text-primary ring-1 ring-primary/20 sm:h-11 sm:w-11">
              <TitleIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">{title}</span>
          </h2>
          <div className="max-w-xl space-y-3 text-[15px] leading-relaxed text-muted-foreground min-[400px]:space-y-4 sm:text-base lg:max-w-none">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AboutSectionDivider() {
  return (
    <div className="flex w-full justify-center py-6 sm:py-8" role="presentation" aria-hidden>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-0 px-2">
        <div className="h-px max-w-[min(40%,16rem)] min-w-0 flex-1 rounded-full bg-gradient-to-r from-transparent via-primary/25 to-primary/45" />
        <div className="mx-5 h-1 w-1 shrink-0 rounded-full bg-primary/40 sm:mx-7" />
        <div className="h-px max-w-[min(40%,16rem)] min-w-0 flex-1 rounded-full bg-gradient-to-l from-transparent via-primary/25 to-primary/45" />
      </div>
    </div>
  );
}
