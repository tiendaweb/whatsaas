/**
 * Parser de las notas 🎯 RADAR.
 *
 * Las notas las escribe una IA como mensaje interno (`messages.isInternal`) y
 * son TEXTO LIBRE: no hay JSON, ni un formato garantizado. Lo único estable es
 * la primera línea (`🎯 RADAR <fecha> · <prioridad> · score <n>`) y que el
 * cuerpo se organiza en secciones "TÍTULO: contenido".
 *
 * Por eso este parser es deliberadamente tolerante: cualquier sección que la IA
 * invente mañana tiene que seguir produciendo un bloque válido (card genérico
 * con icono `Sparkles`) en vez de desaparecer del panel.
 *
 * No lleva 'server-only' porque es texto puro sin acceso a base: sirve igual en
 * un route handler que en un test.
 */
import {
  parseRadarBlocks,
  type RadarBlock,
  type RadarIcon,
  type RadarTone,
} from '@/lib/plugins/radar/shared/blocks';

export const RADAR_NOTE_PREFIX = '🎯 RADAR';

export type RadarNoteSection = {
  /** Heading normalizado (MAYÚSCULAS, sin tildes) — sirve para agrupar y mapear. */
  key: string;
  /** Heading tal cual lo escribió la IA. */
  heading: string;
  body: string;
};

export type RadarNoteHeader = {
  /** Normalizada a `YYYY-MM-DD` venga como venga (ISO o dd/mm/yyyy). */
  date: string | null;
  priority: string | null;
  score: number | null;
  confidence: number | null;
  isReview: boolean;
  raw: string;
};

export type ParsedRadarNote = {
  header: RadarNoteHeader;
  sections: RadarNoteSection[];
};

/* ------------------------------------------------------------------ */
/* Utilidades de texto                                                  */
/* ------------------------------------------------------------------ */

/** MAYÚSCULAS sin tildes ni signos: la clave con la que se busca el sinónimo. */
export function normalizeHeadingKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÑÜ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BULLET_RE = /^\s*[·•*–—-]\s+/;

/** Emojis y signos decorativos con los que la IA prefija algunas secciones. */
function stripLeadingDecoration(line: string): string {
  return line.replace(/^[\s‍️\p{Extended_Pictographic}]+/u, '').trimStart();
}

function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Índice del `:` que separa el heading del cuerpo, ignorando dos casos que en
 * las notas reales rompían el corte: la hora ("01:40") y los paréntesis
 * ("QUÉ BUSCA (audio 51s, 01:40): …").
 */
function headingColonIndex(line: string): number {
  let depth = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) {
      const before = line[i - 1];
      const after = line[i + 1];
      const isTime = before !== undefined && after !== undefined && /\d/.test(before) && /\d/.test(after);
      if (!isTime) return i;
    }
  }
  return -1;
}

function looksLikeHeadingText(text: string): boolean {
  if (text.length < 2 || text.length > 90) return false;
  // Una oración con punto seguido no es un título; una cita tampoco.
  if (/[.;]\s/.test(text) || text.includes('"') || text.includes('“')) return false;
  return text.split(/\s+/).length <= 10;
}

/** Línea escrita íntegramente en mayúsculas: heading suelto, sin `:`. */
function isBareUppercaseHeading(text: string): boolean {
  if (text.length < 3 || text.length > 60) return false;
  if (!/\p{Lu}/u.test(text)) return false;
  if (/\p{Ll}/u.test(text)) return false;
  return text.split(/\s+/).length <= 8;
}

type HeadingMatch = { heading: string; rest: string };

function matchHeading(rawLine: string): HeadingMatch | null {
  const line = stripLeadingDecoration(rawLine);
  if (!line) return null;
  if (BULLET_RE.test(rawLine)) return null; // es una viñeta del cuerpo anterior

  const colon = headingColonIndex(line);
  if (colon > 0) {
    const heading = line.slice(0, colon).trim();
    if (looksLikeHeadingText(heading)) {
      return { heading, rest: line.slice(colon + 1).trim() };
    }
    return null;
  }

  if (isBareUppercaseHeading(line)) return { heading: line.trim(), rest: '' };
  return null;
}

