import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart, Menu, X, Search, ChevronDown, Heart, User, Briefcase } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { tradexpar } from "@/services/tradexpar";
import type { Product } from "@/types";
import logoIcon from "@/assets/logo-icon.png";
import { CartDropdown } from "@/components/store/CartDropdown";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { affiliatesAvailable } from "@/services/affiliateTradexparService";

export function StoreNavbar() {
  const { totalItems } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { user, logout } = useCustomerAuth();
  const showAffiliateNav = Boolean(user) && affiliatesAvailable();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const searchRefDesktop = useRef<HTMLDivElement>(null);
  const searchRefMobile = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))];

  useEffect(() => {
    tradexpar.getProducts().then(setAllProducts).catch(() => {});
  }, []);

  useEffect(() => {
    if (query.trim().length === 0) { setResults([]); return; }
    const q = query.toLowerCase();
    const filtered = allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
    );
    setResults(filtered.slice(0, 6));
  }, [query, allProducts]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const inDesktop = searchRefDesktop.current?.contains(t);
      const inMobile = searchRefMobile.current?.contains(t);
      if (!inDesktop && !inMobile) setShowResults(false);
      if (catRef.current && !catRef.current.contains(t)) setCatOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const handleSelect = (product: Product) => {
    setQuery("");
    setShowResults(false);
    setMobileOpen(false);
    navigate(`/products/${product.id}`);
  };

  const handleCategorySelect = (cat: string) => {
    setCatOpen(false);
    setMobileOpen(false);
    navigate(`/products?category=${encodeURIComponent(cat)}`);
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b shadow-sm pt-[env(safe-area-inset-top)]">
      <div className="w-full max-w-[1800px] mx-auto flex flex-col gap-2 md:gap-0 md:flex-row md:items-center md:h-16 px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-2.5 md:py-0 md:gap-6 lg:gap-8 xl:gap-10">
        <div className="flex w-full min-h-11 items-center justify-between gap-3 shrink-0 md:contents md:min-h-0">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0 touch-manipulation">
          <img src={logoIcon} alt="Tradexpar" className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" width={32} height={32} />
          <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
            TRADE<span className="text-gradient">XPAR</span>
          </span>
        </Link>

        {/* Search bar — desktop */}
        <div
          ref={searchRefDesktop}
          className="hidden md:flex flex-1 min-w-0 justify-center px-2 lg:px-4 xl:px-6"
        >
          <div className="w-full max-w-md lg:max-w-xl xl:max-w-2xl 2xl:max-w-3xl relative">
            <div className="flex w-full border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring transition-shadow">
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                onFocus={() => query.trim() && setShowResults(true)}
                placeholder="Estoy buscando..."
                className="flex-1 px-4 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button className="px-4 bg-primary text-primary-foreground flex items-center gap-2 text-sm font-medium hover:bg-primary/90 transition-colors">
                <Search className="h-4 w-4" />
                Buscar
              </button>
            </div>

            <AnimatePresence>
              {showResults && results.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-xl shadow-lg overflow-hidden z-50"
                >
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelect(p)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                    >
                      <img src={p.images?.[0] || p.image} alt={p.name} className="w-12 h-12 rounded-lg object-contain bg-muted/20 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.category}</p>
                      </div>
                      <span className="text-sm font-bold text-foreground shrink-0">
                        ₲{(Number(p.price) || 0).toLocaleString("es-PY")}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Enlaces de escritorio (los iconos van aparte para que sigan visibles en móvil) */}
        <div className="hidden md:flex items-center shrink-0 gap-6 lg:gap-8 xl:gap-10">
          <nav className="flex items-center gap-5 lg:gap-7 xl:gap-8">
            <Link
              to="/"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === "/" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Inicio
            </Link>
            <Link
              to="/products"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location.pathname.startsWith("/products") ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Catálogo
            </Link>
            <Link
              to="/sobre-tradexpar"
              className={`text-sm font-medium transition-colors hover:text-primary whitespace-nowrap ${
                location.pathname === "/sobre-tradexpar" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Sobre Tradexpar
            </Link>
            <Link
              to="/afiliados"
              className={`text-sm font-medium transition-colors hover:text-primary whitespace-nowrap ${
                location.pathname === "/afiliados" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              ¿Quieres trabajar con nosotros?
            </Link>

            {/* Categorías dropdown */}
            <div ref={catRef} className="relative">
              <button
                onClick={() => setCatOpen(!catOpen)}
                className={`text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 ${
                  catOpen ? "text-primary" : "text-muted-foreground"
                }`}
              >
                Categorías
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${catOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {catOpen && categories.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-2 w-48 bg-card border rounded-xl shadow-lg overflow-hidden z-50"
                  >
                    {categories.map((c) => (
                      <button
                        key={c}
                        onClick={() => handleCategorySelect(c)}
                        className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted/40 transition-colors"
                      >
                        {c}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>

          <div className="h-8 w-px bg-border/70 shrink-0 hidden lg:block" aria-hidden />
        </div>

        {/* Iconos y menú móvil */}
        <div className="flex items-center gap-0.5 sm:gap-2 md:gap-3 lg:gap-4 shrink-0 ml-auto md:ml-0 touch-manipulation">
          {showAffiliateNav && (
            <Link
              to="/afiliados/panel"
              className="hidden sm:flex relative items-center justify-center min-h-11 min-w-11 md:min-h-10 md:min-w-10 rounded-full hover:bg-primary/10 active:bg-primary/15 transition-colors text-primary"
              title="Panel de afiliado"
            >
              <Briefcase className="h-5 w-5" strokeWidth={2} />
            </Link>
          )}
          <Link
            to={user ? "/account" : "/login"}
            className="relative flex items-center justify-center min-h-11 min-w-11 md:min-h-10 md:min-w-10 rounded-full hover:bg-muted/50 active:bg-muted/70 transition-colors"
            title={user ? "Mi cuenta" : "Ingresar"}
          >
            <User className="h-5 w-5 text-foreground" />
          </Link>
          <Link
            to="/wishlist"
            className="relative flex items-center justify-center min-h-11 min-w-11 md:min-h-10 md:min-w-10 rounded-full hover:bg-muted/50 active:bg-muted/70 transition-colors"
            title="Favoritos"
          >
            <Heart
              className={`h-5 w-5 ${location.pathname === "/wishlist" ? "text-primary" : "text-foreground"}`}
            />
            <span className="absolute top-0.5 right-0.5 md:-top-1 md:-right-1 min-w-[1.125rem] h-[1.125rem] md:w-5 md:h-5 px-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {wishlistCount}
            </span>
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCartOpen(!cartOpen)}
              className="relative flex items-center justify-center min-h-11 min-w-11 md:min-h-10 md:min-w-10 rounded-full hover:bg-muted/50 active:bg-muted/70 transition-colors"
              aria-expanded={cartOpen}
            >
              <ShoppingCart className="h-5 w-5 text-foreground" />
              <span className="absolute top-0.5 right-0.5 md:-top-1 md:-right-1 min-w-[1.125rem] h-[1.125rem] md:w-5 md:h-5 px-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            </button>
            <AnimatePresence>
              <CartDropdown open={cartOpen} onClose={closeCart} />
            </AnimatePresence>
          </div>

          <button
            type="button"
            className="md:hidden flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted/60 active:bg-muted/80 -mr-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        </div>

        {/* Búsqueda siempre visible en móvil (evita duplicar en el panel) */}
        <div
          ref={searchRefMobile}
          className="w-full md:hidden shrink-0"
        >
          <div className="relative">
            <div className="flex w-full border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-ring shadow-sm">
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                onFocus={() => query.trim() && setShowResults(true)}
                placeholder="Estoy buscando..."
                className="flex-1 min-h-11 px-3 sm:px-4 py-2.5 text-base sm:text-sm bg-background text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button
                type="button"
                className="shrink-0 px-3 sm:px-4 min-w-[3rem] bg-primary text-primary-foreground flex items-center justify-center active:bg-primary/90"
                aria-label="Buscar"
              >
                <Search className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>
            <AnimatePresence>
              {showResults && results.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full left-0 right-0 mt-1 max-h-[min(50vh,20rem)] overflow-y-auto overscroll-contain bg-card border rounded-xl shadow-lg z-[60]"
                >
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(p)}
                      className="w-full flex items-center gap-3 min-h-[3.25rem] px-3 sm:px-4 py-2.5 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left border-b border-border/40 last:border-0"
                    >
                      <img src={p.images?.[0] || p.image} alt={p.name} className="w-11 h-11 rounded-lg object-contain bg-muted/20 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-2">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.category}</p>
                      </div>
                      <span className="text-sm font-bold text-foreground shrink-0 tabular-nums">
                        ₲{(Number(p.price) || 0).toLocaleString("es-PY")}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden border-t bg-card overflow-hidden"
          >
            <div className="max-h-[min(72vh,calc(100dvh-7rem))] overflow-y-auto overscroll-y-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <nav className="flex flex-col gap-1">
                <Link to="/" onClick={() => setMobileOpen(false)} className={`text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors active:bg-muted/60 touch-manipulation ${location.pathname === "/" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Inicio
                </Link>
                <Link to="/products" onClick={() => setMobileOpen(false)} className={`text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors active:bg-muted/60 touch-manipulation ${location.pathname.startsWith("/products") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Catálogo
                </Link>
                <Link
                  to="/sobre-tradexpar"
                  onClick={() => setMobileOpen(false)}
                  className={`text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors active:bg-muted/60 touch-manipulation ${
                    location.pathname === "/sobre-tradexpar" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  Sobre Tradexpar
                </Link>
                <Link
                  to="/afiliados"
                  onClick={() => setMobileOpen(false)}
                  className={`text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors active:bg-muted/60 touch-manipulation ${
                    location.pathname === "/afiliados" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  ¿Quieres trabajar con nosotros?
                </Link>
                <Link to="/wishlist" onClick={() => setMobileOpen(false)} className={`text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors active:bg-muted/60 touch-manipulation ${location.pathname === "/wishlist" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Favoritos ({wishlistCount})
                </Link>
                {!user ? (
                  <Link to="/login" onClick={() => setMobileOpen(false)} className="text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted/50 active:bg-muted/60 touch-manipulation">
                    Ingresar / Registro
                  </Link>
                ) : (
                  <>
                    {showAffiliateNav ? (
                      <Link
                        to="/afiliados/panel"
                        onClick={() => setMobileOpen(false)}
                        className="text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors text-primary hover:bg-primary/10 active:bg-primary/15 gap-2 touch-manipulation"
                      >
                        <Briefcase className="h-4 w-4 shrink-0" strokeWidth={2} />
                        Panel de afiliado
                      </Link>
                    ) : null}
                    <Link to="/account" onClick={() => setMobileOpen(false)} className="text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted/50 active:bg-muted/60 touch-manipulation">
                      Mi cuenta
                    </Link>
                    <button type="button" onClick={() => { void logout(); setMobileOpen(false); }} className="text-left text-sm font-medium min-h-11 flex items-center px-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted/50 active:bg-muted/60 touch-manipulation">
                      Cerrar sesión
                    </button>
                  </>
                )}
                {categories.length > 0 && (
                  <div className="pt-2 space-y-1 border-t border-border/60 mt-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">Categorías</p>
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleCategorySelect(c)}
                        className="w-full text-left text-sm font-medium min-h-11 flex items-center px-3 rounded-lg text-muted-foreground hover:bg-muted/50 active:bg-muted/60 transition-colors touch-manipulation"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
