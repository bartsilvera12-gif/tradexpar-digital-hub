/**
 * Estilos compartidos del panel admin (alineados al formulario de productos).
 */

export const ADMIN_PAGE_ROOT =
  "w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8";

export const ADMIN_CARD =
  "bg-card rounded-2xl border border-border/80 shadow-card overflow-hidden w-full min-w-0";

export const ADMIN_TABLE_SCROLL = "overflow-x-auto overscroll-x-contain";

export const ADMIN_TABLE = "w-full text-sm border-collapse";

export const ADMIN_THEAD_ROW =
  "bg-muted/30 text-left text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/80";

export const ADMIN_TH = "py-3.5 px-3 sm:px-4 font-medium text-left";

export const ADMIN_TBODY = "divide-y divide-border/70";

export const ADMIN_TR = "hover:bg-muted/25 transition-colors align-middle bg-card";

export const ADMIN_TD = "py-3 px-3 sm:px-4";

/** Contenedor tipo “modal” o bloque principal de formulario (degradado suave). */
export const ADMIN_FORM_MODAL =
  "w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/25 p-6 shadow-card space-y-4";

/** Paneles de contenido (configuración, widgets en dashboard). */
export const ADMIN_PANEL =
  "rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/20 p-5 sm:p-6 shadow-card";

/** Secciones de formulario en página (reglas, materiales, etc.). */
export const ADMIN_FORM_SECTION =
  "rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/20 p-5 sm:p-6 space-y-4 shadow-card";

/** Sub-bloque destacado (p. ej. descuento promocional). */
export const ADMIN_FORM_HIGHLIGHT =
  "relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-primary/[0.07] via-muted/30 to-background p-4 sm:p-5 space-y-3 shadow-sm";

/** Etiqueta sobre campo. */
export const ADMIN_FORM_LABEL = "text-sm font-semibold text-foreground";

/** Agrupa etiqueta + control. */
export const ADMIN_FORM_FIELD = "space-y-1.5";

/**
 * Input / textarea / select trigger: fondo gris muy suave, borde casi invisible, foco con anillo primario.
 */
export const ADMIN_FORM_CONTROL =
  "flex h-10 w-full rounded-xl border-0 bg-muted/50 px-3.5 py-2 text-sm text-foreground shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-inset ring-border/35 transition-[box-shadow,background-color,ring-color] placeholder:text-muted-foreground/75 focus-visible:outline-none focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25";

export const ADMIN_FORM_TEXTAREA =
  "flex min-h-[88px] w-full resize-y rounded-xl border-0 bg-muted/50 px-3.5 py-2.5 text-sm text-foreground shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-inset ring-border/35 transition-[box-shadow,background-color,ring-color] placeholder:text-muted-foreground/75 focus-visible:outline-none focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25";

/** Campos solo lectura (API, tokens). */
export const ADMIN_FORM_CONTROL_READONLY =
  "flex h-10 w-full cursor-default rounded-xl border-0 bg-muted/40 px-3.5 py-2 text-sm text-muted-foreground shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-border/25";

/** Contenedor de diálogos con formulario. */
export const ADMIN_DIALOG_FORM =
  "sm:max-w-md rounded-2xl border-border/80 bg-gradient-to-br from-card via-card to-muted/25 p-6 shadow-card gap-0";
