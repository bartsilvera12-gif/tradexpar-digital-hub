import { PlayCircle } from "lucide-react";

/** Extrae el ID de un video de YouTube de distintos formatos de URL. */
function youtubeId(url: string): string | null {
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/**
 * Muestra el video del producto. Si el link es de YouTube, lo embebe (reproductor
 * 16:9 responsive). Si es de otra plataforma, muestra un botón "Ver video".
 * Solo se renderiza cuando el producto es destacado/viral y tiene link (lo decide
 * quien lo invoca).
 */
export function ProductVideoEmbed({ url, className = "" }: { url: string; className?: string }) {
  const id = youtubeId(url);

  return (
    <section className={className}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl">
        <PlayCircle className="h-5 w-5 text-primary" />
        Video del producto
      </h2>

      {id ? (
        <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-black shadow-sm [aspect-ratio:16/9]">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            title="Video del producto"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground gradient-celeste shadow-brand transition-opacity hover:opacity-90"
        >
          <PlayCircle className="h-5 w-5" />
          Ver video
        </a>
      )}
    </section>
  );
}
