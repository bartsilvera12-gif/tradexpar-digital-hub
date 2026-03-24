import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart, Menu, X, Search, ChevronDown } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/services/api";
import type { Product } from "@/types";
import logoIcon from "@/assets/logo-icon.png";
import { CartDropdown } from "@/components/store/CartDropdown";

export function StoreNavbar() {
  const { totalItems } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);

  const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))];

  useEffect(() => {
    api.getProducts().then(setAllProducts).catch(() => {});
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
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={logoIcon} alt="Tradexpar" className="w-8 h-8" width={32} height={32} />
          <span className="text-xl font-bold tracking-tight text-foreground">
            TRADE<span className="text-gradient">XPAR</span>
          </span>
        </Link>

        {/* Search bar — desktop */}
        <div ref={searchRef} className="hidden md:flex flex-1 max-w-xl relative">
          <div className="flex w-full border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring transition-shadow">
            <input
              type="text"
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
                      ${p.price.toLocaleString("es-PY")}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-6 shrink-0">
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

        {/* Cart + mobile toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <button
              onClick={() => setCartOpen(!cartOpen)}
              className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted/50 transition-colors"
            >
              <ShoppingCart className="h-5 w-5 text-foreground" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            </button>
            <AnimatePresence>
              <CartDropdown open={cartOpen} onClose={useCallback(() => setCartOpen(false), [])} />
            </AnimatePresence>
          </div>

          <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
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
            <div className="p-4 space-y-3">
              {/* Mobile search */}
              <div className="relative">
                <div className="flex w-full border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                    onFocus={() => query.trim() && setShowResults(true)}
                    placeholder="Estoy buscando..."
                    className="flex-1 px-4 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground outline-none"
                  />
                  <button className="px-3 bg-primary text-primary-foreground">
                    <Search className="h-4 w-4" />
                  </button>
                </div>
                <AnimatePresence>
                  {showResults && results.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-xl shadow-lg overflow-hidden z-50"
                    >
                      {results.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleSelect(p)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                        >
                          <img src={p.images?.[0] || p.image} alt={p.name} className="w-10 h-10 rounded-lg object-contain bg-muted/20 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          </div>
                          <span className="text-sm font-bold text-foreground shrink-0">
                            ${p.price.toLocaleString("es-PY")}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <nav className="flex flex-col gap-2">
                <Link to="/" onClick={() => setMobileOpen(false)} className={`text-sm font-medium py-2 px-3 rounded-lg transition-colors ${location.pathname === "/" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Inicio
                </Link>
                <Link to="/products" onClick={() => setMobileOpen(false)} className={`text-sm font-medium py-2 px-3 rounded-lg transition-colors ${location.pathname.startsWith("/products") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Catálogo
                </Link>
                {categories.length > 0 && (
                  <div className="pl-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1">Categorías</p>
                    {categories.map((c) => (
                      <button
                        key={c}
                        onClick={() => handleCategorySelect(c)}
                        className="w-full text-left text-sm font-medium py-2 px-3 rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors"
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
