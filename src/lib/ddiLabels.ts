/**
 * Nomenclatura pública del programa (antes «afiliados» / «afiliado»).
 * Usar estos textos en UI; rutas y código interno pueden seguir diciendo affiliate.
 */
export const DDI = {
  singular: "Distribuidor Digital Independiente",
  singularLower: "distribuidor digital independiente",
  plural: "Distribuidores Digitales Independientes",
  pluralLower: "distribuidores digitales independientes",
  /** Encabezados de tabla / UI compacta */
  columnHeader: "Distrib. digital indep.",
  /** Columna del link público con ?ref= */
  linkColumnHeader: "Enlace (?ref)",
  /** Badge de precio por enlace ?ref= */
  promoBadgeLabel: "Beneficio exclusivo",
  /** Panel en navegación */
  panelShort: "Panel distribuidor",
  /** Título completo del panel */
  panelTitle: "Panel — Distribuidor Digital Independiente",
  programa: "programa de Distribuidores Digitales Independientes",
} as const;
