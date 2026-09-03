/**
 * Presentación de lo que Radar genera automáticamente (tareas y notas internas).
 *
 * REGLA DE ORO: acá NO se toca el dato. El prefijo `RADAR ·` de los títulos y el
 * encabezado `🎯 RADAR …` de las notas se siguen guardando tal cual y el sistema
 * los sigue usando para filtrar y agrupar (`title.startsWith(RADAR_TASK_PREFIX)`,
 * `text like '🎯 RADAR%'`). Estos helpers existen sólo para PINTAR: sacan el
 * prefijo del texto visible y en su lugar cada pantalla muestra un chip de Radar.
 *
 * No lleva 'server-only': es texto puro y se usa en cliente (Tareas OS, chat) y
 * en servidor (rutas del plugin) por igual.
 */

/** Prefijo con el que Radar crea las tareas en Tareas OS. */
export const RADAR_TASK_PREFIX = 'RADAR · ';

/** Marca con la que arranca la primera línea de toda nota interna de Radar. */
export const RADAR_NOTE_PREFIX = '🎯 RADAR';

/**
 * Separadores que la IA usó (o puede usar) entre "RADAR" y el título real.
 * Se acepta el punto medio, el guion en sus tres largos, los dos puntos y la
 * barra: si mañana escribe `RADAR - foo` el prefijo tiene que seguir cayéndose.
 */
const TASK_PREFIX_RE = /^\s*radar\s*[·•‧:\-–—|]+\s*/i;

/** Primera línea de una nota: `🎯 RADAR 2026-08-20 · P1 · score 90`. */
const NOTE_HEAD_RE = /^\s*(🎯\s*)?radar\b[ \t]*(.*)$/i;

/** Sin el emoji, exigimos que la línea tenga pinta de encabezado de Radar. */
const NOTE_META_RE = /[·•]|score|\bP[123]\b|\d{4}-\d{2}-\d{2}/i;

function firstLine(text: string): string {
  const nl = text.indexOf('\n');
  return nl === -1 ? text : text.slice(0, nl);
}

/** ¿El título viene con el prefijo de Radar? (sobre el título ORIGINAL). */
export function isRadarTaskTitle(title: string | null | undefined): boolean {
  return typeof title === 'string' && TASK_PREFIX_RE.test(title);
}

/**
 * Título sin el prefijo, para mostrar. Si al sacarlo quedaría vacío devuelve el
 * original: nunca se pinta una tarea sin título.
 */
export function radarTaskTitle(title: string | null | undefined): string {
  if (typeof title !== 'string') return '';
  const clean = title.replace(TASK_PREFIX_RE, '').trim();
  return clean.length > 0 ? clean : title;
}

/** ¿Es una nota interna generada por Radar? (sobre el texto ORIGINAL). */
export function isRadarNoteText(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false;
  const match = firstLine(text.replace(/\r/g, '')).match(NOTE_HEAD_RE);
  if (!match) return false;
  // Con el emoji alcanza; sin él pedimos metadatos para no confundir una nota
  // escrita a mano que arranque con la palabra "radar".
  return Boolean(match[1]) || NOTE_META_RE.test(match[2] ?? '');
}

/**
 * Metadatos de la primera línea (`2026-08-20 · P1 · score 90`), sin el
 * `🎯 RADAR`. Sirve como subtítulo del chip. Si no queda nada útil devuelve la
 * primera línea completa.
 */
export function radarNoteHeadline(text: string | null | undefined): string {
  if (typeof text !== 'string') return '';
  const line = firstLine(text.replace(/\r/g, ''));
  if (!isRadarNoteText(text)) return line.trim();
  const meta = (line.match(NOTE_HEAD_RE)?.[2] ?? '').replace(/^[\s·•‧:\-–—|]+/, '').trim();
  return meta.length > 0 ? meta : line.trim();
}

/**
 * Cuerpo de la nota sin la línea de encabezado, para mostrar. El texto completo
 * sigue estando en la data: acá sólo se recorta la presentación.
 */
export function radarNoteBody(text: string | null | undefined): string {
  if (typeof text !== 'string') return '';
  if (!isRadarNoteText(text)) return text;
  const normalized = text.replace(/\r\n?/g, '\n');
  const nl = normalized.indexOf('\n');
  if (nl === -1) return text; // la nota es sólo el encabezado: no hay cuerpo que recortar
  const body = normalized.slice(nl + 1).replace(/^\n+/, '').trimEnd();
  return body.length > 0 ? body : text;
}
