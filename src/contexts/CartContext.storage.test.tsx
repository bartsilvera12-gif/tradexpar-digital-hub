import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CartProvider, useCart } from "@/contexts/CartContext";

function CartProbe() {
  const { items, totalItems } = useCart();
  return (
    <div data-testid="probe">
      {items.length}-{totalItems}
    </div>
  );
}

describe("CartContext localStorage", () => {
  beforeEach(() => {
    localStorage.removeItem("tradexpar_cart");
  });

  it("JSON inválido no rompe el montaje", () => {
    localStorage.setItem("tradexpar_cart", "{no-es-json");
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("0-0");
  });

  it("filtra líneas sin product.id string", () => {
    localStorage.setItem(
      "tradexpar_cart",
      JSON.stringify([{ quantity: 2, product: { id: 999, name: "x" } }])
    );
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("0-0");
  });
});
