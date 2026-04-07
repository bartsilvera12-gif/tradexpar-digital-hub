import { useCallback, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Ratio = "16/9" | "1/1" | "fill";

/**
 * Imagen opcional desde /public; si falla la carga o no hay `src`, muestra `fallback`.
 */
export function AboutImageSlot({
  src,
  alt,
  ratio = "fill",
  fallback,
  className,
  imgClassName,
  /** Prioriza la parte superior del encuadre con `object-fit: cover` (p. ej. assets con franja vacía abajo). */
  objectPosition,
  /** `contain` muestra la imagen completa dentro del marco (puede dejar bandas). */
  objectFit,
  priority,
  sizes,
}: {
  /** Si falta, se muestra solo el fallback (útil hasta que exista el archivo en /public). */
  src?: string;
  alt: string;
  ratio?: Ratio;
  fallback: ReactNode;
  className?: string;
  imgClassName?: string;
  objectPosition?: "center" | "top" | "bottom";
  objectFit?: "cover" | "contain";
  priority?: boolean;
  sizes?: string;
}) {
  const fit = objectFit ?? "cover";
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        fit === "contain" ? "bg-muted/50" : "bg-muted/30",
        ratio === "16/9" && "aspect-video w-full",
        ratio === "1/1" && "aspect-square w-full",
        ratio === "fill" && "h-full w-full min-h-0",
        className
      )}
    >
      {showImage && fit === "contain" ? (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center",
            ratio === "fill" && "absolute inset-0"
          )}
        >
          <img
            src={src}
            alt={alt}
            className={cn("max-h-full max-w-full object-contain", imgClassName)}
            onError={onError}
            loading={priority ? "eager" : "lazy"}
            decoding={priority ? "sync" : "async"}
            fetchPriority={priority ? "high" : undefined}
            sizes={sizes}
          />
        </div>
      ) : showImage ? (
        <img
          src={src}
          alt={alt}
          className={cn(
            ratio === "fill" ? "absolute inset-0 h-full w-full min-h-full min-w-full" : "h-full w-full min-h-full min-w-full",
            "object-cover",
            objectPosition === "top" && "object-top",
            objectPosition === "bottom" && "object-bottom",
            (objectPosition === "center" || !objectPosition) && "object-center",
            imgClassName
          )}
          onError={onError}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : undefined}
          sizes={sizes}
        />
      ) : (
        <div className={cn("relative flex h-full min-h-[inherit] w-full items-center justify-center", ratio === "fill" && "min-h-[200px]")}>
          {fallback}
        </div>
      )}
    </div>
  );
}
