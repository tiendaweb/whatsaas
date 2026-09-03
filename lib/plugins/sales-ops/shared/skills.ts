/**
 * Skills del Prompt Studio: el contrato que comparten la UI, las rutas HTTP y
 * las tools MCP.
 *
 * Una **skill** es un prompt guardado del equipo con todo lo que hace falta
 * para usarlo sin preguntarle nada a quien lo escribió: qué hace (`description`),
 * si es una rutina o algo puntual (`recurrence`), quién lo ejecuta
 * (`execution`), dónde se puede lanzar (`scope`), qué datos hay que completar
 * antes (`variables`) y en qué situaciones se recomienda solo (`recommendFor`).
 *
 * Este archivo NO importa nada del servidor a propósito: el formulario de datos
 * dinámicos se previsualiza en el navegador con la misma función que después
 * usa el servidor para armar el texto definitivo. Un render distinto entre los
 * dos sería un prompt que se copia distinto del que se ejecuta.
 */
import type { AnalysisStatus, Gate, Owner, SignalKind } from './taxonomy';

// ── Listas cerradas ────────────────────────────────────────────────────────

/** Cómo de seguido se usa. Todo lo que no es `on_demand` es una rutina. */
export const SKILL_RECURRENCES = ['on_demand', 'daily', 'weekly', 'monthly'] as const;
export type SkillRecurrence = (typeof SKILL_RECURRENCES)[number];

/** Quién la ejecuta. `both` deja que la persona (o el conector) elija al lanzar. */
export const SKILL_EXECUTIONS = ['connector', 'api', 'both'] as const;
export type SkillExecution = (typeof SKILL_EXECUTIONS)[number];

/** Dónde se puede lanzar: sobre el equipo, sobre un chat, o las dos. */
export const SKILL_SCOPES = ['team', 'chat', 'both'] as const;
export type SkillScope = (typeof SKILL_SCOPES)[number];

export const SKILL_CATEGORIES = ['general', 'auditoria', 'cobro', 'redaccion', 'radar', 'seguimiento', 'limpieza', 'reporte'] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/**
 * Íconos permitidos. Es una lista cerrada porque el mapa a componentes de
 * lucide se arma estático en la UI: un nombre libre acá sería una tarjeta sin
 * ícono, y no hay forma de avisarlo desde el conector.
 */
export const SKILL_ICONS = [
  'sparkles',
  'wand',
  'radar',
  'coins',
  'pen',
  'search',
  'clipboard',
  'brush',
  'chart',
  'calendar',
  'message',
  'users',
  'zap',
  'target',
] as const;
export type SkillIcon = (typeof SKILL_ICONS)[number];

export const SKILL_VARIABLE_TYPES = ['text', 'textarea', 'number', 'select', 'date', 'boolean'] as const;
export type SkillVariableType = (typeof SKILL_VARIABLE_TYPES)[number];

/** Modo con el que se lanzó una corrida. */
export const RUN_MODES = ['queue', 'api'] as const;
export type RunMode = (typeof RUN_MODES)[number];

// ── Tipos ──────────────────────────────────────────────────────────────────

export type SkillVariable = {
  /** Nombre de la variable tal cual aparece en el texto: `{{nombre}}`. */
  name: string;
  label: string;
  type: SkillVariableType;
  required: boolean;
  placeholder?: string | null;
  help?: string | null;
  /** Sólo para `select`. */
  options?: string[];
  defaultValue?: string | null;
};

/** Cuándo la skill se ofrece sola como siguiente acción en la ficha de un chat. */
export type SkillRecommendFor = {
  gates?: Gate[];
  statuses?: AnalysisStatus[];
  signals?: SignalKind[];
  owners?: Owner[];
};

export type Skill = {
  id: number;
  key: string;
  title: string;
  description: string | null;
  category: SkillCategory;
  icon: SkillIcon;
  recurrence: SkillRecurrence;
  execution: SkillExecution;
  scope: SkillScope;
  variables: SkillVariable[];
  recommendFor: SkillRecommendFor;
  toolChain: string[];
  notes: string | null;
  /** Texto completo de la skill (system + plantilla), con `{{variables}}` sin resolver. */
  text: string;
  version: number;
  status: string;
  pinned: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  updatedAt: string;
};

/**
 * Declaración de variable tal como llega de un formulario o de una tool: sólo
 * `name` es obligatorio, el resto lo completa `normalizeVariable` con defaults.
 */
export type SkillVariableInput = Partial<Omit<SkillVariable, 'name'>> & { name: string };

export type SkillInput = {
  key?: string | null;
  title: string;
  text: string;
  description?: string | null;
  category?: SkillCategory;
  icon?: SkillIcon;
  recurrence?: SkillRecurrence;
  execution?: SkillExecution;
  scope?: SkillScope;
  variables?: SkillVariableInput[];
  recommendFor?: SkillRecommendFor;
  toolChain?: string[];
  notes?: string | null;
  pinned?: boolean;
};

// ── Etiquetas (español rioplatense, sin i18n como el resto del plugin) ──────

export const RECURRENCE_LABELS: Record<SkillRecurrence, string> = {
  on_demand: 'Puntual',
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
};

export const EXECUTION_LABELS: Record<SkillExecution, string> = {
  connector: 'Cola de conectores',
  api: 'IA del equipo (API)',
  both: 'API o cola',
};

