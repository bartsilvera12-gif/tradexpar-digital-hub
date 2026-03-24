import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Product } from "@/types";

interface Props {
  products: Product[];
}

export function HeroProductSlideshow({ products }: Props) {
  const [index, setIndex] = useState(0);

  const validProducts = products.filter((p) => p.image);

  const advance = useCallback(() => {
    if (validProducts.length === 0) return;
    setIndex((prev) => (prev + 1) % validProducts.length);
  }, [validProducts.length]);

  useEffect(() => {
    if (validProducts.length <= 1) return;
    const id = setInterval(advance, 4000);
    return () => clearInterval(id);
  }, [advance, validProducts.length]);

  if (validProducts.length === 0) return null;

  const current = validProducts[index];

  return (
    <AnimatePresence mode="wait">
      <motion.img
        key={current.id}
        src={current.image!}
        alt={current.name}
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </AnimatePresence>
  );
}
