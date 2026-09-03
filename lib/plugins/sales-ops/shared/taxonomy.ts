/**
 * Taxonomía del Command Center Comercial (plugin `sales-ops`).
 *
 * Todo lo que acá es una lista cerrada se usa como `enum` de Zod en el
 * contrato del clasificador y como `varchar` en la base. Cambiar un valor
 * implica migrar las filas que lo usan: no renombrar a la ligera.
 *
 * Referencia: docs/command-center-comercial/03-MODELO-DE-DATOS.md §1 y
 * 04-MOTOR-DE-CLASIFICACION.md §8-§9.
 */

export const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'GX'] as const;
export type Gate = (typeof GATES)[number];

export const GATE_LABELS: Record<Gate, string> = {
  G0: 'Entrada muerta',
  G1: 'Curiosidad mínima',
  G2: 'Diagnóstico iniciado',
  G3: 'Necesidad definida',
  G4: 'Precio recibido',
  G5: 'Evaluando propuesta',
  G6: 'Objeción abierta',
  G7: 'Intención fuerte',
  G8: 'Compra elegida',
  G9: 'Pago pendiente',
  G10: 'Cierre operativo bloqueado',
  G11: 'Ganado',
  GX: 'Perdido',
};

/** Orden numérico para comparar gates. GX queda fuera de la escala. */
export function gateRank(gate: Gate): number {
  if (gate === 'GX') return -1;
  return Number(gate.slice(1));
}

export const FRONT_MONEY_GATES: Gate[] = ['G10', 'G9', 'G8', 'G7', 'G6'];
export const FRONT_OPPORTUNITY_GATES: Gate[] = ['G4', 'G5', 'G6', 'G7'];
export const FRONT_SWEEP_GATES: Gate[] = ['G0', 'G1', 'G2', 'G3'];

