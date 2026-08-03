import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CartProvider, useCart } from "@/contexts/CartContext";
import type { Product } from "@/types";

function makeProduct(id: string, stock: number | undefined): Product {
  return {
    id,
    name: `Producto ${id}`,
    price: 1000,
    stock: stock as number,
    image: "",
    sku: id,
    description: "",
    category: "",
  } as Product;
}

let api: ReturnType<typeof useCart> | null = null;
function Harness() {
  api = useCart();
  return <div data-testid="q">{api.items.map((i) => `${i.product.id}:${i.quantity}`).join(",")}</div>;
}

function renderCart() {
  render(
    <CartProvider>
      <Harness />
    </CartProvider>
  );
}

describe("CartContext: tope de stock", () => {
  beforeEach(() => {
    localStorage.removeItem("tradexpar_cart");
    api = null;
  });

  it("no agrega más unidades que el stock", () => {
    renderCart();
    const p = makeProduct("A", 2);
    let ok1 = false;
    let ok2 = false;
    let ok3 = false;
    act(() => {
      ok1 = api!.addItem(p, 1);
      ok2 = api!.addItem(p, 1);
      ok3 = api!.addItem(p, 1); // supera el stock (2) → rechazado
    });
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(ok3).toBe(false);
    expect(screen.getByTestId("q")).toHaveTextContent("A:2");
  });

  it("stock 0 = agotado: addItem devuelve false", () => {
    renderCart();
    let ok = true;
    act(() => {
      ok = api!.addItem(makeProduct("B", 0), 1);
    });
    expect(ok).toBe(false);
    expect(screen.getByTestId("q")).toHaveTextContent("");
  });

  it("agregar de golpe más que el stock se limita al tope", () => {
    renderCart();
    act(() => {
      api!.addItem(makeProduct("C", 3), 10);
    });
    expect(screen.getByTestId("q")).toHaveTextContent("C:3");
  });

  it("updateQuantity no supera el stock", () => {
    renderCart();
    act(() => {
      api!.addItem(makeProduct("D", 5), 1);
      api!.updateQuantity("D", 99);
    });
    expect(screen.getByTestId("q")).toHaveTextContent("D:5");
  });

  it("stock indefinido = sin límite", () => {
    renderCart();
    act(() => {
      api!.addItem(makeProduct("E", undefined), 7);
    });
    expect(screen.getByTestId("q")).toHaveTextContent("E:7");
  });
});
