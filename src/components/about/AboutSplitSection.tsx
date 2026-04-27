import type { ComponentType, ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { aboutFade, AboutEyebrow, AboutHeading } from "./aboutSectionPrimitives";

export function AboutSplitSection({
  eyebrow,
  title,
  titleIcon: TitleIcon,
  visual,
  reverse,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  titleIcon: ComponentType<{ className?: string; strokeWidth?: number }>;
  visual: ReactNode;
  reverse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section {...aboutFade} className={cn("scroll-mt-10", className)}>
      <div
        className={cn(
          "grid grid-cols-1 items-stretch gap-6 sm:gap-8 lg:min-h-0 lg:items-center lg:gap-10 xl:gap-12",
          reverse
            ? "lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]"
            : "lg:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]"
        )}
      >
        <div
          className={cn(
            "flex min-h-0 w-full justify-center lg:py-0",
            reverse ? "lg:order-2 lg:justify-end" : "lg:order-1 lg:justify-start"
          )}
        >
          <div className="w-full max-w-none">{visual}</div>
        </div>
        <div
          className={cn(
            "flex flex-col justify-center gap-4 text-center lg:gap-5 lg:text-left",
            reverse ? "lg:order-1" : "lg:order-2"
          )}
        >
          <AboutEyebrow className="lg:mx-0">{eyebrow}</AboutEyebrow>
          <AboutHeading icon={TitleIcon}>{title}</AboutHeading>
          <div className="mx-auto w-full max-w-[36rem] space-y-4 text-left lg:mx-0">{children}</div>
        </div>
      </div>
    </motion.section>
  );
}
