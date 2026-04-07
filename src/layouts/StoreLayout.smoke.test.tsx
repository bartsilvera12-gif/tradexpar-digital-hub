import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { StoreLayout } from "@/layouts/StoreLayout";
import { StoreTestQueryProvider } from "@/test/StoreTestProviders";

describe("StoreLayout", () => {
  it("monta navbar, outlet y proveedor de descuentos por distribuidor sin error", async () => {
    render(
      <MemoryRouter initialEntries={["/?ref=SMOKE"]}>
        <StoreTestQueryProvider>
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
        </StoreTestQueryProvider>
      </MemoryRouter>
    );

    expect(await screen.findByTestId("outlet-ok")).toHaveTextContent("OK");
  });
});
