import { Outlet } from "react-router-dom";
import { StoreNavbar } from "@/components/store/StoreNavbar";
import { StoreFooter } from "@/components/store/StoreFooter";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureAffiliateFromUrl } from "@/lib/affiliate";

export function StoreLayout() {
  const location = useLocation();
  useEffect(() => {
    captureAffiliateFromUrl(location.search);
  }, [location.search]);

  return (
    <div className="min-h-screen flex flex-col">
      <StoreNavbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <StoreFooter />
    </div>
  );
}
