'use client';

/**
 * Primitivas compartidas por todos los bloques de Radar.
 *
 * Tailwind v4 no genera clases construidas por concatenación en runtime
 * (`bg-${tone}-500` no existe en el bundle), así que cada tono se mapea a
 * strings literales completos. Los gráficos además necesitan el color como
 * valor CSS: eso vive en `TONE_HEX` / `TONE_HEX_DARK`.
 */
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RadarIcon, RadarTone } from '@/lib/plugins/radar/shared/blocks';

export const DEFAULT_TONE: RadarTone = 'indigo';

export type ToneClasses = {
  /** Fondo suave + texto del tono. Para chips de icono. */
  soft: string;
  /** Fondo sólido + texto blanco. Para badges fuertes. */
  solid: string;
  /** Solo el texto. */
  text: string;
  /** Solo el borde. */
  border: string;
  /** Fondo de relleno para barras. */
  fill: string;
  /** Superficie tenue para callouts. */
  surface: string;
};

export const TONE: Record<RadarTone, ToneClasses> = {
  neutral: {
    soft: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300',
    solid: 'bg-neutral-500 text-white',
    text: 'text-neutral-500 dark:text-neutral-400',
    border: 'border-neutral-200 dark:border-neutral-700',
    fill: 'bg-neutral-400',
    surface: 'bg-neutral-50 dark:bg-neutral-900',
  },
  slate: {
    soft: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
    solid: 'bg-slate-600 text-white',
    text: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    fill: 'bg-slate-500',
    surface: 'bg-slate-50 dark:bg-slate-500/10',
  },
  indigo: {
    soft: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    solid: 'bg-indigo-500 text-white',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-500/40',
    fill: 'bg-indigo-500',
    surface: 'bg-indigo-50 dark:bg-indigo-500/10',
  },
  violet: {
    soft: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    solid: 'bg-violet-500 text-white',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-500/40',
    fill: 'bg-violet-500',
    surface: 'bg-violet-50 dark:bg-violet-500/10',
  },
  rose: {
    soft: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    solid: 'bg-rose-500 text-white',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-500/40',
    fill: 'bg-rose-500',
    surface: 'bg-rose-50 dark:bg-rose-500/10',
  },
  amber: {
    soft: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    solid: 'bg-amber-500 text-white',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-500/40',
    fill: 'bg-amber-500',
    surface: 'bg-amber-50 dark:bg-amber-500/10',
  },
  orange: {
    soft: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
    solid: 'bg-orange-500 text-white',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-500/40',
    fill: 'bg-orange-500',
    surface: 'bg-orange-50 dark:bg-orange-500/10',
  },
  emerald: {
    soft: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    solid: 'bg-emerald-500 text-white',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-500/40',
    fill: 'bg-emerald-500',
    surface: 'bg-emerald-50 dark:bg-emerald-500/10',
  },
  teal: {
    soft: 'bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300',
    solid: 'bg-teal-500 text-white',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-500/40',
    fill: 'bg-teal-500',
    surface: 'bg-teal-50 dark:bg-teal-500/10',
  },
  sky: {
    soft: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    solid: 'bg-sky-500 text-white',
    text: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-500/40',
    fill: 'bg-sky-500',
    surface: 'bg-sky-50 dark:bg-sky-500/10',
  },
};

/** Color sólido del tono, para SVG y recharts. */
export const TONE_HEX: Record<RadarTone, string> = {
  neutral: '#a3a3a3',
  slate: '#64748b',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  orange: '#f97316',
  emerald: '#10b981',
  teal: '#14b8a6',
  sky: '#0ea5e9',
};

/**
 * Orden de asignación automática cuando la IA no elige tono por serie. Evita
 * que dos series contiguas queden del mismo color.
 */
export const TONE_CYCLE: RadarTone[] = ['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet', 'teal', 'orange'];

export function toneAt(index: number, explicit?: RadarTone | null): RadarTone {
  return explicit ?? TONE_CYCLE[index % TONE_CYCLE.length];
}

export function toneClasses(tone?: RadarTone | null): ToneClasses {
  return TONE[tone ?? DEFAULT_TONE] ?? TONE[DEFAULT_TONE];
}

export function toneHex(tone?: RadarTone | null): string {
  return TONE_HEX[tone ?? DEFAULT_TONE] ?? TONE_HEX[DEFAULT_TONE];
}

