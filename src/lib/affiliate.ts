const AFFILIATE_COOKIE_KEY = "tradexpar_aff_ref";
const AFFILIATE_COOKIE_TTL_DAYS = 30;

export function setAffiliateCookie(ref: string) {
  if (!ref) return;
  const expires = new Date();
  expires.setDate(expires.getDate() + AFFILIATE_COOKIE_TTL_DAYS);
  document.cookie = `${AFFILIATE_COOKIE_KEY}=${encodeURIComponent(ref)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

export function getAffiliateCookie(): string | null {
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${AFFILIATE_COOKIE_KEY}=`))
    ?.split("=")[1];
  return raw ? decodeURIComponent(raw) : null;
}

export function captureAffiliateFromUrl(search: string) {
  const params = new URLSearchParams(search);
  const ref = params.get("ref");
  if (ref) setAffiliateCookie(ref);
}
