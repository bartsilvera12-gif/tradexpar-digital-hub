import type { CommissionStatus } from "@/types/affiliates";

const LABELS: Record<CommissionStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  paid: "Pagada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

/** Etiqueta en español para el estado de comisión de una atribución (venta). */
export function commissionStatusLabelEs(status: string): string {
  const k = (status || "").toLowerCase().trim() as CommissionStatus;
  if (k in LABELS) return LABELS[k];
  return status?.trim() || "—";
}

/** Orden de opciones en selectores admin (ventas). */
export const COMMISSION_STATUS_SELECT_ORDER: CommissionStatus[] = [
  "pending",
  "approved",
  "paid",
  "rejected",
  "cancelled",
];

export function affiliateSaleCommissionSelectOptions(): { value: CommissionStatus; label: string }[] {
  return COMMISSION_STATUS_SELECT_ORDER.map((value) => ({
    value,
    label: LABELS[value],
  })).filter(
    (o) => String(o.value).toLowerCase() !== "antifraude" && !/antifraude/i.test(o.label)
  );
}
