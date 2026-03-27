import { Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const DURATION_SUCCESS_MS = 2000;
const DURATION_CONFLICT_MS = 2800;

/** Toast alineado a la marca (card + gradiente celeste como el resto del sitio). */
export function toastCartAdded(productName: string, qty: number) {
  toast({
    duration: DURATION_SUCCESS_MS,
    variant: "success",
    description: (
      <span className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-celeste text-primary-foreground shadow-brand ring-2 ring-primary/15"
          aria-hidden
        >
          <Check className="h-4 w-4 stroke-[3]" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block font-semibold text-foreground tracking-tight">Añadido de forma exitosa</span>
          <span className="mt-1 block text-xs font-medium text-muted-foreground leading-snug">
            {productName}
            {qty > 1 ? ` · ×${qty}` : ""}
          </span>
        </span>
      </span>
    ),
  });
}

/** No se puede mezclar Tradexpar y Dropi en el mismo carrito. */
export function toastCartSourceConflict() {
  toast({
    duration: DURATION_CONFLICT_MS,
    variant: "destructive",
    title: "No puedes mezclar orígenes",
    description: "Vacía el carrito o termina ese pedido antes de agregar productos de otro catálogo (Tradexpar / Dropi).",
  });
}