import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/store/ProductCard";
import { api } from "@/services/api";
import type { Product } from "@/types";
import { useWishlist } from "@/contexts/WishlistContext";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";

export default function WishlistPage() {
  const { productIds } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = () => {
    setLoading(true);
    setError(null);
    api.getProducts()
      .then(setProducts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  const favoriteProducts = useMemo(
    () => products.filter((p) => productIds.includes(p.id)),
    [products, productIds]
  );

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground mb-2">Mis favoritos</h1>
      <p className="text-muted-foreground mb-8">Productos guardados en tu wishlist.</p>
      {loading && <Loader text="Cargando favoritos..." />}
      {error && <ErrorState message={error} onRetry={fetchProducts} />}
      {!loading && !error && favoriteProducts.length === 0 && (
        <EmptyState title="Sin favoritos" description="Aún no agregaste productos a tu wishlist." />
      )}
      {!loading && !error && favoriteProducts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {favoriteProducts.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </div>
      )}
    </div>
  );
}
