import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Zap, Shield, Globe, TrendingUp, ChevronRight, ShoppingCart, Warehouse, Truck } from "lucide-react";
import processStep1 from "@/assets/process-step1.jpg";
import processStep2 from "@/assets/process-step2.jpg";
import processStep3 from "@/assets/process-step3.jpg";
import { ProductCard } from "@/components/store/ProductCard";
import { ViralProductRotatingSection } from "@/components/store/ViralProductRotatingSection";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import type { Product } from "@/types";
import { useStoreCatalog } from "@/hooks/useStoreCatalog";
import { withAffiliateRef } from "@/lib/affiliate";

/** Hero principal inicio — Cloudinary (ancho completo, altura natural: se ve el encuadre completo). */
const HERO_IMAGE_URL =
  "https://res.cloudinary.com/drupicep5/image/upload/v1777298367/f56bf9d5-0a1f-45e9-94a4-868d74c98f5d.png";

const benefits = [
  { icon: Zap, title: "Entrega inmediata", desc: "Productos digitales al instante" },
  { icon: Shield, title: "100% Seguro", desc: "Pagos protegidos y verificados" },
  { icon: Globe, title: "Acceso global", desc: "Disponible en cualquier momento" },
  { icon: TrendingUp, title: "Soporte dedicado", desc: "Atención profesional continua" },
];

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const refForLink = searchParams.get("ref");
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
  const viralDropiAll = products.filter((p) => p.product_source_type === "dropi");

  return (
    <>
      {/* Hero: imagen completa (sin recorte); el alto sigue la proporción real del PNG. */}
      <section className="relative isolate w-full max-w-[100vw] overflow-hidden">
        <img
          src={HERO_IMAGE_URL}
          alt="Tradexpar — Distribuidora digital"
          className="relative z-0 block h-auto w-full max-w-full"
          sizes="100vw"
          fetchPriority="high"
          decoding="async"
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/90 via-black/45 to-black/25 sm:from-black/80 sm:via-black/30 sm:to-transparent"
          aria-hidden
        />
        <div className="absolute bottom-0 left-0 right-0 z-10 max-w-screen-xl mx-auto px-3 sm:px-4 pb-[max(2.25rem,env(safe-area-inset-bottom))] sm:pb-10 lg:pb-16 pointer-events-none [&_a]:pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-xl w-full"
          >
            <h1 className="text-[clamp(1.2rem,4.5vw+0.4rem,3.15rem)] sm:text-3xl md:text-4xl lg:text-5xl font-bold text-primary-foreground leading-[1.12] sm:leading-tight mb-3 sm:mb-4 [text-wrap:balance]">
              Distribuidora digital<br />
              <span className="text-gradient">de alto rendimiento</span>
            </h1>
            <p className="text-sm sm:text-base text-primary-foreground/80 sm:text-primary-foreground/70 mb-5 sm:mb-6 max-w-md leading-relaxed [text-wrap:balance]">
              Accede a productos digitales premium con la confianza y tecnología de Tradexpar.
            </p>
            <Link
              to={withAffiliateRef("/products", refForLink)}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-12 sm:min-h-12 px-5 sm:px-7 py-3.5 sm:py-3 text-[15px] sm:text-base gradient-celeste text-primary-foreground font-semibold rounded-2xl hover:opacity-90 active:opacity-95 transition-opacity shadow-brand touch-manipulation"
            >
              Explorar catálogo
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Banner promocional */}
      <section className="w-full max-w-[100vw] overflow-hidden">
        <img
          src="https://res.cloudinary.com/drupicep5/image/upload/v1776343515/tradexpar_enhanced_v2_i5vlxm.png"
          alt="Promoción Tradexpar"
          className="w-full h-auto max-w-full block"
          sizes="100vw"
          loading="lazy"
          decoding="async"
        />
      </section>

      {/* Products */}
      <section className="container mx-auto py-8 sm:py-10 md:py-14 space-y-10 sm:space-y-12 md:space-y-16 max-w-full">
        {loading && <Loader text="Cargando productos..." />}
        {error && <ErrorState message={error} onRetry={fetchProducts} />}
        {!loading && !error && products.length === 0 && (
          <EmptyState title="Sin productos aún" description="El catálogo se poblará cuando haya productos disponibles en la API." />
        )}

        {/* Los más virales */}
        {!loading && !error && viralDropiAll.length > 0 && (
          <ViralProductRotatingSection
            title="Los más virales"
            subtitle="Tendencias del momento"
            linkTo={withAffiliateRef("/products?source=dropi", refForLink)}
            products={viralDropiAll}
          />
        )}

        {/* Productos destacados */}
        {!loading && !error && products.length > 0 && (
          <ProductSection
            title="Productos destacados"
            linkTo={withAffiliateRef("/products", refForLink)}
            products={products.slice(0, 8)}
          />
        )}

        {/* Por categoría */}
        {!loading && !error && allCategories.map(([category, catProducts]) => (
          <ProductSection
            key={category}
            title={category}
            linkTo={withAffiliateRef(
              `/products?category=${encodeURIComponent(category)}`,
              refForLink
            )}
            products={catProducts.slice(0, 4)}
          />
        ))}
      </section>

      {/* Benefits */}
      <section className="relative overflow-hidden">
        {/* Background with gradient mesh */}
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(195 89% 47%) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(195 89% 60%) 0%, transparent 40%)' }} />
        
        <div className="container mx-auto py-12 sm:py-16 md:py-24 relative z-10 max-w-full">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 sm:mb-16 px-1"
          >
            <span className="inline-block px-3.5 sm:px-4 py-1.5 rounded-full text-[0.7rem] sm:text-xs font-semibold tracking-widest uppercase gradient-celeste text-primary-foreground mb-4 sm:mb-5">
              Nuestra promesa
            </span>
            <h2 className="text-[clamp(1.25rem,3.5vw+0.4rem,3rem)] sm:text-3xl lg:text-5xl font-bold text-primary-foreground mb-3 sm:mb-4 [text-wrap:balance] px-1">
              ¿Por qué <span className="text-gradient">Tradexpar</span>?
            </h2>
            <p className="text-primary-foreground/50 max-w-lg mx-auto text-sm sm:text-base md:text-lg px-2 [text-wrap:balance]">
              Confianza, tecnología y soporte que respaldan cada compra
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-6xl mx-auto">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="group relative rounded-2xl p-6 sm:p-7 md:p-8 text-center backdrop-blur-md bg-primary-foreground/[0.04] border border-primary-foreground/10 hover:border-primary/40 hover:bg-primary-foreground/[0.08] transition-all duration-500 hover:shadow-[0_0_40px_-10px_hsl(195_89%_47%/0.25)]"
              >
                {/* Glow dot */}
                <div className="absolute -top-px left-1/2 -translate-x-1/2 w-16 h-[2px] gradient-celeste rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl gradient-celeste flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-brand group-hover:scale-110 group-hover:shadow-[0_0_30px_-5px_hsl(195_89%_47%/0.4)] transition-all duration-500">
                  <b.icon className="h-6 w-6 sm:h-7 sm:w-7 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-primary-foreground text-base sm:text-lg mb-1.5 sm:mb-2 [text-wrap:balance]">{b.title}</h3>
                <p className="text-sm text-primary-foreground/50 leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Nuestro Proceso */}
      <section className="bg-background py-12 sm:py-16 md:py-20">
        <div className="container mx-auto max-w-full">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8 sm:mb-12 md:mb-14 px-2"
          >
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-foreground uppercase tracking-tight mb-2 sm:mb-3 [text-wrap:balance]">
              Nuestro Proceso
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto [text-wrap:balance]">
              Rápido, sencillo y directo a la puerta de tu casa.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-6">
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
    <div className="min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4 sm:mb-6 min-w-0">
        <div className="min-w-0 pr-1">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground break-words [text-wrap:balance]">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">{subtitle}</p>}
        </div>
        <Link
          to={linkTo}
          className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline shrink-0"
        >
          Ver todos
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 lg:gap-5">
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
