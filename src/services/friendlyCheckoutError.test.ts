import { describe, it, expect } from "vitest";
import { friendlyCheckoutError } from "./tradexpar";

describe("friendlyCheckoutError", () => {
  it("traduce INSUFFICIENT_STOCK a un mensaje claro", () => {
    const msg = friendlyCheckoutError(
      'INSUFFICIENT_STOCK: "CONSERV IGLOO" sin stock suficiente (disponible 1, pedido 3)'
    );
    expect(msg).toContain("No hay stock suficiente");
    expect(msg).toContain("CONSERV IGLOO");
    expect(msg).toContain("disponible 1, pedido 3");
  });

  it("traduce PRODUCT_UNAVAILABLE", () => {
    const msg = friendlyCheckoutError('PRODUCT_UNAVAILABLE: "Mouse X" ya no está disponible');
    expect(msg).toContain("ya no está disponible");
    expect(msg).toContain("Mouse X");
  });

  it("deja pasar otros errores tal cual", () => {
    expect(friendlyCheckoutError("permission denied for table orders")).toBe(
      "permission denied for table orders"
    );
  });

  it("mensaje por defecto si viene vacío", () => {
    expect(friendlyCheckoutError("")).toBe("No se pudo crear el pedido.");
    expect(friendlyCheckoutError(null)).toBe("No se pudo crear el pedido.");
  });
});
