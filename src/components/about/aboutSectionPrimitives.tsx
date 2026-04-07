import { cn } from "@/lib/utils";

export const aboutFade = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-48px" },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
};

export function AboutEyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.22em] text-primary mb-2.5", className)}>
      {children}
    </p>
  );
}

export function AboutHeading({
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
        "text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-3 flex-wrap justify-center lg:justify-start text-center lg:text-left",
        className
      )}
    >
      <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-primary shrink-0" strokeWidth={1.65} />
      <span>{children}</span>
    </h2>
  );
}
