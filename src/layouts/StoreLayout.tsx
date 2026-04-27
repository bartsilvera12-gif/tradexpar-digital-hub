import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { StoreNavbar } from "@/components/store/StoreNavbar";
import { StoreFooter } from "@/components/store/StoreFooter";
import { useEffect, useLayoutEffect } from "react";
import { AffiliateBuyerDiscountProvider } from "@/contexts/AffiliateBuyerDiscountContext";
import { syncAffiliateWithUrlSearch } from "@/lib/affiliate";
import { affiliatesAvailable, recordAffiliateVisit } from "@/services/affiliateTradexparService";
import { isOAuthCallbackUrl } from "@/services/tradexpar";

export function StoreLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  /** Si Supabase redirige al Site URL (/) en lugar de /account, mover tokens/código a /account. */
  useEffect(() => {
    if (!isOAuthCallbackUrl()) return;
    if (location.pathname !== "/" && location.pathname !== "/login") return;
    navigate(`/account${location.search}${location.hash}`, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    syncAffiliateWithUrlSearch(location.search);
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref && affiliatesAvailable()) {
      void recordAffiliateVisit(
        ref,
        `${location.pathname}${location.search}`,
        typeof navigator !== "undefined" ? navigator.userAgent : null,
        undefined
      );
    }
  }, [location.search, location.pathname]);

  /**
   * Scroll al inicio en cada navegación y en la carga inicial (evita quedar abajo en / o al volver con el botón del navegador).
   * useLayoutEffect: antes de pintar; key cambia en cada entrada del historial.
   */
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.key]);

  return (
    <AffiliateBuyerDiscountProvider>
      <div className="min-h-dvh flex flex-col">
        <StoreNavbar />
        <main className="flex-1 min-w-0 w-full max-w-[100vw] overflow-x-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0px,env(safe-area-inset-left))] pr-[max(0px,env(safe-area-inset-right))]">
          <Outlet />
        </main>
        <StoreFooter />
      </div>
    </AffiliateBuyerDiscountProvider>
  );
}
