import { useMemo } from "react";
import { ProductCard } from "@/components/store/ProductCard";
import { useWishlist } from "@/contexts/WishlistContext";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import { useStoreCatalog } from "@/hooks/useStoreCatalog";

export default function WishlistPage() {
  const { productIds } = useWishlist();
  const { data: products = [], isPending: loading, error: queryError, refetch } = useStoreCatalog();
  const error = queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  const fetchProducts = () => {
    void refetch();
  };

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
