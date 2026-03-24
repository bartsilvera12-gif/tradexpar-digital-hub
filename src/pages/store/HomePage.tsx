import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap, Shield, Globe, TrendingUp } from "lucide-react";
import { ProductCard } from "@/components/store/ProductCard";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import { api } from "@/services/api";
import type { Product } from "@/types";
import { HeroProductSlideshow } from "@/components/store/HeroProductSlideshow";


const benefits = [
  { icon: Zap, title: "Entrega inmediata", desc: "Productos digitales al instante" },
  { icon: Shield, title: "100% Seguro", desc: "Pagos protegidos y verificados" },
  { icon: Globe, title: "Acceso global", desc: "Disponible en cualquier momento" },
  { icon: TrendingUp, title: "Soporte dedicado", desc: "Atención profesional continua" },
];

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = () => {
    setLoading(true);
    setError(null);
    api.getProducts()
      .then((data) => setProducts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  // Group products by category
  const categoryMap = new Map<string, Product[]>();
  products.forEach((p) => {
    if (!p.category) return;
    if (!categoryMap.has(p.category)) categoryMap.set(p.category, []);
    categoryMap.get(p.category)!.push(p);
  });
  const allCategories = [...categoryMap.entries()];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden min-h-[500px]">
        <HeroProductSlideshow products={products} />
        <div className="absolute inset-0 bg-gradient-to-r from-secondary/95 to-secondary/70" />
        <div className="container mx-auto px-4 py-24 lg:py-36 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-2xl"
          >
            <h1 className="text-4xl lg:text-6xl font-bold text-secondary-foreground leading-tight mb-6">
              Distribución digital<br />
              <span className="text-gradient">de alto rendimiento</span>
            </h1>
            <p className="text-lg text-secondary-foreground/70 mb-8 max-w-lg">
              Accede a productos digitales premium con la confianza y tecnología de Tradexpar.
            </p>
            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-8 py-4 gradient-celeste text-primary-foreground font-semibold rounded-2xl hover:opacity-90 transition-opacity shadow-brand"
            >
              Explorar catálogo
              <ArrowRight className="h-5 w-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Products sections */}
      <section className="container mx-auto px-4 py-20 space-y-16">
        {loading && <Loader text="Cargando productos..." />}
        {error && <ErrorState message={error} onRetry={fetchProducts} />}
        {!loading && !error && products.length === 0 && (
          <EmptyState title="Sin productos aún" description="El catálogo se poblará cuando haya productos disponibles en la API." />
        )}

        {/* Productos destacados — all products together */}
        {!loading && !error && products.length > 0 && (
          <div>
            <div className="flex items-end justify-between mb-8">
              <h2 className="text-3xl font-bold text-foreground">Productos destacados</h2>
              <Link
                to="/products"
                className="text-sm font-medium text-primary hover:underline hidden md:block"
              >
                Ver todos →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(0, 8).map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
            <Link
              to="/products"
              className="mt-4 text-sm font-medium text-primary hover:underline md:hidden block text-center"
            >
              Ver todos →
            </Link>
          </div>
        )}

        {/* Sections per category */}
        {!loading && !error && allCategories.map(([category, catProducts]) => (
          <div key={category}>
            <div className="flex items-end justify-between mb-8">
              <h2 className="text-3xl font-bold text-foreground">{category}</h2>
              <Link
                to={`/products?category=${encodeURIComponent(category)}`}
                className="text-sm font-medium text-primary hover:underline hidden md:block"
              >
                Ver todos →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {catProducts.slice(0, 4).map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
            <Link
              to={`/products?category=${encodeURIComponent(category)}`}
              className="mt-4 text-sm font-medium text-primary hover:underline md:hidden block text-center"
            >
              Ver todos →
            </Link>
          </div>
        ))}
      </section>

      {/* Benefits */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/40 to-secondary" />
        <div className="container mx-auto px-4 py-24 relative z-10">
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl lg:text-4xl font-bold text-foreground text-center mb-16"
          >
            ¿Por qué Tradexpar?
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="group relative bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl p-8 text-center hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
              >
                <div className="w-16 h-16 rounded-2xl gradient-celeste flex items-center justify-center mx-auto mb-5 shadow-md shadow-primary/20 group-hover:scale-110 transition-transform duration-300">
                  <b.icon className="h-7 w-7 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-foreground mb-2 text-lg">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}
