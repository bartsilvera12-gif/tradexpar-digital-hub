/**
 * Ilustraciones vectoriales alineadas al copy de /sobre-tradexpar.
 * Reemplazo por fotos: envolvé el contenido en AboutVisualFrame y usá
 * <img src="/ruta.jpg" alt="…" className="h-full w-full object-cover rounded-[inherit]" />
 * (misma composición que el frame: aspect ratio y bordes).
 */
import { cn } from "@/lib/utils";

const P = "hsl(195 89% 47%)";
const P_SOFT = "hsl(195 89% 47% / 0.35)";
const INK = "hsl(213 63% 17% / 0.18)";
const LINE = "hsl(220 13% 91%)";

export function AboutVisualFrame({
  children,
  className,
  imageBleed,
  "data-visual": dataVisual,
}: {
  children: React.ReactNode;
  className?: string;
  /** Sin padding interno: la imagen cubre todo el marco (fallback SVG puede llevar su propio aire). */
  imageBleed?: boolean;
  /** Identificador del bloque (sustituir por &lt;img&gt; cuando haya fotografía). */
  "data-visual"?: string;
}) {
  return (
    <div
      data-visual={dataVisual}
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border border-border/70 shadow-[0_1px_0_0_hsl(var(--border)/0.45),0_20px_40px_-28px_hsl(213_63%_17%/0.14)]",
        imageBleed
          ? "bg-muted/20"
          : "bg-card/80 aspect-[4/3] sm:aspect-[5/4] lg:aspect-auto lg:min-h-[280px] lg:max-h-[340px]",
        className
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_95%_70%_at_15%_0%,hsl(195_89%_47%_/_0.16),transparent_58%)]",
          imageBleed && "hidden"
        )}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:22px_22px] opacity-[0.4]",
          imageBleed && "hidden"
        )}
        aria-hidden
      />
      {imageBleed ? (
        <div className="absolute inset-0 z-[1] overflow-hidden rounded-[inherit]">
          {children}
        </div>
      ) : (
        <div className="relative flex h-full min-h-[200px] items-center justify-center p-6 sm:p-8">{children}</div>
      )}
    </div>
  );
}

/** Identidad: flujo producto → distribución digital → mercado (nodos + canal). */
export function VisualDigitalDistribution() {
  return (
    <svg viewBox="0 0 360 240" className="h-auto w-full max-w-[300px] text-foreground" aria-hidden>
      <rect x="32" y="88" width="56" height="64" rx="10" fill="none" stroke={INK} strokeWidth="1.5" />
      <path d="M48 104h24M48 120h18M48 136h22" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      <path d="M108 120h48" stroke={P} strokeWidth="2" strokeDasharray="6 5" />
      <polygon points="156,116 168,120 156,124" fill={P} />
      <rect x="176" y="72" width="152" height="96" rx="12" fill="hsl(0 0% 100% / 0.65)" stroke={INK} strokeWidth="1.25" />
      <circle cx="220" cy="108" r="18" fill="none" stroke={P_SOFT} strokeWidth="1.5" />
      <path d="M212 108l6 6 14-14" stroke={P} strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="196" y="138" width="112" height="10" rx="3" fill={LINE} />
      <rect x="196" y="154" width="72" height="6" rx="2" fill={LINE} opacity="0.7" />
      <text
        x="252"
        y="54"
        textAnchor="middle"
        fill="hsl(215 16% 47%)"
        style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em" }}
      >
        CANAL DIGITAL
      </text>
    </svg>
  );
}

/** Metodología: tres pilares ascendentes (estructura, ejecución, adaptación). */
export function VisualThreePillars() {
  return (
    <svg viewBox="0 0 360 240" className="h-auto w-full max-w-[300px]" aria-hidden>
      <line x1="48" y1="200" x2="312" y2="200" stroke={LINE} strokeWidth="1.5" />
      {[0, 1, 2].map((i) => {
        const x = 72 + i * 88;
        const h = 72 + i * 28;
        return (
          <g key={i}>
            <rect x={x} y={200 - h} width="44" height={h} rx="6" fill="hsl(0 0% 100% / 0.7)" stroke={i === 2 ? P : INK} strokeWidth="1.25" />
            <text
              x={x + 22}
              y={200 - h - 10}
              textAnchor="middle"
              fill={P}
              style={{ fontSize: 11, fontWeight: 700 }}
            >
              {`0${i + 1}`}
            </text>
          </g>
        );
      })}
      <path d="M94 52 Q180 28 266 52" fill="none" stroke={P_SOFT} strokeWidth="1.25" />
    </svg>
  );
}

