/**
 * Imágenes en /public/images/sobre-tradexpar/ (JPG generados desde el collage IA).
 * Fuente maestra: `src/assets/sobre-tradexpar-collage.png`.
 * Regenerar recortes: `python scripts/split-sobre-collage.py` (requiere Pillow: `pip install pillow`).
 */

export const ABOUT_STYLE_BASE =
  "modern corporate digital company, minimalistic, premium SaaS style, blue and white color palette, soft lighting, clean composition, no clutter, professional, high-end branding, subtle shadows, elegant, futuristic but realistic";

const IMG = "/images/sobre-tradexpar";

export const SOBRE_TRADEXPAR_IMAGES = {
  heroDistribucion: `${IMG}/hero-distribucion.png`,
  distribuidoraDigital: `${IMG}/distribuidora-digital.jpg`,
  modeloOperativo: `${IMG}/modelo-operativo.png`,
  procesosAgiles: `${IMG}/procesos-agiles.jpg`,
  conexionMercado: `${IMG}/conexion-mercado.png`,
  quoteBg: `${IMG}/quote-bg.jpg`,
  paso1Seleccion: `${IMG}/paso-1-seleccion.jpg`,
  paso2Gestion: `${IMG}/paso-2-gestion.jpg`,
  paso3Distribucion: `${IMG}/paso-3-distribucion.jpg`,
} as const;

export type SobreTradexparImageKey = keyof typeof SOBRE_TRADEXPAR_IMAGES;

/** Hero principal (PNG en /public). */
export const SOBRE_TRADEXPAR_HERO_FRAME = "aspect-[1024/507] w-full min-h-0";

/** Proporción del archivo en /public (ancho×alto) → marco = imagen completa sin recorte con `object-cover`. */
export const SOBRE_TRADEXPAR_NARRATIVE_FRAME: Record<
  "distribuidoraDigital" | "modeloOperativo" | "procesosAgiles" | "conexionMercado",
  string
> = {
  distribuidoraDigital: "aspect-[682/512] w-full min-h-0",
  modeloOperativo: "aspect-[1024/514] w-full min-h-0",
  procesosAgiles: "aspect-[682/512] w-full min-h-0",
  conexionMercado: "aspect-[1024/424] w-full min-h-0",
};

export const SOBRE_TRADEXPAR_ALT: Record<SobreTradexparImageKey, string> = {
  heroDistribucion:
    "Almacén moderno con cintas transportadoras, cajas, pantalla de analítica y operarios con tablets en entorno logístico digital",
  distribuidoraDigital: "Operador con tablet, cajas y estanterías: inventario físico gobernado con herramientas digitales",
  modeloOperativo:
    "Almacén digital con panel analítico grande, cintas y cajas; operarios con tablets coordinando inventario y flujo",
  procesosAgiles: "Flujo logístico ágil: cintas, movimiento de pedidos y ambiente operativo eficiente",
  conexionMercado:
    "Mapa logístico global con nodos conectados, contenedores, cajas y camión de reparto sobre superficie reflectante",
  quoteBg: "Fondo abstracto corporativo azul y gris para mensaje destacado Tradexpar",
  paso1Seleccion: "Selección y picking: catálogo digital o revisión de productos en operación",
  paso2Gestion: "Gestión operativa: panel de control, analítica y seguimiento de pedidos",
  paso3Distribucion: "Distribución: cajas en movimiento, despacho y salida logística",
};

export const ABOUT_SCENES = {
  heroDistribucion:
    "modern digital distribution company logistics warehouse with technology, clean and organized environment, blue tones, soft light, boxes and inventory, high-end corporate look",
  distribuidoraDigital:
    "warehouse worker with tablet, boxes on shelves, inventory control, physical distribution supported by digital tools, subtle human presence",
  modeloOperativo:
    "organized warehouse inventory, structured product arrangement, order and control, strategic operations, clean logistics",
  procesosAgiles:
    "fast logistics flow, conveyor belt, operational speed, coordinated warehouse work, dashboards in background optional",
  conexionMercado:
    "global or regional distribution network map, glowing connection lines, multiple destinations, ecommerce logistics",
  quoteBg:
    "abstract corporate background soft gradients subtle geometric lines elegant blue grey minimal premium calm for text overlay",
  paso1Seleccion: "picking product selection tablet catalog interface warehouse context blue tones",
  paso2Gestion: "operations management dashboard analytics logistics tracking clean professional",
  paso3Distribucion: "cardboard boxes on conveyor modern dispatch shipping efficient supply chain",
} as const;

export function aboutImageFullPrompt(scene: string): string {
  return `${scene}\n\n${ABOUT_STYLE_BASE}`;
}

export const SOBRE_TRADEXPAR_PROMPTS: Record<SobreTradexparImageKey, string> = {
  heroDistribucion: aboutImageFullPrompt(ABOUT_SCENES.heroDistribucion),
  distribuidoraDigital: aboutImageFullPrompt(ABOUT_SCENES.distribuidoraDigital),
  modeloOperativo: aboutImageFullPrompt(ABOUT_SCENES.modeloOperativo),
  procesosAgiles: aboutImageFullPrompt(ABOUT_SCENES.procesosAgiles),
  conexionMercado: aboutImageFullPrompt(ABOUT_SCENES.conexionMercado),
  quoteBg: aboutImageFullPrompt(ABOUT_SCENES.quoteBg),
  paso1Seleccion: aboutImageFullPrompt(ABOUT_SCENES.paso1Seleccion),
  paso2Gestion: aboutImageFullPrompt(ABOUT_SCENES.paso2Gestion),
  paso3Distribucion: aboutImageFullPrompt(ABOUT_SCENES.paso3Distribucion),
};
