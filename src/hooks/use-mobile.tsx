import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const LG_BREAKPOINT = 1024;
const XL_BREAKPOINT = 1280;

function useMinWidth(px: number) {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(`(min-width: ${px}px)`);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => true
  );
}

/** `true` desde el primer paint en cliente (sin flash); alineado a breakpoint `md` de Tailwind. */
export function useIsMdUp() {
  return useMinWidth(MOBILE_BREAKPOINT);
}

/** `true` en pantallas grandes (`lg` de Tailwind, 1024px+). */
export function useIsLgUp() {
  return useMinWidth(LG_BREAKPOINT);
}

/** `true` en pantallas extra grandes (`xl` de Tailwind, 1280px+). */
export function useIsXlUp() {
  return useMinWidth(XL_BREAKPOINT);
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
