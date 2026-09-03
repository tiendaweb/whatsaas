/**
 * Paleta y tokens de los gráficos del Escritorio.
 *
 * Los hex están validados con el validador de la skill `dataviz`
 * (banda de luminosidad, piso de croma, separación CVD adyacente, piso de visión
 * normal y contraste contra la superficie). Los seis chequeos dan PASS en claro y
 * en oscuro. Ver `docs/escritorio-pulze/02-SPEC-UI.md` §5.2.
 *
 * Reglas que NO se pueden romper al tocar esto:
 *  - Los hues se asignan en orden fijo, nunca se ciclan. Una 5.ª serie no inventa
 *    un color: se agrupa en "Otros" o se parte en múltiplos pequeños.
 *  - El modo oscuro tiene sus propios pasos. No es un flip automático del claro:
 *    la banda de luminosidad válida sobre fondo oscuro es más angosta (0.48–0.67).
 *  - Ninguna serie es azul: el acento celeste original se reemplazó por verde en
 *    toda la app, y un azul suelto en un gráfico delataría el origen del diseño.
 *  - Nunca dos ejes Y. Dos medidas de escalas distintas van en dos gráficos.
 *
 * Si se cambia un hex hay que volver a correr el validador antes de subirlo.
 */

/** Series categóricas, en orden fijo. */
export const CHART_SERIES_LIGHT = ['#15803d', '#7c3aed', '#c2690a', '#0d9488'] as const;
export const CHART_SERIES_DARK = ['#16a34a', '#8b5cf6', '#d97706', '#0d9488'] as const;

export type ChartMode = 'light' | 'dark';

export function chartSeries(mode: ChartMode): readonly string[] {
  return mode === 'dark' ? CHART_SERIES_DARK : CHART_SERIES_LIGHT;
}

/** Color de la serie `index`. Se satura en la última en vez de ciclar. */
export function seriesColor(index: number, mode: ChartMode): string {
  const palette = chartSeries(mode);
  return palette[Math.min(index, palette.length - 1)];
}

/**
 * Colores por etapa del embudo. Son categóricos —la etapa es identidad, no
 * magnitud—, así que salen de la misma paleta en orden fijo. `closed_lost` usa
 * el gris de texto secundario: no es una etapa que se quiera destacar.
 */
export const STAGE_COLOR_INDEX: Record<string, number> = {
  qualified: 0,
  proposal: 1,
  negotiation: 2,
  closed_won: 3,
};

export function stageColor(stage: string, mode: ChartMode): string {
  if (stage === 'closed_lost') return mode === 'dark' ? '#95a895' : '#647964';
  return seriesColor(STAGE_COLOR_INDEX[stage] ?? 0, mode);
}

/** Ejes, grilla y tooltip. Recesivos: el dato manda, el andamiaje no. */
// Neutros con tinte verde en vez de slate, misma luminosidad que los originales.
export const CHART_AXIS = {
  light: { grid: '#e2eae2', label: '#647964', tooltipBg: '#ffffff', tooltipBorder: '#e2eae2', tooltipText: '#1d2e1d' },
  dark: { grid: '#334633', label: '#95a895', tooltipBg: '#1d2e1d', tooltipBorder: '#334633', tooltipText: '#e2eae2' },
} as const;

export function chartAxis(mode: ChartMode) {
  return CHART_AXIS[mode];
}

/**
 * Estado positivo/negativo de un delta. Reservado para estado, nunca se reusa
 * como "serie 5": el verde de la serie 1 y este verde conviven en la misma
 * pantalla y significan cosas distintas.
 */
export const TREND_COLOR = {
  up: { light: '#0d9488', dark: '#14b8a6' },
  down: { light: '#dc2626', dark: '#f87171' },
} as const;
