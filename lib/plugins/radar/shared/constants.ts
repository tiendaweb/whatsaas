// Constante compartida entre cliente y servidor: quién puede ver Radar.
// No lleva 'server-only' a propósito, así el cliente (botón en el chat, chips
// del composer) puede compararla sin importar código de servidor.
export const RADAR_TARGET_EMAIL = 'noelia@whatspro.uno';

export const RADAR_PLUGIN_ID = 'radar';

/** Claves radar_* que ya escribe la skill radar-analyst en contacts.customData. */
export const RADAR_ANALYST_FIELD_KEYS = [
  'radar_score',
  'radar_prioridad',
  'radar_intencion',
  'radar_objecion',
  'radar_recuperabilidad',
  'radar_confianza',
  'radar_fecha_analisis',
  'radar_oportunidad_2',
  'radar_estrategia',
] as const;

export type RadarPriority = 'P1' | 'P2' | 'P3' | 'descartado' | 'Revisar';

export function isRadarUserEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase() === RADAR_TARGET_EMAIL;
}
