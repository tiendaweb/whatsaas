/**
 * Lenguaje visual del Escritorio (docs/escritorio-pulze/02-SPEC-UI.md).
 *
 * Son literales completos a propósito: Tailwind v4 no genera clases desde strings
 * armados en runtime, así que nunca se construye `bg-${x}-500` acá ni en los
 * componentes que importan esto.
 */

export const surfaceCard =
  'border-border/40 bg-white/80 dark:bg-card/80 backdrop-blur-sm shadow-sm';

export const surfaceCardHover =
  'border-border/40 bg-white/80 dark:bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 group';

export const surfaceHeader =
  'border-border/40 bg-white/80 dark:bg-[#0b1c0c]/80 backdrop-blur-sm';

// Grises con tinte VERDE, no slate. Los originales (#f5f7fa / #0f172a) son
// azulados: mismo problema que el acento celeste. Se recalcularon en OKLCH
// conservando luminosidad y croma exactos y moviendo el hue a 145, así que el
// contraste con el texto no cambió.
export const pageBackground =
  'bg-gradient-to-br from-[#f5f8f5] to-[#fafbfa] dark:from-[#0b1c0c] dark:to-[#1d2e1d]';

export const navItemActive = 'bg-primary text-primary-foreground shadow-sm';

export const navItemInactive =
  'text-foreground/80 hover:text-foreground hover:bg-muted/50';

/**
 * Gradientes decorativos de los iconos de KPI. No son series de datos —no pasan
 * por el validador de paleta—, pero sí tienen que ser cuatro cosas distinguibles
 * entre sí, así que se asignan por posición y no se ciclan.
 */
export const KPI_GRADIENTS = [
  'from-[#2f9e44] to-[#86efac]',
  'from-[#7c3aed] to-[#c4b5fd]',
  'from-[#d97706] to-[#fcd34d]',
  'from-[#0d9488] to-[#5eead4]',
] as const;

export function kpiGradient(index: number): string {
  return KPI_GRADIENTS[Math.min(index, KPI_GRADIENTS.length - 1)];
}

/** Marca y FAB del asistente: el acento verde, nunca el celeste original. */
export const brandGradient = 'bg-gradient-to-br from-[#2f9e44] to-[#86efac]';
