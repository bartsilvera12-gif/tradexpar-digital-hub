import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@/types";

interface Props {
  products: Product[];
}

export function HeroProductSlideshow({ products }: Props) {
  const [index, setIndex] = useState(0);

  // Collect all images from all products
  const allImages = products.flatMap((p) => {
    if (p.images && p.images.length > 0) return p.images;
    if (p.image) return [p.image];
    return [];
  });

  const advance = useCallback(() => {
    if (validProducts.length === 0) return;
    setIndex((prev) => (prev + 1) % validProducts.length);
  }, [validProducts.length]);

  const goBack = useCallback(() => {
    if (validProducts.length === 0) return;
    setIndex((prev) => (prev - 1 + validProducts.length) % validProducts.length);
  }, [validProducts.length]);

  useEffect(() => {
    if (validProducts.length <= 1) return;
    const id = setInterval(advance, 3000);
    return () => clearInterval(id);
  }, [advance, validProducts.length]);

  if (validProducts.length === 0) return null;

  const current = validProducts[index];

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.img
          key={current.id}
          src={current.images?.[0] || current.image!}
          alt={current.name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      </AnimatePresence>

      {validProducts.length > 1 && (
        <>
          <button
            onClick={goBack}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-background/30 backdrop-blur-sm border border-border/30 flex items-center justify-center text-secondary-foreground hover:bg-background/50 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={advance}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-background/30 backdrop-blur-sm border border-border/30 flex items-center justify-center text-secondary-foreground hover:bg-background/50 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </>
  );
}