export const SCOPE_LABELS: Record<SkillScope, string> = {
  team: 'Todo el equipo',
  chat: 'Un chat',
  both: 'Equipo o chat',
};

export const CATEGORY_LABELS: Record<SkillCategory, string> = {
  general: 'General',
  auditoria: 'Auditoría',
  cobro: 'Cobro',
  redaccion: 'Redacción',
  radar: 'Radar',
  seguimiento: 'Seguimiento',
  limpieza: 'Limpieza',
  reporte: 'Reportes',
};

export const VARIABLE_TYPE_LABELS: Record<SkillVariableType, string> = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  number: 'Número',
  select: 'Lista de opciones',
  date: 'Fecha',
  boolean: 'Sí / no',
};

// ── Guardas ────────────────────────────────────────────────────────────────

const isIn = <T extends readonly string[]>(list: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

export const isRecurrence = (v: unknown): v is SkillRecurrence => isIn(SKILL_RECURRENCES, v);
export const isExecution = (v: unknown): v is SkillExecution => isIn(SKILL_EXECUTIONS, v);
export const isScope = (v: unknown): v is SkillScope => isIn(SKILL_SCOPES, v);
export const isCategory = (v: unknown): v is SkillCategory => isIn(SKILL_CATEGORIES, v);
export const isSkillIcon = (v: unknown): v is SkillIcon => isIn(SKILL_ICONS, v);
export const isVariableType = (v: unknown): v is SkillVariableType => isIn(SKILL_VARIABLE_TYPES, v);
export const isRunMode = (v: unknown): v is RunMode => isIn(RUN_MODES, v);

/** Una rutina es cualquier cadencia distinta de "puntual". */
export const isRoutine = (skill: Pick<Skill, 'recurrence'>): boolean => skill.recurrence !== 'on_demand';

/** ¿Se puede lanzar sobre este destino? */
export function allowsTarget(skill: Pick<Skill, 'scope'>, target: 'team' | 'chat'): boolean {
  return skill.scope === 'both' || skill.scope === target;
}

/** ¿Se puede lanzar con este motor? */
export function allowsMode(skill: Pick<Skill, 'execution'>, mode: RunMode): boolean {
  if (skill.execution === 'both') return true;
  return skill.execution === (mode === 'api' ? 'api' : 'connector');
}

/** Motor por defecto de una skill: `both` arranca en API, que es el que da respuesta al instante. */
export function defaultMode(skill: Pick<Skill, 'execution'>): RunMode {
  return skill.execution === 'connector' ? 'queue' : 'api';
}

// ── Variables y render ─────────────────────────────────────────────────────

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Nombres de `{{variable}}` que aparecen en el texto, sin repetir y en orden. */
export function extractVariableNames(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(VARIABLE_RE)) {
    const name = match[1];
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

/** `mi Variable Rara` → `mi_variable_rara`. Los nombres van al texto, así que no pueden llevar espacios. */
export function normalizeVariableName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Variables declaradas que faltan completar (sólo las `required` sin valor). */
export function missingVariables(variables: SkillVariable[], values: Record<string, string>): SkillVariable[] {
  return variables.filter((v) => v.required && !String(values[v.name] ?? v.defaultValue ?? '').trim());
}

/**
 * Rellena `{{variables}}`.
 *
 * Una variable declarada y sin valor queda como `«label»` en vez de vacía: el
 * hueco visible se lee y se corrige, mientras que el vacío se cuela hasta el
 * conector y produce una instrucción sin sentido ("mandale el precio a "). Las
 * `{{}}` que no están declaradas se dejan tal cual, porque suelen ser
 * marcadores para el propio conector (`{{nombre}}` de un lote).
 */
export function renderSkillText(text: string, variables: SkillVariable[], values: Record<string, string>): string {
  const declared = new Map(variables.map((v) => [v.name, v]));
  return text.replace(VARIABLE_RE, (whole, name: string) => {
    const declaration = declared.get(name);
    if (!declaration) return whole;
    const value = String(values[name] ?? declaration.defaultValue ?? '').trim();
    if (value) return value;
    return `«${declaration.label || name}»`;
  });
}

/** Sanea una declaración de variable venga de donde venga (UI o conector). */
export function normalizeVariable(raw: unknown): SkillVariable | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = normalizeVariableName(String(r.name ?? r.label ?? ''));
  if (!name) return null;
  const type = isVariableType(r.type) ? r.type : 'text';
  const options = Array.isArray(r.options)
    ? r.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 40)
    : undefined;
  return {
    name,
    label: String(r.label ?? name).trim().slice(0, 80) || name,
    type: type === 'select' && (!options || options.length === 0) ? 'text' : type,
    required: r.required === true,
    placeholder: r.placeholder == null ? null : String(r.placeholder).slice(0, 160),
    help: r.help == null ? null : String(r.help).slice(0, 240),
    options,
    defaultValue: r.defaultValue == null ? null : String(r.defaultValue).slice(0, 400),
  };
}

export function normalizeVariables(raw: unknown): SkillVariable[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SkillVariable[] = [];
  raw.slice(0, 20).forEach((item) => {
    const v = normalizeVariable(item);
    if (!v || seen.has(v.name)) return;
    seen.add(v.name);
    out.push(v);
  });
  return out;
}
