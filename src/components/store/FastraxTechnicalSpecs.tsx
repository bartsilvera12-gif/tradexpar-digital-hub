import type { FastraxSpecSection } from "@/lib/fastraxDescriptionParser";

interface FastraxTechnicalSpecsProps {
  sections: FastraxSpecSection[];
  className?: string;
}

/**
 * Ficha técnica para descripciones Fastrax estructuradas.
 *
 * Render visual:
 *  - mobile: stack vertical (label arriba en bold, value abajo).
 *  - sm+: dos columnas con `dl` grid (label compacta + value).
 *  - listas: `<ul>` con bullets y espaciado vertical chico.
 *  - sin bordes ni separadores horizontales (look "premium" sobrio).
 *
 * No usa `dangerouslySetInnerHTML`. La data llega como texto plano y se
 * renderiza directamente como nodos React.
 */
export function FastraxTechnicalSpecs({ sections, className = "" }: FastraxTechnicalSpecsProps) {
  if (!sections || sections.length === 0) return null;

  return (
    <dl
      className={[
        "grid grid-cols-1 sm:grid-cols-[max-content_1fr]",
        "gap-x-6 sm:gap-x-8 gap-y-3 sm:gap-y-4",
        "text-sm sm:text-base leading-relaxed",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {sections.map((s, i) => (
        <FastraxSpecRow key={`${s.label}-${i}`} section={s} />
      ))}
    </dl>
  );
}

function FastraxSpecRow({ section }: { section: FastraxSpecSection }) {
  const isList = Array.isArray(section.value);
  return (
    <>
      <dt className="font-semibold text-foreground sm:pt-0.5 sm:whitespace-nowrap">
        {section.label}
        <span className="hidden sm:inline">:</span>
      </dt>
      <dd className="text-muted-foreground min-w-0">
        {isList ? (
          <ul className="list-disc pl-5 space-y-1 marker:text-primary/70">
            {(section.value as string[]).map((it, j) => (
              <li key={j} className="break-words">
                {it}
              </li>
            ))}
          </ul>
        ) : (
          <span className="break-words">{section.value as string}</span>
        )}
      </dd>
    </>
  );
}
