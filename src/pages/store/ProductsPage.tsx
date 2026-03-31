import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ProductCard } from "@/components/store/ProductCard";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import { tradexpar } from "@/services/tradexpar";
import { getDiscountPercentage, normalizeProductSource } from "@/lib/productHelpers";
import type { Product } from "@/types";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const category = searchParams.get("category") || "all";
  const source = searchParams.get("source") || "all";
  const offersOnly = searchParams.get("offers") === "1";

  const fetchProducts = () => {
    setLoading(true);
    setError(null);
    tradexpar.getProducts()
      .then((data) => setProducts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  const categories = ["all", ...new Set(products.map((p) => p.category).filter(Boolean))];
  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || p.category === category;
    const sourceKnown = source === "tradexpar" || source === "dropi";
    const matchSource = source === "all" || !sourceKnown || normalizeProductSource(p) === source;
    const matchOffers = !offersOnly || getDiscountPercentage(p) > 0;
    return matchSearch && matchCat && matchSource && matchOffers;
  });

  const setCategory = (cat: string) => {
    if (cat === "all") searchParams.delete("category");
    else searchParams.set("category", cat);
    setSearchParams(searchParams);
  };

  const setOffersFilter = (on: boolean) => {
    if (on) searchParams.set("offers", "1");
    else searchParams.delete("offers");
    setSearchParams(searchParams);
  };

  const hasActiveFilters = category !== "all" || source !== "all" || offersOnly;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Catálogo</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered.length} producto{filtered.length !== 1 ? "s" : ""} disponible{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar productos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-4 py-2.5 rounded-xl border text-sm font-medium flex items-center gap-2 transition-all ${
            showFilters || hasActiveFilters
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground hover:border-primary/30"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-primary-foreground" />
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mb-6 p-4 bg-card rounded-xl border space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Categoría</p>
            <div className="flex gap-2 flex-wrap items-center">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    category === c
                      ? "bg-primary text-primary-foreground"
                      : "border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {c === "all" ? "Todos" : c}
                </button>
              ))}
              <span className="hidden sm:inline text-muted-foreground/40 px-1" aria-hidden>
                |
              </span>
              <button
                type="button"
                onClick={() => setOffersFilter(!offersOnly)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  offersOnly
                    ? "bg-destructive text-destructive-foreground"
                    : "border text-muted-foreground hover:border-destructive/40"
                }`}
              >
                Ofertas
              </button>
            </div>
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => {
                searchParams.delete("category");
                searchParams.delete("source");
                searchParams.delete("offers");
                setSearchParams(searchParams);
              }}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {loading && <Loader text="Cargando productos..." />}
      {error && <ErrorState message={error} onRetry={fetchProducts} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Sin resultados" description="No se encontraron productos con esos filtros." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
          {filtered.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
