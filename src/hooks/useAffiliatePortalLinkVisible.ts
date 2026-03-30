import { useEffect, useState } from "react";
import {
  getSupabaseAuth,
  runAuthExclusive,
  setDataClientAccessToken,
  tryReadAuthAccessTokenFromStorage,
} from "@/lib/supabaseClient";
import { affiliatesAvailable, fetchAffiliatePortalLinkVisible } from "@/services/affiliateTradexparService";

/** True cuando hay sesión Supabase y el backend permite ver el panel (afiliado o solicitud pendiente). */
export function useAffiliatePortalLinkVisible(userId: string | undefined): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!affiliatesAvailable() || !userId?.trim()) {
      setVisible(false);
      return;
    }
    let cancelled = false;

    const run = async () => {
      try {
        let token = tryReadAuthAccessTokenFromStorage();
        if (!token) {
          const { data } = await runAuthExclusive(() => getSupabaseAuth().auth.getSession());
          token = data.session?.access_token ?? null;
        }
        setDataClientAccessToken(token);
        if (!token) {
          if (!cancelled) setVisible(false);
          return;
        }
        const ok = await fetchAffiliatePortalLinkVisible();
        if (!cancelled) setVisible(ok);
      } catch {
        if (!cancelled) setVisible(false);
      }
    };

    void run();

    const { data: { subscription } } = getSupabaseAuth().auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        setDataClientAccessToken(null);
        setVisible(false);
        return;
      }
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        void run();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [userId]);

  return visible;
}
