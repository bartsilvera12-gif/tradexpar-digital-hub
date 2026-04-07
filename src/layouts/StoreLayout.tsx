import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { StoreNavbar } from "@/components/store/StoreNavbar";
import { StoreFooter } from "@/components/store/StoreFooter";
import { useEffect } from "react";
import { AffiliateBuyerDiscountProvider } from "@/contexts/AffiliateBuyerDiscountContext";
import { captureAffiliateFromUrl } from "@/lib/affiliate";
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
    captureAffiliateFromUrl(location.search);
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

  return (
    <AffiliateBuyerDiscountProvider>
      <div className="min-h-screen flex flex-col">
        <StoreNavbar />
        <main className="flex-1 min-w-0 pb-[env(safe-area-inset-bottom)]">
          <Outlet />
        </main>
        <StoreFooter />
      </div>
    </AffiliateBuyerDiscountProvider>
  );
}
