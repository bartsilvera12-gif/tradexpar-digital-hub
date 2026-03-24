import { Link } from "react-router-dom";
import logoIcon from "@/assets/logo-icon.png";

export function StoreFooter() {
  return (
    <footer className="bg-secondary text-secondary-foreground">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src={logoIcon} alt="Tradexpar" className="w-7 h-7" width={28} height={28} />
              <span className="text-lg font-bold tracking-tight">TRADEXPAR</span>
            </div>
            <p className="text-sm text-secondary-foreground/70 max-w-xs">
              Distribución digital profesional. Tecnología confiable para tu negocio.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider">Navegación</h4>
            <div className="flex flex-col gap-2">
              <Link to="/" className="text-sm text-secondary-foreground/70 hover:text-primary transition-colors">Inicio</Link>
              <Link to="/products" className="text-sm text-secondary-foreground/70 hover:text-primary transition-colors">Productos</Link>
              <Link to="/cart" className="text-sm text-secondary-foreground/70 hover:text-primary transition-colors">Carrito</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider">Contacto</h4>
            <p className="text-sm text-secondary-foreground/70">info@tradexpar.com</p>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-secondary-foreground/10 text-center">
          <p className="text-xs text-secondary-foreground/50">
            © {new Date().getFullYear()} Tradexpar. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
