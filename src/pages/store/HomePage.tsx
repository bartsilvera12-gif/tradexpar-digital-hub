import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap, Shield, Globe, TrendingUp, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/store/ProductCard";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import { api } from "@/services/api";
import type { Product } from "@/types";

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

  const categoryMap = new Map<string, Product[]>();
  products.forEach((p) => {
    if (!p.category) return;
    if (!categoryMap.has(p.category)) categoryMap.set(p.category, []);
    categoryMap.get(p.category)!.push(p);
  });
  const allCategories = [...categoryMap.entries()];
  const viralDropi = products.filter((p) => p.product_source_type === "dropi").slice(0, 4);

  return (
    <>
      {/* Hero — untouched */}
      <section className="relative overflow-hidden">
        <img
          src="https://res.cloudinary.com/drupicep5/image/upload/v1774384987/6b7b8009-8b0c-4d66-8b6e-7c4393582258.png"
          alt="Tradexpar Hero"
          className="w-full h-auto block"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 z-10 container mx-auto px-4 pb-10 lg:pb-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-xl"
          >
            <h1 className="text-3xl lg:text-5xl font-bold text-primary-foreground leading-tight mb-4">
              Distribución digital<br />
              <span className="text-gradient">de alto rendimiento</span>
            </h1>
            <p className="text-base text-primary-foreground/70 mb-6 max-w-md">
              Accede a productos digitales premium con la confianza y tecnología de Tradexpar.
            </p>
            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-7 py-3 gradient-celeste text-primary-foreground font-semibold rounded-2xl hover:opacity-90 transition-opacity shadow-brand"
            >
              Explorar catálogo
              <ArrowRight className="h-5 w-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Category pills */}
      {!loading && !error && allCategories.length > 0 && (
        <section className="bg-card border-b">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
              <Link
                to="/products"
                className="shrink-0 px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90"
              >
                Ver todo
              </Link>
              {allCategories.map(([cat]) => (
                <Link
                  key={cat}
                  to={`/products?category=${encodeURIComponent(cat)}`}
                  className="shrink-0 px-5 py-2 rounded-full border text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-all"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Products */}
      <section className="container mx-auto px-4 py-14 space-y-16">
        {loading && <Loader text="Cargando productos..." />}
        {error && <ErrorState message={error} onRetry={fetchProducts} />}
        {!loading && !error && products.length === 0 && (
          <EmptyState title="Sin productos aún" description="El catálogo se poblará cuando haya productos disponibles en la API." />
        )}

        {/* Productos destacados */}
        {!loading && !error && products.length > 0 && (
          <ProductSection
            title="Productos destacados"
            linkTo="/products"
            products={products.slice(0, 8)}
          />
        )}

        {/* Los más virales */}
        {!loading && !error && viralDropi.length > 0 && (
          <ProductSection
            title="Los más virales"
            subtitle="Tendencias del momento"
            linkTo="/products?source=dropi"
            products={viralDropi}
          />
        )}

        {/* Por categoría */}
        {!loading && !error && allCategories.map(([category, catProducts]) => (
          <ProductSection
            key={category}
            title={category}
            linkTo={`/products?category=${encodeURIComponent(category)}`}
            products={catProducts.slice(0, 4)}
          />
        ))}
      </section>

      {/* Benefits */}
      <section className="bg-secondary">
        <div className="container mx-auto px-4 py-20">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl lg:text-4xl font-bold text-secondary-foreground mb-3">
              ¿Por qué Tradexpar?
            </h2>
            <p className="text-secondary-foreground/60 max-w-lg mx-auto">
              Confianza, tecnología y soporte que respaldan cada compra
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.45 }}
                className="group relative rounded-2xl p-7 text-center border border-secondary-foreground/10 bg-secondary-foreground/5 hover:bg-secondary-foreground/10 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-xl gradient-celeste flex items-center justify-center mx-auto mb-5 shadow-brand group-hover:scale-105 transition-transform duration-300">
                  <b.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-secondary-foreground mb-2">{b.title}</h3>
                <p className="text-sm text-secondary-foreground/60 leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Reusable section component ─── */
function ProductSection({
  title,
  subtitle,
  linkTo,
  products,
}: {
  title: string;
  subtitle?: string;
  linkTo: string;
  products: Product[];
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <Link
          to={linkTo}
          className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Ver todos
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
      <Link
        to={linkTo}
        className="mt-4 text-sm font-medium text-primary hover:underline md:hidden flex items-center justify-center gap-1"
      >
        Ver todos <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
