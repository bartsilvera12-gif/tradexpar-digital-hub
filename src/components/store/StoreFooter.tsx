import { Link } from "react-router-dom";
import logoIcon from "@/assets/logo-icon.png";
import { Mail, Phone, MapPin, Truck, ShieldCheck, Headphones, CheckCircle } from "lucide-react";

const trustItems = [
  { icon: Truck, label: "ENVÍO SEGURO" },
  { icon: ShieldCheck, label: "GARANTÍA" },
  { icon: Headphones, label: "SOPORTE 24/7" },
  { icon: CheckCircle, label: "100% SEGURO" },
];

export function StoreFooter() {
  return (
    <>
      {/* Trust bar */}
      <div className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {trustItems.map((item) => (
              <div key={item.label} className="flex items-center justify-center gap-3">
                <item.icon className="h-6 w-6 text-primary shrink-0" />
                <span className="text-xs font-bold tracking-wider text-foreground uppercase">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    <footer className="bg-secondary text-secondary-foreground">
      <div className="container mx-auto px-4 pt-14 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <img src={logoIcon} alt="Tradexpar" className="w-8 h-8" width={32} height={32} />
              <span className="text-lg font-bold tracking-tight">
                TRADE<span className="text-gradient">XPAR</span>
              </span>
            </div>
            <p className="text-sm text-secondary-foreground/60 max-w-sm leading-relaxed">
              Distribución digital profesional. Tecnología confiable, productos de calidad y soporte dedicado para tu negocio.
            </p>
          </div>

          {/* Nav */}
          <div>
            <h4 className="font-semibold mb-4 text-xs uppercase tracking-widest text-secondary-foreground/40">Navegación</h4>
            <div className="flex flex-col gap-2.5">
              <Link to="/" className="text-sm text-secondary-foreground/60 hover:text-primary transition-colors">Inicio</Link>
              <Link to="/products" className="text-sm text-secondary-foreground/60 hover:text-primary transition-colors">Catálogo</Link>
              <Link to="/cart" className="text-sm text-secondary-foreground/60 hover:text-primary transition-colors">Carrito</Link>
              <Link to="/wishlist" className="text-sm text-secondary-foreground/60 hover:text-primary transition-colors">Favoritos</Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-4 text-xs uppercase tracking-widest text-secondary-foreground/40">Contacto</h4>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-secondary-foreground/60">info@tradexpar.com</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-secondary-foreground/60">+595 XXX XXX XXX</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-secondary-foreground/60">Paraguay</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-secondary-foreground/10 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-secondary-foreground/40">
            © {new Date().getFullYear()} Tradexpar. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-secondary-foreground/40">Distribución Digital</span>
          </div>
        </div>
      </div>
    </footer>
    </>
  );
}