/* ------------------------------------------------------------------ */
/* Encabezado                                                           */
/* ------------------------------------------------------------------ */

function parseHeaderLine(rawFirstLine: string, fullText: string): RadarNoteHeader {
  const raw = rawFirstLine.trim();

  let date: string | null = null;
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  const dmy = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (iso) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`;
  } else if (dmy) {
    date = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  const priorityMatch = raw.match(/\b(P[123])\b/i);
  const priority = priorityMatch
    ? priorityMatch[1].toUpperCase()
    : /\bdescartad[oa]\b/i.test(raw)
      ? 'descartado'
      : null;

  const scoreMatch = raw.match(/score\s*[:=]?\s*(\d{1,3})/i);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;

  const confMatch = raw.match(/confianza\s*[:=]?\s*(\d{1,3})/i);
  let confidence = confMatch ? Number(confMatch[1]) : null;
  // Muchas notas no ponen la confianza en la primera línea sino en una sección
  // ("CONFIANZA 70: …"). Se busca ahí antes de darla por perdida.
  if (confidence === null) {
    const bodyConf = fullText.match(/^\s*[^\n]{0,12}confianza\s*(\d{1,3})/im);
    if (bodyConf) confidence = Number(bodyConf[1]);
  }

  const isReview = /revisi[oó]n|revisar|revisi[oó]n humana/i.test(raw)
    || (confidence !== null && confidence < 70);

  return { date, priority, score, confidence, isReview, raw };
}

/* ------------------------------------------------------------------ */
/* parseRadarNote                                                       */
/* ------------------------------------------------------------------ */

export function parseRadarNote(text: string): ParsedRadarNote {
  const safe = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
  const lines = safe.split('\n');
  const firstLine = lines[0] ?? '';
  const header = parseHeaderLine(firstLine, safe);

  const sections: RadarNoteSection[] = [];
  let current: { heading: string; buffer: string[] } | null = null;
  const preamble: string[] = [];

  const flush = () => {
    if (!current) return;
    const body = current.buffer.join('\n').trim();
    sections.push({ key: normalizeHeadingKey(current.heading), heading: current.heading, body });
    current = null;
  };

  for (const line of lines.slice(1)) {
    const match = matchHeading(line);
    if (match) {
      flush();
      current = { heading: match.heading, buffer: match.rest ? [match.rest] : [] };
      continue;
    }
    if (current) current.buffer.push(line);
    else if (line.trim()) preamble.push(line.trim());
  }
  flush();

  // Texto antes de la primera sección: no se tira, se guarda como CONTEXTO.
  if (preamble.length > 0) {
    sections.unshift({ key: 'CONTEXTO', heading: 'Contexto', body: preamble.join('\n').trim() });
  }

  return { header, sections };
}

/* ------------------------------------------------------------------ */
/* Mapa de sinónimos → icono / tono / forma del bloque                  */
/* ------------------------------------------------------------------ */

type SectionStyle = {
  icon: RadarIcon;
  tone: RadarTone;
  /** Si está, la sección se dibuja como `callout` en vez de `card`. */
  callout?: 'warning' | 'danger' | 'info' | 'idea';
};

type StyleRule = SectionStyle & { patterns: string[] };

/**
 * Reglas por SUBSTRING sobre la clave normalizada, evaluadas EN ORDEN: la
 * primera que matchea gana. Los headings reales traen sufijos ("PUNTO DE CAÍDA
 * — CAUSA NUESTRA", "ACCIÓN VIGENTE (hasta el 25/08)"), así que comparar por
 * igualdad exacta perdería la mitad de las secciones.
 * Todos los iconos salen de RADAR_ICONS: si no está en la lista, la UI cae a
 * Sparkles y se pierde la intención, por eso se eligen sólo nombres existentes.
 */
const STYLE_RULES: StyleRule[] = [
  { patterns: ['FALLA DEL EMBUDO', 'FALLA DE FLUJO', 'FALLA DE EMBUDO', 'BUG'], icon: 'Bug', tone: 'rose', callout: 'danger' },
  { patterns: ['RIESGO'], icon: 'AlertTriangle', tone: 'rose', callout: 'warning' },
  { patterns: ['PENDIENTE CRITICO', 'DEUDA NUESTRA', 'ALERTA', 'ATENCION', 'IMPORTANTE'], icon: 'BellRing', tone: 'amber', callout: 'warning' },
  { patterns: ['SEGURIDAD'], icon: 'Lock', tone: 'rose', callout: 'warning' },

  { patterns: ['PUNTO DE CAIDA', 'PUNTO SENSIBLE', 'PUNTO DEBIL', 'CAIDA'], icon: 'AlertOctagon', tone: 'rose' },
  { patterns: ['OBJECION'], icon: 'ShieldAlert', tone: 'amber' },
  { patterns: ['SENAL'], icon: 'Flame', tone: 'emerald' },
  { patterns: ['QUE BUSCA', 'QUE BUSCABA', 'BUSCABA', 'BUSCA', 'RUBRO'], icon: 'Search', tone: 'indigo' },
  { patterns: ['PROYECTO'], icon: 'Rocket', tone: 'violet' },
  { patterns: ['ESTRATEGIA'], icon: 'Target', tone: 'indigo' },
  { patterns: ['RECUPERABILIDAD'], icon: 'Repeat', tone: 'teal' },
  { patterns: ['ETAPA'], icon: 'Milestone', tone: 'sky' },
  { patterns: ['OPORTUNIDAD', 'UPSELL'], icon: 'Lightbulb', tone: 'amber' },
  { patterns: ['MADUREZ'], icon: 'Gem', tone: 'violet' },
  { patterns: ['ACCION VIGENTE', 'ACCION RECOMENDADA', 'NO EJECUTADO', 'SI SE EJECUTO', 'A VERIFICAR', 'PUNTOS ABIERTOS', 'FALTA ENTREGAR', 'PENDIENTE'], icon: 'ClipboardList', tone: 'amber' },
  { patterns: ['QUE COMPRO', 'COMPRO'], icon: 'ShoppingCart', tone: 'emerald' },
  { patterns: ['ENTREGADO', 'CONFIRMADO'], icon: 'CheckCircle2', tone: 'emerald' },
  { patterns: ['CONFIANZA', 'CALIBRACION'], icon: 'Gauge', tone: 'slate' },
  { patterns: ['PATRON', 'PROBLEMA REPETIBLE', 'PRODUCTO REPETIBLE', 'REPETIBLE', 'APRENDIZAJE', 'NOTA DE PROCESO'], icon: 'Workflow', tone: 'violet' },
  { patterns: ['PRECIO', 'PRESUPUESTO', 'COSTO'], icon: 'CircleDollarSign', tone: 'amber' },
  { patterns: ['INTENCION'], icon: 'Compass', tone: 'indigo' },
  { patterns: ['DATOS'], icon: 'Layers', tone: 'slate' },
  { patterns: ['NOVEDAD', 'SIN NOVEDADES', 'DIAGNOSTICO', 'ESTADO', 'CONTEXTO', 'NOTA'], icon: 'Activity', tone: 'slate' },
];

// Notebook y no Sparkles: una sección desconocida de la nota sigue siendo una
// nota — con Sparkles, tres secciones nuevas eran tres chispitas idénticas.
const DEFAULT_STYLE: SectionStyle = { icon: 'Notebook', tone: 'neutral' };

/** Estilo (icono + tono + forma) de una sección, por sinónimos normalizados. */
export function radarSectionStyle(key: string): SectionStyle {
  const normalized = normalizeHeadingKey(key);
  for (const rule of STYLE_RULES) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return { icon: rule.icon, tone: rule.tone, callout: rule.callout };
    }
  }
  return DEFAULT_STYLE;
}

/* ------------------------------------------------------------------ */
/* Nota → bloques                                                       */
/* ------------------------------------------------------------------ */

function splitBody(body: string): { description: string; bullets: string[] } {
  const lines = body.split('\n');
  const lead: string[] = [];
  const bullets: string[] = [];
  for (const line of lines) {
    if (BULLET_RE.test(line)) bullets.push(line.replace(BULLET_RE, '').trim());
    else if (bullets.length === 0) lead.push(line);
    else if (line.trim()) bullets[bullets.length - 1] += ` ${line.trim()}`; // continuación de la viñeta
  }
  return {
    description: lead.join('\n').trim(),
    bullets: bullets.filter(Boolean),
  };
}

/** Bloques de encabezado: score + ficha con fecha/prioridad/confianza. */
export function radarNoteHeaderBlocks(header: RadarNoteHeader): RadarBlock[] {
  const blocks: unknown[] = [];

  if (header.score !== null) {
    blocks.push({
      type: 'score',
      title: 'Score Radar',
      icon: 'Gauge',
      value: header.score,
      max: 100,
      caption: header.confidence !== null ? `Confianza ${header.confidence}/100` : undefined,
      thresholds: [{ min: 0, tone: 'rose' }, { min: 50, tone: 'amber' }, { min: 75, tone: 'emerald' }],
    });
  }

  const items: unknown[] = [];
  if (header.date) items.push({ label: 'Análisis', value: header.date, icon: 'CalendarDays' });
  if (header.priority) {
    items.push({
      label: 'Prioridad',
      value: header.priority,
      icon: 'Flag',
      tone: header.priority === 'P1' ? 'rose' : header.priority === 'P2' ? 'amber' : 'slate',
    });
  }
  if (header.confidence !== null) {
    items.push({
      label: 'Confianza',
      value: String(header.confidence),
      icon: 'Gauge',
      tone: header.confidence < 70 ? 'amber' : 'emerald',
    });
  }
  if (header.isReview) {
    items.push({ label: 'Revisión', value: 'Requiere revisión humana', icon: 'AlertTriangle', tone: 'amber' });
  }
  if (items.length > 0) blocks.push({ type: 'stat', columns: 2, items });

  return parseRadarBlocks(blocks);
}

/**
 * Convierte una nota 🎯 RADAR entera en bloques del contrato.
 * Siempre devuelve bloques válidos: el resultado pasa por `parseRadarBlocks`.
 */
export function radarNoteToBlocks(text: string): RadarBlock[] {
  const { sections } = parseRadarNote(text);
  const candidates: unknown[] = [];

  for (const section of sections) {
    const style = radarSectionStyle(section.key);
    const { description, bullets } = splitBody(section.body);
    const title = clamp(section.heading, 160);

    if (style.callout) {
      // Un callout no tiene viñetas: se pliegan al cuerpo para no perder texto.
      const body = [description, ...bullets.map((b) => `· ${b}`)].filter(Boolean).join('\n');
      candidates.push({
        type: 'callout',
        variant: style.callout,
        icon: style.icon,
        tone: style.tone,
        title,
        body: clamp(body || section.heading, 4000),
      });
      continue;
    }

    candidates.push({
      type: 'card',
      icon: style.icon,
      tone: style.tone,
      title,
      // `description` es obligatoria y mínimo 1 char: si la sección era sólo un
      // heading con viñetas, se usa el propio heading como bajada.
      description: clamp(description || section.heading, 4000),
      ...(bullets.length > 0
        ? { bullets: bullets.slice(0, 20).map((b) => clamp(b, 500)) }
        : {}),
    });
  }

  return parseRadarBlocks(candidates);
}
