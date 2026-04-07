import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { StoreLayout } from "@/layouts/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { StoreTestQueryProvider } from "@/test/StoreTestProviders";
import type { Product } from "@/types";

const mockProduct: Product = {
  id: "7ee432fd-93e3-4b88-9628-3ef94ab28efe",
  name: "Producto prueba catálogo",
  price: 100_000,
  stock: 5,
  image: "",
  sku: "TEST-SKU",
  description: "Desc",
  category: "Test",
  product_source_type: "tradexpar",
};

describe("ProductCard en catálogo (StoreLayout + ref)", () => {
  it("renderiza sin ReferenceError ni crash del boundary", async () => {
    render(
      <MemoryRouter initialEntries={["/products?ref=E2ED891F"]}>
        <StoreTestQueryProvider>
          <CustomerAuthProvider>
            <WishlistProvider>
              <CartProvider>
                <Routes>
                  <Route element={<StoreLayout />}>
                    <Route
                      path="/products"
                      element={
                        <div className="p-4">
                          <ProductCard product={mockProduct} index={0} />
                        </div>
                      }
                    />
                  </Route>
                </Routes>
              </CartProvider>
            </WishlistProvider>
          </CustomerAuthProvider>
        </StoreTestQueryProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("Producto prueba catálogo")).toBeInTheDocument();
    expect(screen.getByText("En Stock")).toBeInTheDocument();
    expect(screen.getByText(/100\.?000|100,000|100000/)).toBeInTheDocument();
  });
});