export const DROP_REASONS = [
  'sin_respuesta',
  'curiosidad_no_desarrollada',
  'diagnostico_incompleto',
  'precio_sin_reaccion',
  'evaluando_sin_cierre',
  'objecion_precio',
  'objecion_presupuesto',
  'objecion_socio',
  'objecion_tiempo',
  'objecion_confianza',
  'objecion_comparacion',
  'objecion_materiales',
  'objecion_decision',
  'objecion_mas_adelante',
  'intencion_sin_concretar',
  'eleccion_sin_pago',
  'pago_no_concretado',
  'bloqueo_nuestro_datos_pago',
  'bloqueo_nuestro_contrato',
  'bloqueo_nuestro_llamada',
  'bloqueo_nuestro_inicio',
  'bloqueo_nuestro_informacion',
  'ganado',
  'rechazo_explicito',
  'numero_incorrecto',
  'negocio_cerrado',
  'incompatibilidad',
  'no_contactar',
  'desconocido',
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

export const OBJECTIONS = [
  'precio',
  'presupuesto',
  'socio',
  'tiempo',
  'confianza',
  'comparacion',
  'materiales',
  'decision',
  'mas_adelante',
  'ninguna',
] as const;
export type Objection = (typeof OBJECTIONS)[number];

export const NEEDS = [
  'sitio_web',
  'tienda_online',
  'combo_full',
  'tienda_profesional',
  'sitio_profesional',
  'publicidad',
  'contenido',
  'desarrollo_medida',
  'automatizacion',
  'otro',
  'indefinida',
] as const;
export type Need = (typeof NEEDS)[number];

export const INTENTS = ['ninguna', 'curiosidad', 'evaluando', 'fuerte', 'compra_activa'] as const;
export type Intent = (typeof INTENTS)[number];

export const TEMPERATURES = ['cold', 'warm', 'hot'] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const COLLECTION_SPEEDS = ['inmediata', 'dias', 'semanas', 'meses', 'indefinida'] as const;
export type CollectionSpeed = (typeof COLLECTION_SPEEDS)[number];

export const OWNERS = ['noelia', 'carlos', 'produccion', 'ia', 'nadie'] as const;
export type Owner = (typeof OWNERS)[number];

export const ANALYSIS_STATUSES = [
  'sin_analizar',
  'en_proceso',
  'recuperado',
  'cobro',
  'pendiente_con_fecha',
  'pre_descarte',
  'descarte_definitivo',
  'cliente',
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const SOURCES = ['ads_meta', 'ads_cta_sitio', 'importacion', 'organico', 'presencial', 'desconocido'] as const;
export type Source = (typeof SOURCES)[number];

export const CUSTOMER_EVIDENCE = ['customer_link', 'sale_paid', 'subscription', 'custom_data', 'tag_product', 'chat', 'none'] as const;
export type CustomerEvidence = (typeof CUSTOMER_EVIDENCE)[number];

export const ANALYZED_BY = ['server', 'claude', 'chatgpt', 'grok', 'human'] as const;
export type AnalyzedBy = (typeof ANALYZED_BY)[number];

export const VERSION_REASONS = ['initial', 'chat_changed', 'prompt_changed', 'manual_override', 'radar_signal', 'import'] as const;
export type VersionReason = (typeof VERSION_REASONS)[number];

export const SIGNAL_KINDS = [
  'interesado',
  'pide_informacion',
  'precio',
  'objecion',
  'quiere_llamada',
  'intencion_compra',
  'pago',
  'rechazo',
  'respuesta_automatica',
  'irrelevante',
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];
/** Señales que suben el contacto a la cola al instante y emiten Pusher. */
export const URGENT_SIGNALS: SignalKind[] = ['pago', 'intencion_compra', 'quiere_llamada'];

export const SIGNAL_STATUSES = ['new', 'seen', 'handled', 'dismissed'] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export const ACTION_KINDS = [
  'send_message',
  /** Deja un mensaje programado (plugin Mensajes programados) para una fecha y hora. */
  'schedule_message',
  'create_task',
  /** Tarea en el workspace "Demos" de Tareas OS con la investigación del chat y el prompt para generar la web. */
  'request_demo',
  'register_sale',
  'mark_pre_descarte',
  'mark_descarte',
  'assign_owner',
  'schedule_call',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_STATUSES = [
  'proposed',
  'pending_approval',
  'approved',
  'executing',
  'executed',
  'resulted',
  'rejected',
  'expired',
  'failed',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_ROLES = ['noelia', 'carlos', 'any'] as const;
export type ActionRole = (typeof ACTION_ROLES)[number];

export const EXPERIMENT_STATUSES = ['draft', 'running', 'closed'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const PROMPT_PURPOSES = ['classify', 'radar', 'next_action', 'followup_message', 'audit_dossier', 'custom'] as const;
export type PromptPurpose = (typeof PROMPT_PURPOSES)[number];
export const PROMPT_AUDIENCES = ['server', 'connector', 'both'] as const;
export const PROMPT_STATUSES = ['draft', 'active', 'retired'] as const;

export const CURRENCIES = ['ARS', 'PYG', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

// ── Valor potencial (doc 04 §8) ─────────────────────────────────────────────

/** USD de referencia por necesidad. Se revisa con el equipo; `quoted_price` manda si existe. */
export const NEED_VALUE_USD: Record<Need, number> = {
  sitio_web: 45,
  tienda_online: 45,
  combo_full: 65,
  tienda_profesional: 220,
  sitio_profesional: 220,
  publicidad: 110,
  contenido: 65,
  desarrollo_medida: 330,
  automatizacion: 165,
  otro: 45,
  indefinida: 45,
};

/** Tipo de cambio provisorio a USD (unidades de moneda por 1 USD). Setting del plugin lo pisa. */
export const DEFAULT_FX_TO_USD: Record<Currency, number> = { ARS: 1000, PYG: 7500, USD: 1 };

// ── Prioridad (doc 04 §9) ──────────────────────────────────────────────────

export const GATE_BASE_PROBABILITY: Record<Gate, number> = {
  G10: 0.85,
  G9: 0.7,
  G8: 0.6,
  G7: 0.5,
  G6: 0.35,
  G5: 0.3,
  G4: 0.2,
  G3: 0.2,
  G2: 0.12,
  G1: 0.07,
  G0: 0.03,
  G11: 0,
  GX: 0,
};

export function ageFactor(daysSilent: number): number {
  if (daysSilent <= 7) return 1;
  if (daysSilent <= 30) return 0.8;
  if (daysSilent <= 90) return 0.55;
  if (daysSilent <= 180) return 0.35;
  return 0.2;
}

export function impactsFactor(followupsTotal: number): number {
  if (followupsTotal <= 0) return 1;
  if (followupsTotal === 1) return 0.85;
  if (followupsTotal === 2) return 0.65;
  return 0.4;
}

export const OBJECTION_FACTOR: Record<Objection, number> = {
  ninguna: 1,
  tiempo: 0.8,
  mas_adelante: 0.8,
  precio: 0.6,
  presupuesto: 0.6,
  socio: 0.6,
  decision: 0.6,
  comparacion: 0.7,
  confianza: 0.5,
  materiales: 0.9,
};

export const SPEED_FACTOR: Record<CollectionSpeed, number> = {
  inmediata: 1,
  dias: 0.8,
  semanas: 0.5,
  meses: 0.25,
  indefinida: 0.15,
};

/** Velocidad de cobro que se propone por gate cuando la IA no la ajusta. */
export const DEFAULT_SPEED_BY_GATE: Record<Gate, CollectionSpeed> = {
  G10: 'inmediata',
  G9: 'inmediata',
  G8: 'dias',
  G7: 'semanas',
  G6: 'meses',
  G5: 'meses',
  G4: 'meses',
  G3: 'meses',
  G2: 'indefinida',
  G1: 'indefinida',
  G0: 'indefinida',
  G11: 'indefinida',
  GX: 'indefinida',
};

export const SALES_OPS_PLUGIN_ID = 'sales-ops';
export const SALES_OPS_ACTIVITY_PREFIX = 'SALES_OPS_';
/** Días tras el último envío en los que no se propone otro al mismo chat. */
export const SEND_COOLDOWN_HOURS = 72;
/** Una propuesta sin aprobar expira a los 7 días. */
export const PROPOSAL_TTL_DAYS = 7;
