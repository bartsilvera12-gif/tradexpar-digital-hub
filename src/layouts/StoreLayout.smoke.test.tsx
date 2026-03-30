import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { StoreLayout } from "@/layouts/StoreLayout";

describe("StoreLayout", () => {
  it("monta navbar, outlet y proveedor de descuentos afiliados sin error", async () => {
    render(
      <MemoryRouter initialEntries={["/?ref=SMOKE"]}>
        <CustomerAuthProvider>
          <WishlistProvider>
            <CartProvider>
              <Routes>
                <Route element={<StoreLayout />}>
                  <Route path="/" element={<div data-testid="outlet-ok">OK</div>} />
                </Route>
              </Routes>
            </CartProvider>
          </WishlistProvider>
        </CustomerAuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByTestId("outlet-ok")).toHaveTextContent("OK");
  });
});
