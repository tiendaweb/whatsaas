/**
 * Tonos e iconos del tema "custom" de Business Woman Planner: listas CERRADAS
 * a propósito, igual que en Radar (`lib/plugins/radar/ui/blocks/primitives.tsx`).
 *
 * Tailwind v4 no genera clases construidas por concatenación en runtime
 * (`bg-${tone}-500` no existe en el bundle final), así que cada tono se
 * mapea acá a strings de clases COMPLETOS y literales. Si un conector manda
 * un tono o icono que no está en la lista, el renderer cae a un default en
 * vez de romper.
 */
import {
  Award,
  Bell,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  DollarSign,
  Flag,
  FolderKanban,
  Gift,
  Heart,
  Home,
  LayoutGrid,
  Link as LinkIcon,
  Mail,
  MessageCircle,
  Moon,
  NotebookText,
  Phone,
  Rocket,
  Sparkles,
  Star,
  Sun,
  Target,
  TrendingUp,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const BW_THEME_TONES = [
  'rose', 'pink', 'fuchsia', 'violet', 'indigo', 'sky', 'emerald', 'amber', 'slate',
] as const;
export type BwThemeTone = (typeof BW_THEME_TONES)[number];

export const BW_THEME_ICONS = [
  'Sparkles', 'Home', 'Users', 'TrendingUp', 'Link', 'FolderKanban', 'LayoutGrid',
  'CalendarDays', 'NotebookText', 'ClipboardList', 'Video', 'Star', 'Heart', 'Target',
  'Rocket', 'Gift', 'Briefcase', 'DollarSign', 'Phone', 'Mail', 'MessageCircle',
  'CheckCircle2', 'Clock3', 'Bell', 'Flag', 'Award', 'Zap', 'Sun', 'Moon',
] as const;
export type BwThemeIcon = (typeof BW_THEME_ICONS)[number];

export const BW_ICON_COMPONENTS: Record<BwThemeIcon, LucideIcon> = {
  Sparkles, Home, Users, TrendingUp, Link: LinkIcon, FolderKanban, LayoutGrid,
  CalendarDays, NotebookText, ClipboardList, Video, Star, Heart, Target,
  Rocket, Gift, Briefcase, DollarSign, Phone, Mail, MessageCircle,
  CheckCircle2, Clock3, Bell, Flag, Award, Zap, Sun, Moon,
};

export function resolveBwIcon(icon: string | null | undefined): LucideIcon {
  if (icon && (BW_THEME_ICONS as readonly string[]).includes(icon)) {
    return BW_ICON_COMPONENTS[icon as BwThemeIcon];
  }
  return Sparkles;
}

export function isBwTone(value: string | null | undefined): value is BwThemeTone {
  return Boolean(value) && (BW_THEME_TONES as readonly string[]).includes(value as string);
}

type ToneClasses = {
  /** fondo suave + texto + borde, para chips/badges/paneles */
  soft: string;
  /** degradé sólido + texto blanco, para íconos destacados y CTAs */
  solid: string;
  /** solo texto */
  text: string;
  /** solo borde */
  border: string;
};

// Clases literales completas — NUNCA generadas por concatenación (ver comentario arriba).
export const BW_TONE_CLASSES: Record<BwThemeTone, ToneClasses> = {
  rose: {
    soft: 'bg-rose-50 text-rose-700 border-rose-200',
    solid: 'bg-gradient-to-br from-rose-400 to-pink-600 text-white',
    text: 'text-rose-600',
    border: 'border-rose-200',
  },
  pink: {
    soft: 'bg-pink-50 text-pink-700 border-pink-200',
    solid: 'bg-gradient-to-br from-pink-400 to-fuchsia-600 text-white',
    text: 'text-pink-600',
    border: 'border-pink-200',
  },
  fuchsia: {
    soft: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    solid: 'bg-gradient-to-br from-fuchsia-400 to-purple-600 text-white',
    text: 'text-fuchsia-600',
    border: 'border-fuchsia-200',
  },
  violet: {
    soft: 'bg-violet-50 text-violet-700 border-violet-200',
    solid: 'bg-gradient-to-br from-violet-400 to-indigo-600 text-white',
    text: 'text-violet-600',
    border: 'border-violet-200',
  },
  indigo: {
    soft: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    solid: 'bg-gradient-to-br from-indigo-400 to-blue-600 text-white',
    text: 'text-indigo-600',
    border: 'border-indigo-200',
  },
  sky: {
    soft: 'bg-sky-50 text-sky-700 border-sky-200',
    solid: 'bg-gradient-to-br from-sky-400 to-blue-600 text-white',
    text: 'text-sky-600',
    border: 'border-sky-200',
  },
  emerald: {
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    solid: 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
  },
  amber: {
    soft: 'bg-amber-50 text-amber-700 border-amber-200',
    solid: 'bg-gradient-to-br from-amber-400 to-orange-600 text-white',
    text: 'text-amber-600',
    border: 'border-amber-200',
  },
  slate: {
    soft: 'bg-slate-50 text-slate-700 border-slate-200',
    solid: 'bg-gradient-to-br from-slate-400 to-slate-600 text-white',
    text: 'text-slate-600',
    border: 'border-slate-200',
  },
};

export function resolveBwTone(tone: string | null | undefined): ToneClasses {
  return isBwTone(tone) ? BW_TONE_CLASSES[tone] : BW_TONE_CLASSES.rose;
}

/**
 * Ancho de un bloque dentro de la grilla de 12 columnas de una vista.
 * Clases LITERALES completas (mismo motivo que arriba) — nunca
 * `lg:col-span-${n}` armado en runtime.
 */
export const BW_WIDTH_CLASSES: Record<'full' | 'half' | 'third' | 'two_thirds', string> = {
  full: 'col-span-12',
  half: 'col-span-12 sm:col-span-6',
  third: 'col-span-12 sm:col-span-6 lg:col-span-4',
  two_thirds: 'col-span-12 lg:col-span-8',
};

export function resolveBwWidth(width: string | null | undefined): string {
  return width && width in BW_WIDTH_CLASSES ? BW_WIDTH_CLASSES[width as keyof typeof BW_WIDTH_CLASSES] : BW_WIDTH_CLASSES.full;
}

/**
 * Convierte un hex (#rrggbb) a rgba(...) con la opacidad pedida. Se usa para
 * `customColor`: SIEMPRE termina en un valor de `style` inline, nunca en el
 * nombre de una clase — por eso no choca con el purgado de Tailwind v4 (ver
 * comentario del encabezado del archivo).
 */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!match) return `rgba(244, 63, 94, ${alpha})`; // fallback: rose-500
  const [, r, g, b] = match;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
}

