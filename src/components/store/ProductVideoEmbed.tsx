import { PlayCircle } from "lucide-react";

/** Extrae el ID de un video de YouTube de distintos formatos de URL. */
function youtubeId(url: string): string | null {
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/** Extrae el ID de un archivo de Google Drive (link de compartir /file/d/ID/...). */
function driveId(url: string): string | null {
  const s = String(url);
  const m = s.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/) ||
    s.match(/drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)/) ||
    s.match(/drive\.google\.com\/uc\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * Muestra el video del producto. Si el link es de YouTube, lo embebe (reproductor
 * 16:9 responsive). Si es de otra plataforma, muestra un botón "Ver video".
 * Solo se renderiza cuando el producto es destacado/viral y tiene link (lo decide
 * quien lo invoca).
 */
export function ProductVideoEmbed({ url, className = "" }: { url: string; className?: string }) {
  const ytId = youtubeId(url);
  const gdId = ytId ? null : driveId(url);
  const embedSrc = ytId
    ? `https://www.youtube-nocookie.com/embed/${ytId}`
    : gdId
      ? `https://drive.google.com/file/d/${gdId}/preview`
      : null;

  return (
    <section className={className}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl">
        <PlayCircle className="h-5 w-5 text-primary" />
        Video del producto
      </h2>

      {embedSrc ? (
        <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-black shadow-sm [aspect-ratio:16/9]">
          <iframe
            src={embedSrc}
            title="Video del producto"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
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
