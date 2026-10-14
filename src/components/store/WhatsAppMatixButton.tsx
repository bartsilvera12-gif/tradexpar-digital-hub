import { getWhatsAppDigits } from "@/config/whatsapp";

/** Avatar de Matix (PNG transparente). */
const MATIX_AVATAR = "/images/matix/matix-pulgar.png";

const GREETING = "¡Hola Matix! 👋 Vengo desde la web de Tradexpar y quería hacer una consulta.";

/**
 * Botón flotante de WhatsApp con Matix (agente del WhatsApp Business de Tradexpar).
 * Fijo abajo a la derecha, en todas las páginas de la tienda. Abre el chat con el
 * número configurado en `config/whatsapp.ts`.
 */
export function WhatsAppMatixButton() {
  const href = `https://wa.me/${getWhatsAppDigits()}?text=${encodeURIComponent(GREETING)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultá con Matix por WhatsApp"
      className="group fixed right-3 z-40 flex items-center gap-2 bottom-[max(0.9rem,env(safe-area-inset-bottom))] motion-safe:animate-[matixFloat_2.6s_ease-in-out_infinite] sm:right-5 sm:bottom-6"
    >
      {/* Etiqueta (desktop) */}
      <span className="hidden rounded-full bg-[#111b2e] px-3.5 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 md:block">
        Consultá con Matix
      </span>

      {/* Burbuja con Matix + glifo WhatsApp */}
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-[0_8px_24px_-4px_rgba(37,211,102,0.6)] transition-transform duration-300 group-hover:scale-105 group-active:scale-95 sm:h-16 sm:w-16">
        {/* Anillo pulsante */}
        <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-30" />
        {/* Avatar de Matix (cabeza visible con object-top) */}
        <img
          src={MATIX_AVATAR}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="relative h-full w-full rounded-full object-cover object-top"
        />
        {/* Glifo WhatsApp */}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow sm:h-7 sm:w-7">
          <svg viewBox="0 0 32 32" className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true">
            <path
              fill="#25D366"
              d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3z"
            />
            <path
              fill="#fff"
              d="M12.3 9.5c-.3-.6-.5-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9 0 1.7 1.2 3.3 1.4 3.6.2.3 2.4 3.8 6 5.2 3 1.2 3.6 1 4.2.9.6-.1 2-.8 2.3-1.6.3-.8.3-1.5.2-1.6-.1-.1-.3-.2-.6-.4-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.8.2-.2.3-.8 1.1-1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.7-1.7-1-.9-1.7-2-1.9-2.3-.2-.3 0-.5.1-.7.1-.1.3-.4.5-.6.1-.2.2-.3.3-.6.1-.2 0-.4 0-.6 0-.2-.8-2-1.1-2.7z"
            />
          </svg>
        </span>
      </span>
    </a>
  );
}