/**
 * Resuelve el nombre de icono que mandó la IA. La lista está cerrada en
 * `RADAR_ICONS`, pero si igual llega algo raro cae al `fallback` en vez de
 * romper el render.
 *
 * El fallback es POR CONTEXTO a propósito: antes todo caía en `Sparkles` y una
 * lista de diez ítems sin icono eran diez chispitas idénticas — el icono
 * dejaba de significar algo. Cada superficie pasa el suyo (una lista una
 * flecha, una cronología un reloj, un widget capas). Lo verdaderamente
 * desconocido cae en `CircleHelp`; `Sparkles` queda libre para IA generativa.
 */
export function resolveIcon(
  name?: RadarIcon | string | null,
  fallback: RadarIcon | string = 'CircleHelp',
): LucideIcon {
  const lookup = (candidate?: string | null): LucideIcon | null => {
    if (!candidate) return null;
    const found = (Icons as unknown as Record<string, unknown>)[candidate];
    return typeof found === 'function' || typeof found === 'object' ? (found as LucideIcon) : null;
  };
  return lookup(name) ?? lookup(fallback) ?? Icons.CircleHelp;
}

/* ------------------------------------------------------------------ */
/* Formato                                                              */
/* ------------------------------------------------------------------ */

export type ValueFormat = 'number' | 'percent' | 'currency' | 'compact' | 'text' | 'date' | 'badge';

const NUMBER_FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions) {
  let instance = NUMBER_FORMATTERS.get(key);
  if (!instance) {
    instance = new Intl.NumberFormat('es-AR', options);
    NUMBER_FORMATTERS.set(key, instance);
  }
  return instance;
}

export function formatValue(
  value: number | string | boolean | null | undefined,
  format: ValueFormat = 'number',
  currency = 'ARS',
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string') {
    if (format === 'date') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    const numeric = Number(value);
    if (format !== 'text' && value.trim() !== '' && !Number.isNaN(numeric)) return formatValue(numeric, format, currency);
    return value;
  }
  if (!Number.isFinite(value)) return '—';
  switch (format) {
    case 'percent':
      return `${formatter('pct', { maximumFractionDigits: 1 }).format(value)}%`;
    case 'currency':
      return formatter(`cur-${currency}`, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
    case 'compact':
      return formatter('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    default:
      return formatter('num', { maximumFractionDigits: 2 }).format(value);
  }
}

/** Recorta un número al rango [0, max] y lo pasa a porcentaje. */
export function toPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/* ------------------------------------------------------------------ */
/* Piezas visuales compartidas                                          */
/* ------------------------------------------------------------------ */

/** Encabezado estándar de un bloque: icono + título + subtítulo. */
export function BlockHeader({
  icon,
  title,
  subtitle,
  tone,
  action,
}: {
  icon?: RadarIcon | null;
  title?: string | null;
  subtitle?: string | null;
  tone?: RadarTone | null;
  action?: React.ReactNode;
}) {
  if (!title && !subtitle && !action) return null;
  const Icon = resolveIcon(icon);
  const classes = toneClasses(tone);
  return (
    <div className="mb-3 flex items-start gap-2.5">
      {icon && (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${classes.soft}`}>
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">{title}</p>}
        {subtitle && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Etiqueta de sección en versalitas — el tic tipográfico del plugin. */
export function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">{children}</p>
  );
}

/** Chip corto de color. */
export function Chip({ label, tone, solid }: { label: string; tone?: RadarTone | null; solid?: boolean }) {
  const classes = toneClasses(tone);
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${solid ? classes.solid : classes.soft}`}>
      {label}
    </span>
  );
}

/** Superficie base de cualquier bloque suelto. */
export function BlockSurface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-800/60 ${className}`}>
      {children}
    </div>
  );
}

/** Contenedor con scroll propio: nada dentro de Radar scrollea la página en X. */
export function ScrollX({ children }: { children: React.ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

/** Estado vacío compacto, reutilizado por todos los bloques sin datos. */
export function BlockEmpty({ text = 'Sin datos todavía.' }: { text?: string }) {
  return (
    <p className="py-6 text-center text-xs text-neutral-400 dark:text-neutral-500">{text}</p>
  );
}
