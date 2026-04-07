import { cn } from "@/lib/utils";
import { DDI } from "@/lib/ddiLabels";

type Variant = "sale" | "referral";
type Shape = "ribbon" | "pill";

const VARIANT_STYLES: Record<
  Variant,
  { label: string; className: string }
> = {
  sale: {
    label: "Descuento",
    className:
      "bg-gradient-to-br from-destructive via-destructive to-destructive/90 text-destructive-foreground border-white/25 shadow-[0_4px_14px_-2px_rgba(220,38,38,0.35)]",
  },
  referral: {
    label: DDI.promoBadgeLabel,
    className:
      "bg-gradient-to-br from-primary via-sky-500 to-cyan-600 text-primary-foreground border-white/30 shadow-[0_4px_14px_-2px_rgba(14,165,233,0.32)]",
  },
};

interface ProductPromoBadgeProps {
  variant: Variant;
  percent: number;
  /** Cinta al borde izquierdo (tarjeta) o pastilla (ficha) */
  shape?: Shape;
  className?: string;
}

export function ProductPromoBadge({
  variant,
  percent,
  shape = "ribbon",
  className,
}: ProductPromoBadgeProps) {
  const { label, className: tone } = VARIANT_STYLES[variant];
  const rounded =
    shape === "ribbon"
      ? "rounded-l-none rounded-r-2xl"
      : "rounded-2xl";

  return (
    <span
      className={cn(
        "inline-flex flex-col items-start gap-1 border backdrop-blur-[2px]",
        "pl-3 pr-3.5 sm:pl-3.5 sm:pr-4 py-2 sm:py-2.5",
        rounded,
        tone,
        className
      )}
    >
      <span className="text-[0.5625rem] sm:text-[0.625rem] uppercase tracking-[0.2em] font-semibold opacity-[0.88] leading-none">
        {label}
      </span>
      <span className="text-sm sm:text-[0.9375rem] font-bold tabular-nums tracking-tight leading-none">
        −{Math.round(percent)}%
      </span>
    </span>
  );
}