// Duplicado a propósito (no importado de shared/schema.ts): tokens.ts no
// puede depender de schema.ts porque schema.ts ya importa de acá (ciclo).
const BW_HEX_COLOR_REGEX_LOCAL = /^#[0-9a-fA-F]{6}$/;

/** Clases/estilo para un bloque que puede tener tono cerrado O color libre.
 * `customColor`, si viene, GANA sobre `tone`. Devuelve className (estructura,
 * sin color) + style (el color, inline) listos para spread en el elemento. */
export function resolveBlockAppearance(tone: string | null | undefined, customColor: string | null | undefined) {
  if (customColor && BW_HEX_COLOR_REGEX_LOCAL.test(customColor)) {
    return {
      // className vacío a propósito: si el llamador quiere borde (filas de
      // lista, badges), ya escribe la clase estructural "border" en su propio
      // template — acá sólo va color, nunca estructura, para que preset y
      // custom se comporten IGUAL en los lugares que no quieren borde
      // (ej. el círculo de ícono de un heading).
      soft: {
        className: '',
        style: { backgroundColor: hexToRgba(customColor, 0.12), color: customColor, borderColor: hexToRgba(customColor, 0.35) },
      },
      solid: {
        className: 'text-white shadow-sm',
        style: { backgroundColor: customColor },
      },
    };
  }
  const preset = resolveBwTone(tone);
  return {
    soft: { className: preset.soft, style: undefined },
    solid: { className: preset.solid, style: undefined },
  };
}

/** Font-stacks del sistema — sin fetch externo, ver `shared/schema.ts`
 * (BW_FONT_FAMILIES) para por qué es una lista cerrada. */
export const BW_FONT_STACKS: Record<'system' | 'serif' | 'mono' | 'rounded', string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  rounded: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Verdana, sans-serif',
};

export function resolveBwFontFamily(fontFamily: string | null | undefined): string | undefined {
  return fontFamily && fontFamily in BW_FONT_STACKS ? BW_FONT_STACKS[fontFamily as keyof typeof BW_FONT_STACKS] : undefined;
}
