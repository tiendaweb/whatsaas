import {
  RADAR_ENGINE_SLUG_REGEX,
  radarAppContextSchema,
  type RadarAppContext,
} from './engine';

export const RADAR_APP_QUERY_KEYS = {
  app: 'app',
  view: 'view',
  context: 'context',
} as const;

type SearchParamsReader = Pick<URLSearchParams, 'get'>;

export type RadarAppDeepLink = {
  appSlug: string;
  view: string | null;
  context: RadarAppContext;
};

/**
 * Construye el href canónico para abrir una aplicación del engine. El origen
 * se agrega al contexto sin pisar un sourceApp explícito de la definición.
 */
export function buildRadarAppHref(input: {
  appSlug: string;
  view?: string | null;
  context?: RadarAppContext;
  sourceApp?: string | null;
}): string | null {
  if (!RADAR_ENGINE_SLUG_REGEX.test(input.appSlug)) return null;
  if (input.view && !RADAR_ENGINE_SLUG_REGEX.test(input.view)) return null;

  const contextCandidate = {
    ...(input.sourceApp && !input.context?.sourceApp ? { sourceApp: input.sourceApp } : {}),
    ...(input.context ?? {}),
  };
  const parsedContext = radarAppContextSchema.safeParse(contextCandidate);
  if (!parsedContext.success) return null;

  const params = new URLSearchParams({ [RADAR_APP_QUERY_KEYS.app]: input.appSlug });
  if (input.view) params.set(RADAR_APP_QUERY_KEYS.view, input.view);
  if (Object.keys(parsedContext.data).length) {
    params.set(RADAR_APP_QUERY_KEYS.context, JSON.stringify(parsedContext.data));
  }
  return `/plugins/radar?${params.toString()}`;
}

/** Parseo tolerante para la UI: un deep-link inválido no rompe RADAR. */
export function parseRadarAppDeepLink(searchParams: SearchParamsReader): RadarAppDeepLink | null {
  const appSlug = searchParams.get(RADAR_APP_QUERY_KEYS.app)?.trim() ?? '';
  if (!RADAR_ENGINE_SLUG_REGEX.test(appSlug)) return null;

  const rawView = searchParams.get(RADAR_APP_QUERY_KEYS.view)?.trim() || null;
  const view = rawView && RADAR_ENGINE_SLUG_REGEX.test(rawView) ? rawView : null;
  const context = parseRadarAppContext(searchParams.get(RADAR_APP_QUERY_KEYS.context)) ?? {};
  return { appSlug, view, context };
}

/**
 * El endpoint usa este parseo estricto para diferenciar contexto ausente de un
 * JSON inválido y responder 400 en vez de propagar datos no confiables.
 */
export function parseRadarAppContext(raw: string | null): RadarAppContext | null {
  if (raw === null || raw === '') return {};
  if (raw.length > 4_000) return null;
  try {
    const parsed = radarAppContextSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
