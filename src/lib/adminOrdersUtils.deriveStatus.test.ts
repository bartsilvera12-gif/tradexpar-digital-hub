import { describe, it, expect } from "vitest";
import type { OrderLineItem } from "@/types";
import { deriveOrderStatusFromItems, statusLabelEs } from "./adminOrdersUtils";

function line(line_status: string): OrderLineItem {
  return { line_status } as OrderLineItem;
}

describe("deriveOrderStatusFromItems", () => {
  it("1 producto entregado → Cerrado (completed)", () => {
    const s = deriveOrderStatusFromItems([line("delivered")], "pending");
    expect(s).toBe("completed");
    expect(statusLabelEs(s)).toBe("Cerrado");
  });

  it("2 productos, uno en estado distinto a pendiente → En proceso (processing)", () => {
    const s = deriveOrderStatusFromItems([line("processing"), line("pending")], "pending");
    expect(s).toBe("processing");
    expect(statusLabelEs(s)).toBe("En proceso");
  });

  it("2 productos, uno entregado (no todos) → Parcialmente Entregado", () => {
    const s = deriveOrderStatusFromItems([line("delivered"), line("pending")], "pending");
    expect(s).toBe("partially_delivered");
    expect(statusLabelEs(s)).toBe("Parcialmente Entregado");
  });

  it("todas las líneas entregadas → Cerrado", () => {
    expect(deriveOrderStatusFromItems([line("delivered"), line("delivered")], "processing")).toBe(
      "completed"
    );
  });

  it("todas pendientes → Pendiente", () => {
    expect(deriveOrderStatusFromItems([line("pending"), line("pending")], "pending")).toBe("pending");
  });

  it("todas canceladas → Cancelado", () => {
    expect(deriveOrderStatusFromItems([line("cancelled"), line("failed")], "pending")).toBe("cancelled");
  });

  it("entregada + cancelada (todas resueltas, ≥1 entregada) → Cerrado", () => {
    expect(deriveOrderStatusFromItems([line("delivered"), line("cancelled")], "pending")).toBe(
      "completed"
    );
  });

  it("una cancelada y el resto pendiente → En proceso", () => {
    expect(deriveOrderStatusFromItems([line("cancelled"), line("pending")], "pending")).toBe(
      "processing"
    );
  });

  it("no reabre un pedido cancelado a mano si ninguna línea está entregada", () => {
    expect(deriveOrderStatusFromItems([line("pending"), line("pending")], "cancelled")).toBe(
      "cancelled"
    );
  });

  it("sin líneas → conserva el estado actual", () => {
    expect(deriveOrderStatusFromItems([], "processing")).toBe("processing");
  });
});
