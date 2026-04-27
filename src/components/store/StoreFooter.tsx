import logoIcon from "@/assets/logo-x-flat.png";
import paymentMethods from "@/assets/payment-methods.png";
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
      <div className="bg-card border-y">
        <div className="container mx-auto py-2.5 sm:py-3 md:py-4 min-w-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-lg sm:rounded-xl overflow-hidden border border-border bg-border max-w-full">
            {trustItems.map((item) => (
              <div
                key={item.label}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 md:gap-2.5 px-1.5 sm:px-3 md:px-4 py-2.5 sm:py-3 bg-card text-center min-w-0"
              >
                <item.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                <span className="text-[9px] min-[400px]:text-[10px] sm:text-xs font-bold tracking-tight sm:tracking-wide text-foreground uppercase leading-tight [text-wrap:balance] px-0.5">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    <footer className="bg-secondary text-secondary-foreground">
      <div className="container mx-auto pt-8 sm:pt-12 md:pt-14 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8 min-w-0 max-w-full">
        <div className="mb-10 max-w-4xl mx-auto flex flex-col sm:flex-row justify-center items-start gap-10 sm:gap-12 md:gap-16 lg:gap-20">
          {/* Brand */}
          <div className="w-full sm:w-[min(100%,22rem)] text-center sm:text-left mx-auto sm:mx-0">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-4">
              <img src={logoIcon} alt="Tradexpar" className="w-8 h-8" width={32} height={32} />
              <span className="text-lg font-bold tracking-tight">
                TRADE<span className="text-gradient">XPAR</span>
              </span>
            </div>
            <p className="text-sm text-secondary-foreground/60 max-w-sm mx-auto sm:mx-0 leading-relaxed">
              Distribución digital profesional. Tecnología confiable, productos de calidad y soporte dedicado para tu negocio.
            </p>
          </div>

          {/* Contact */}
          <div className="w-full sm:w-auto sm:min-w-[12rem] text-center sm:text-left mx-auto sm:mx-0">
            <h4 className="font-semibold mb-4 text-xs uppercase tracking-widest text-secondary-foreground/40">Contacto</h4>
            <div className="flex flex-col gap-3 items-center sm:items-start">
              <div className="flex items-center justify-center sm:justify-start gap-2.5">
                <Mail className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-secondary-foreground/60">info@tradexpar.com</span>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2.5">
                <Phone className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-secondary-foreground/60">+595 XXX XXX XXX</span>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-2.5">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-secondary-foreground/60">Paraguay</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-secondary-foreground/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-secondary-foreground/40">
            Desarrollado por Neura
          </p>
          <div className="flex items-center">
            <img
              src={paymentMethods}
              alt="Métodos de pago: Visa, Mastercard, PayPal, American Express, Visa Electron, Maestro"
              className="h-6 sm:h-8 max-w-full w-auto object-contain object-right"
            />
          </div>
        </div>
      </div>
    </footer>
    </>
  );
}
