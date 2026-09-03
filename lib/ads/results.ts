// Meta no devuelve la columna "Resultados" que muestra Ads Manager: hay que derivarla
// del objetivo de la campaña. El actions[] real varía según cómo esté configurado el
// anuncio (destino, píxel), así que por objetivo guardamos una lista ORDENADA de
// candidatos y nos quedamos con el primero que efectivamente tenga valor.

import type { MetaActionEntry } from './meta-ads';

/** Pseudo action_type para objetivos de reconocimiento, donde el resultado son impresiones. */
export const IMPRESSIONS_RESULT = '__impressions__';
export const NO_RESULT = '__none__';

const MESSAGING_CHAIN = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'onsite_conversion.messaging_first_reply',
];

export const RESULT_CANDIDATES: Record<string, string[]> = {
  // ODAX (objetivos actuales)
  OUTCOME_ENGAGEMENT: [...MESSAGING_CHAIN, 'post_engagement', 'page_engagement', 'video_view', 'post_reaction', 'like'],
  OUTCOME_LEADS: ['lead', 'onsite_conversion.lead_grouped', 'leadgen.other', 'offsite_conversion.fb_pixel_lead', ...MESSAGING_CHAIN],
  OUTCOME_SALES: [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
    'onsite_conversion.purchase',
    ...MESSAGING_CHAIN,
    'initiate_checkout',
    'add_to_cart',
  ],
  OUTCOME_TRAFFIC: ['landing_page_view', 'link_click'],
  OUTCOME_AWARENESS: [IMPRESSIONS_RESULT],
  OUTCOME_APP_PROMOTION: ['omni_app_install', 'app_install', 'mobile_app_install'],

  // Legacy: las campañas viejas siguen apareciendo en el histórico.
  MESSAGES: MESSAGING_CHAIN,
  CONVERSIONS: ['purchase', 'offsite_conversion.fb_pixel_purchase', 'lead', 'offsite_conversion.fb_pixel_lead'],
  LEAD_GENERATION: ['lead', 'leadgen.other', 'offsite_conversion.fb_pixel_lead'],
  LINK_CLICKS: ['link_click', 'landing_page_view'],
  POST_ENGAGEMENT: ['post_engagement', 'page_engagement'],
  PAGE_LIKES: ['like', 'page_engagement'],
  VIDEO_VIEWS: ['video_view'],
  APP_INSTALLS: ['mobile_app_install', 'app_install'],
  PRODUCT_CATALOG_SALES: ['omni_purchase', 'purchase'],
  STORE_VISITS: ['store_visit'],
  EVENT_RESPONSES: ['rsvp'],
  BRAND_AWARENESS: [IMPRESSIONS_RESULT],
  REACH: [IMPRESSIONS_RESULT],
  LOCAL_AWARENESS: [IMPRESSIONS_RESULT],
};

const GENERIC_FALLBACK = [
  ...MESSAGING_CHAIN,
  'purchase',
  'lead',
  'landing_page_view',
  'link_click',
  'post_engagement',
  IMPRESSIONS_RESULT,
];

export const RESULT_LABELS: Record<string, string> = {
  'onsite_conversion.messaging_conversation_started_7d': 'Conversaciones iniciadas',
  'onsite_conversion.total_messaging_connection': 'Conexiones de mensajería',
  'onsite_conversion.messaging_first_reply': 'Primeras respuestas',
  purchase: 'Compras',
  omni_purchase: 'Compras',
  'offsite_conversion.fb_pixel_purchase': 'Compras (píxel)',
  'onsite_conversion.purchase': 'Compras',
  initiate_checkout: 'Pagos iniciados',
  add_to_cart: 'Agregados al carrito',
  lead: 'Clientes potenciales',
  'onsite_conversion.lead_grouped': 'Clientes potenciales',
  'leadgen.other': 'Clientes potenciales (formulario)',
  'offsite_conversion.fb_pixel_lead': 'Clientes potenciales (píxel)',
  landing_page_view: 'Visitas a la landing',
  link_click: 'Clics en el enlace',
  post_engagement: 'Interacciones con la publicación',
  page_engagement: 'Interacciones con la página',
  video_view: 'Reproducciones',
  post_reaction: 'Reacciones',
  like: 'Me gusta',
  omni_app_install: 'Instalaciones',
  app_install: 'Instalaciones',
  mobile_app_install: 'Instalaciones',
  store_visit: 'Visitas a la tienda',
  rsvp: 'Respuestas al evento',
  [IMPRESSIONS_RESULT]: 'Impresiones',
  [NO_RESULT]: 'Resultados',
};

export const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_ENGAGEMENT: 'Interacción',
  OUTCOME_LEADS: 'Clientes potenciales',
  OUTCOME_SALES: 'Ventas',
  OUTCOME_TRAFFIC: 'Tráfico',
  OUTCOME_AWARENESS: 'Reconocimiento',
  OUTCOME_APP_PROMOTION: 'Promoción de app',
  MESSAGES: 'Mensajes',
  CONVERSIONS: 'Conversiones',
  LEAD_GENERATION: 'Clientes potenciales',
  LINK_CLICKS: 'Clics en el enlace',
  POST_ENGAGEMENT: 'Interacción',
  PAGE_LIKES: 'Me gusta de la página',
  VIDEO_VIEWS: 'Reproducciones',
  APP_INSTALLS: 'Instalaciones',
  PRODUCT_CATALOG_SALES: 'Ventas del catálogo',
  STORE_VISITS: 'Visitas a la tienda',
  EVENT_RESPONSES: 'Respuestas al evento',
  BRAND_AWARENESS: 'Reconocimiento',
  REACH: 'Alcance',
  LOCAL_AWARENESS: 'Reconocimiento local',
};

export function resultLabel(actionType: string | null | undefined): string {
  if (!actionType) return 'Resultados';
  return RESULT_LABELS[actionType] ?? actionType;
}

export function objectiveLabel(objective: string | null | undefined): string {
  if (!objective) return '—';
  return OBJECTIVE_LABELS[objective] ?? objective;
}

/**
 * Elige el action_type que representa el "resultado" de la campaña y su valor para el día.
 * Devuelve 0 resultados (y NO_RESULT) cuando ningún candidato tiene valor: preferimos un
 * cero honesto a inventar una métrica que no corresponde al objetivo.
 */
export function resolveResult(
  objective: string | null | undefined,
  row: { actions?: MetaActionEntry[]; impressions: number },
): { resultActionType: string; results: number } {
  const candidates = (objective && RESULT_CANDIDATES[objective]) || GENERIC_FALLBACK;
  const byType = new Map((row.actions ?? []).map((entry) => [entry.action_type, Number(entry.value) || 0]));

  for (const candidate of candidates) {
    if (candidate === IMPRESSIONS_RESULT) {
      // Deliberadamente impresiones y no alcance: el alcance no es aditivo entre días.
      if (row.impressions > 0) return { resultActionType: IMPRESSIONS_RESULT, results: row.impressions };
      continue;
    }

    const value = byType.get(candidate);
    if (value && value > 0) return { resultActionType: candidate, results: value };
  }

  return { resultActionType: NO_RESULT, results: 0 };
}
