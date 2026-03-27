import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { ProductCard } from "@/components/store/ProductCard";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import { api } from "@/services/api";
import type { Product } from "@/types";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") || "all";
  const source = searchParams.get("source") || "all";

  const fetchProducts = () => {
    setLoading(true);
    setError(null);
    api.getProducts()
      .then((data) => setProducts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  const categories = ["all", ...new Set(products.map((p) => p.category).filter(Boolean))];
  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || p.category === category;
    const matchSource = source === "all" || p.product_source_type === source;
    return matchSearch && matchCat && matchSource;
  });

  const setCategory = (cat: string) => {
    if (cat === "all") {
      searchParams.delete("category");
    } else {
      searchParams.set("category", cat);
    }
    setSearchParams(searchParams);
  };

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-foreground">Catálogo</h1>
        <p className="text-muted-foreground mt-2">Explora nuestro catálogo completo</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar productos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["all", "tradexpar", "dropi"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                if (s === "all") searchParams.delete("source");
                else searchParams.set("source", s);
                setSearchParams(searchParams);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                source === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {s === "all" ? "Todos" : s === "dropi" ? "Dropi" : "Tradexpar"}
            </button>
          ))}
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                category === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {c === "all" ? "Todos" : c}
            </button>
          ))}
        </div>
      </div>

      {loading && <Loader text="Cargando productos..." />}
      {error && <ErrorState message={error} onRetry={fetchProducts} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Sin resultados" description="No se encontraron productos con esos filtros." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
