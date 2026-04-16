import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Zap, Shield, Globe, TrendingUp, ChevronRight, ShoppingCart, Warehouse, Truck } from "lucide-react";
import processStep1 from "@/assets/process-step1.jpg";
import processStep2 from "@/assets/process-step2.jpg";
import processStep3 from "@/assets/process-step3.jpg";
import { ProductCard } from "@/components/store/ProductCard";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import type { Product } from "@/types";
import { useStoreCatalog } from "@/hooks/useStoreCatalog";

const benefits = [
  { icon: Zap, title: "Entrega inmediata", desc: "Productos digitales al instante" },
  { icon: Shield, title: "100% Seguro", desc: "Pagos protegidos y verificados" },
  { icon: Globe, title: "Acceso global", desc: "Disponible en cualquier momento" },
  { icon: TrendingUp, title: "Soporte dedicado", desc: "Atención profesional continua" },
];

export default function HomePage() {
  const { data: products = [], isPending: loading, error: queryError, refetch } = useStoreCatalog();
  const error = queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;
  const fetchProducts = () => {
    void refetch();
  };

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
      <section className="relative overflow-hidden isolate">
        <img
          src="https://res.cloudinary.com/drupicep5/image/upload/v1774384987/6b7b8009-8b0c-4d66-8b6e-7c4393582258.png"
          alt="Tradexpar Hero"
          className="w-full h-auto max-w-full block"
          fetchPriority="high"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/25 sm:from-black/80 sm:via-black/30 sm:to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 z-10 container mx-auto px-3 sm:px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:pb-10 lg:pb-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-xl"
          >
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-primary-foreground leading-tight mb-3 sm:mb-4">
              Distribuidora digital<br />
              <span className="text-gradient">de alto rendimiento</span>
            </h1>
            <p className="text-sm sm:text-base text-primary-foreground/70 mb-5 sm:mb-6 max-w-md">
              Accede a productos digitales premium con la confianza y tecnología de Tradexpar.
            </p>
            <Link
              to="/products"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-12 px-7 py-3 gradient-celeste text-primary-foreground font-semibold rounded-2xl hover:opacity-90 active:opacity-95 transition-opacity shadow-brand touch-manipulation"
            >
              Explorar catálogo
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Banner promocional */}
      <section className="w-full">
        <img
          src="https://res.cloudinary.com/drupicep5/image/upload/v1776343515/tradexpar_enhanced_v2_i5vlxm.png"
          alt="Promoción Tradexpar"
          className="w-full h-auto max-w-full block"
          loading="lazy"
          decoding="async"
        />
      </section>

      {/* Products */}
      <section className="container mx-auto px-3 sm:px-4 py-10 sm:py-14 space-y-12 sm:space-y-16">
        {loading && <Loader text="Cargando productos..." />}
        {error && <ErrorState message={error} onRetry={fetchProducts} />}
        {!loading && !error && products.length === 0 && (
          <EmptyState title="Sin productos aún" description="El catálogo se poblará cuando haya productos disponibles en la API." />
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

        {/* Productos destacados */}
        {!loading && !error && products.length > 0 && (
          <ProductSection
            title="Productos destacados"
            linkTo="/products"
            products={products.slice(0, 8)}
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
      <section className="relative overflow-hidden">
        {/* Background with gradient mesh */}
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(195 89% 47%) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(195 89% 60%) 0%, transparent 40%)' }} />
        
        <div className="container mx-auto px-3 sm:px-4 py-16 sm:py-24 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase gradient-celeste text-primary-foreground mb-5">
              Nuestra promesa
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-primary-foreground mb-4">
              ¿Por qué <span className="text-gradient">Tradexpar</span>?
            </h2>
            <p className="text-primary-foreground/50 max-w-lg mx-auto text-base sm:text-lg px-1">
              Confianza, tecnología y soporte que respaldan cada compra
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="group relative rounded-2xl p-8 text-center backdrop-blur-md bg-primary-foreground/[0.04] border border-primary-foreground/10 hover:border-primary/40 hover:bg-primary-foreground/[0.08] transition-all duration-500 hover:shadow-[0_0_40px_-10px_hsl(195_89%_47%/0.25)]"
              >
                {/* Glow dot */}
                <div className="absolute -top-px left-1/2 -translate-x-1/2 w-16 h-[2px] gradient-celeste rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="w-16 h-16 rounded-2xl gradient-celeste flex items-center justify-center mx-auto mb-6 shadow-brand group-hover:scale-110 group-hover:shadow-[0_0_30px_-5px_hsl(195_89%_47%/0.4)] transition-all duration-500">
                  <b.icon className="h-7 w-7 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-primary-foreground text-lg mb-2">{b.title}</h3>
                <p className="text-sm text-primary-foreground/50 leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Nuestro Proceso */}
      <section className="bg-background py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground uppercase tracking-tight mb-3">
              Nuestro Proceso
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Rápido, sencillo y directo a la puerta de tu casa.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { img: processStep1, icon: ShoppingCart, title: "Realizas el pedido en la web" },
              { img: processStep2, icon: Warehouse, title: "Lo preparamos en el depósito" },
              { img: processStep3, icon: Truck, title: "¡Lo recibís en tu casa!" },
            ].map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="group relative rounded-2xl overflow-hidden aspect-[5/4] shadow-card hover:shadow-card-hover transition-shadow duration-500"
              >
                <img
                  src={step.img}
                  alt={step.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                  width={640}
                  height={512}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5">
                  <h3 className="text-xl font-bold text-primary-foreground">{step.title}</h3>
                </div>
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6 min-w-0">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground break-words">{title}</h2>
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
