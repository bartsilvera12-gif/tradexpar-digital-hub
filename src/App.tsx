import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Loader } from "@/components/shared/Loader";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/contexts/CartContext";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { StoreLayout } from "@/layouts/StoreLayout";
import { AdminLayout } from "@/layouts/AdminLayout";

import HomePage from "@/pages/store/HomePage";
import ProductsPage from "@/pages/store/ProductsPage";
import ProductDetailPage from "@/pages/store/ProductDetailPage";
import CartPage from "@/pages/store/CartPage";
import CheckoutPage from "@/pages/store/CheckoutPage";
import SuccessPage from "@/pages/store/SuccessPage";
import CustomerLoginPage from "@/pages/store/CustomerLoginPage";
import CustomerRegisterPage from "@/pages/store/CustomerRegisterPage";
import CustomerAccountPage from "@/pages/store/CustomerAccountPage";
import WishlistPage from "@/pages/store/WishlistPage";
import AffiliateApplyPage from "@/pages/store/AffiliateApplyPage";
import AffiliatePortalPage from "@/pages/store/AffiliatePortalPage";
import AboutTradexparPage from "@/pages/store/AboutTradexparPage";
import PrivacyPage from "@/pages/store/PrivacyPage";
import DataDeletionPage from "@/pages/store/DataDeletionPage";

const AdminLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage"));
const AdminDashboardPage = lazy(() => import("@/pages/admin/AdminDashboardPage"));
const AdminProductsPage = lazy(() => import("@/pages/admin/AdminProductsPage"));
const AdminOrdersPage = lazy(() => import("@/pages/admin/AdminOrdersPage"));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/AdminSettingsPage"));
const AdminAffiliatesPage = lazy(() => import("@/pages/admin/AdminAffiliatesPage"));

import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 15 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: "online",
    },
  },
});

function AdminSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader text="Cargando panel…" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CustomerAuthProvider>
        <WishlistProvider>
          <CartProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Store */}
                <Route element={<StoreLayout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/sobre-tradexpar" element={<AboutTradexparPage />} />
                  <Route path="/privacidad" element={<PrivacyPage />} />
                  <Route path="/eliminar-datos" element={<DataDeletionPage />} />
                  <Route path="/products/:id" element={<ProductDetailPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/success" element={<SuccessPage />} />
                  <Route path="/wishlist" element={<WishlistPage />} />
                  <Route path="/login" element={<CustomerLoginPage />} />
                  <Route path="/register" element={<CustomerRegisterPage />} />
                  <Route path="/account" element={<CustomerAccountPage />} />
                  <Route path="/afiliados" element={<AffiliateApplyPage />} />
                  <Route path="/afiliados/panel" element={<AffiliatePortalPage />} />
                </Route>

                {/* Admin */}
                <Route
                  path="/admin/login"
                  element={
                    <AdminSuspense>
                      <AdminLoginPage />
                    </AdminSuspense>
                  }
                />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route
                    path="dashboard"
                    element={
                      <AdminSuspense>
                        <AdminDashboardPage />
                      </AdminSuspense>
                    }
                  />
                  <Route
                    path="products"
                    element={
                      <AdminSuspense>
                        <AdminProductsPage />
                      </AdminSuspense>
                    }
                  />
                  <Route
                    path="orders"
                    element={
                      <AdminSuspense>
                        <AdminOrdersPage />
                      </AdminSuspense>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <AdminSuspense>
                        <AdminUsersPage />
                      </AdminSuspense>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <AdminSuspense>
                        <AdminSettingsPage />
                      </AdminSuspense>
                    }
                  />
                  <Route
                    path="affiliates"
                    element={
                      <AdminSuspense>
                        <AdminAffiliatesPage />
                      </AdminSuspense>
                    }
                  />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </WishlistProvider>
      </CustomerAuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