/** Operación: pipeline integrado (gestión → canal → coordinación → mejora). */
export function VisualIntegratedOperation() {
  const nodes = [
    { x: 52, label: "Gestión" },
    { x: 128, label: "Digital" },
    { x: 204, label: "Equipo" },
    { x: 288, label: "Mejora" },
  ];
  return (
    <svg viewBox="0 0 360 220" className="h-auto w-full max-w-[320px]" aria-hidden>
      {nodes.map((n, i) => (
        <g key={n.label}>
          {i < nodes.length - 1 && (
            <line x1={n.x + 22} y1="110" x2={nodes[i + 1].x - 22} y2="110" stroke={LINE} strokeWidth="2" />
          )}
          <circle cx={n.x} cy="110" r="22" fill="hsl(0 0% 100% / 0.85)" stroke={P} strokeWidth="1.5" />
          <circle cx={n.x} cy="110" r="6" fill={P} opacity="0.25" />
        </g>
      ))}
      {nodes.map((n) => (
        <text
          key={n.label}
          x={n.x}
          y="168"
          textAnchor="middle"
          fill="hsl(215 16% 47%)"
          style={{ fontSize: 8, fontWeight: 500 }}
        >
          {n.label}
        </text>
      ))}
    </svg>
  );
}

/** Mercado: foco local + ondas de confianza / experiencia. */
export function VisualLocalMarketTrust() {
  return (
    <svg viewBox="0 0 360 240" className="h-auto w-full max-w-[280px]" aria-hidden>
      <circle cx="180" cy="118" r="72" fill="none" stroke={LINE} strokeWidth="1" opacity="0.8" />
      <circle cx="180" cy="118" r="52" fill="none" stroke={P_SOFT} strokeWidth="1.25" />
      <circle cx="180" cy="118" r="32" fill="none" stroke={P} strokeWidth="1.25" opacity="0.5" />
      <path
        d="M180 78c-14 0-24 10-24 22 0 16 24 38 24 38s24-22 24-38c0-12-10-22-24-22z"
        fill="hsl(0 0% 100% / 0.9)"
        stroke={P}
        strokeWidth="1.5"
      />
      <circle cx="180" cy="104" r="5" fill={P} />
    </svg>
  );
}

/** Plataforma: operativa ↔ digital (dos dimensiones complementarias). */
export function VisualDualPlatform() {
  return (
    <svg viewBox="0 0 360 220" className="h-auto w-full max-w-[300px]" aria-hidden>
      <rect x="40" y="64" width="118" height="92" rx="12" fill="hsl(0 0% 100% / 0.75)" stroke={INK} strokeWidth="1.25" />
      <text x="99" y="96" textAnchor="middle" fill="hsl(213 63% 17%)" style={{ fontSize: 10, fontWeight: 600 }}>
        Operativa
      </text>
      <rect x="56" y="108" width="86" height="8" rx="2" fill={LINE} />
      <rect x="56" y="124" width="56" height="6" rx="2" fill={LINE} opacity="0.75" />
      <rect x="202" y="64" width="118" height="92" rx="12" fill="hsl(0 0% 100% / 0.75)" stroke={P} strokeWidth="1.25" opacity="0.9" />
      <text x="261" y="96" textAnchor="middle" fill="hsl(213 63% 17%)" style={{ fontSize: 10, fontWeight: 600 }}>
        Digital
      </text>
      <rect x="218" y="108" width="86" height="8" rx="2" fill={LINE} />
      <rect x="218" y="124" width="64" height="6" rx="2" fill={LINE} opacity="0.75" />
      <path d="M168 110h24M192 110l-6-5M192 110l-6 5" stroke={P} strokeWidth="1.75" fill="none" strokeLinecap="round" />
      <path d="M192 118h-24M168 118l6 5M168 118l6-5" stroke={P} strokeWidth="1.75" fill="none" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

/** Ecosistema: red de actores conectados al hub comercial. */
export function VisualMarketNetwork() {
  const pts = [
    { x: 180, y: 56, r: 14 },
    { x: 92, y: 148, r: 12 },
    { x: 268, y: 148, r: 12 },
    { x: 180, y: 178, r: 11 },
  ];
  return (
    <svg viewBox="0 0 360 220" className="h-auto w-full max-w-[300px]" aria-hidden>
      {pts.slice(1).map((p) => (
        <line key={`${p.x}-${p.y}`} x1={pts[0].x} y1={pts[0].y} x2={p.x} y2={p.y} stroke={LINE} strokeWidth="1.5" />
      ))}
      <line x1={pts[1].x} y1={pts[1].y} x2={pts[2].x} y2={pts[2].y} stroke={LINE} strokeWidth="1.25" opacity="0.6" />
      <line x1={pts[1].x} y1={pts[1].y} x2={pts[3].x} y2={pts[3].y} stroke={LINE} strokeWidth="1.25" opacity="0.6" />
      <line x1={pts[2].x} y1={pts[2].y} x2={pts[3].x} y2={pts[3].y} stroke={LINE} strokeWidth="1.25" opacity="0.6" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={i === 0 ? "hsl(195 89% 47% / 0.2)" : "hsl(0 0% 100% / 0.9)"} stroke={i === 0 ? P : INK} strokeWidth="1.35" />
      ))}
      <circle cx={pts[0].x} cy={pts[0].y} r="4" fill={P} />
    </svg>
  );
}

/** Valores: cuadrante de criterios + núcleo de calidad. */
export function VisualValuesGrid() {
  const cells = [
    { x: 88, y: 64 },
    { x: 204, y: 64 },
    { x: 88, y: 138 },
    { x: 204, y: 138 },
  ];
  return (
    <svg viewBox="0 0 360 240" className="h-auto w-full max-w-[280px]" aria-hidden>
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width="68" height="56" rx="8" fill="hsl(0 0% 100% / 0.65)" stroke={LINE} strokeWidth="1.2" />
      ))}
      <circle cx="180" cy="128" r="26" fill="hsl(195 89% 47% / 0.12)" stroke={P} strokeWidth="1.5" />
      <path d="M180 118l4 8 12-14" stroke={P} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Síntesis: cobertura estructurada (nodo central + brazos al territorio). */
export function VisualSynthesisCoverage() {
  return (
    <svg viewBox="0 0 360 220" className="h-auto w-full max-w-[300px]" aria-hidden>
      <circle cx="180" cy="110" r="36" fill="hsl(0 0% 100% / 0.85)" stroke={P} strokeWidth="1.5" />
      <text x="180" y="104" textAnchor="middle" fill="hsl(213 63% 17%)" style={{ fontSize: 11, fontWeight: 700 }}>
        PY
      </text>
      <text
        x="180"
        y="122"
        textAnchor="middle"
        fill="hsl(215 16% 47%)"
        style={{ fontSize: 7, fontWeight: 600, letterSpacing: "0.14em" }}
      >
        ESTRUCTURA
      </text>
      {[0, 72, 144, 216, 288].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = 180 + Math.cos(rad) * 92;
        const y2 = 110 + Math.sin(rad) * 56;
        return (
          <line key={i} x1="180" y1="110" x2={x2} y2={y2} stroke={P_SOFT} strokeWidth="1.25" />
        );
      })}
      {[0, 72, 144, 216, 288].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x = 180 + Math.cos(rad) * 100;
        const y = 110 + Math.sin(rad) * 62;
        return <circle key={i} cx={x} cy={y} r="5" fill="hsl(0 0% 100% / 0.95)" stroke={INK} strokeWidth="1" />;
      })}
    </svg>
  );
}

/** Hero: recorrido del cliente / producto (línea de viaje minimal). */
export function VisualHeroJourney() {
  return (
    <svg viewBox="0 0 720 100" className="mx-auto h-auto w-full max-w-2xl opacity-90" aria-hidden>
      <line x1="40" y1="50" x2="680" y2="50" stroke={LINE} strokeWidth="1.5" />
      {[80, 220, 360, 500, 640].map((x, i) => (
        <g key={i}>
          <circle cx={x} cy="50" r={i === 2 ? 9 : 6} fill={i === 2 ? P : "hsl(0 0% 100%)"} stroke={i === 2 ? P : INK} strokeWidth="1.25" />
        </g>
      ))}
      <text
        x="360"
        y="28"
        textAnchor="middle"
        fill="hsl(215 16% 47%)"
        style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.18em" }}
      >
        DEL CATÁLOGO A LA ENTREGA
      </text>
    </svg>
  );
}
