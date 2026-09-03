// Constante compartida entre cliente y servidor: quién puede ver Radar.
// No lleva 'server-only' a propósito, así el cliente (botón en el chat, chips
// del composer) puede compararla sin importar código de servidor.
export const RADAR_PLUGIN_ID = 'radar';

/** Ruta del tablero de Radar; es también la clave con la que aparece en la navegación. */
export const RADAR_NAV_HREF = '/plugins/radar';

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

/**
 * Quién ve Radar.
 *
 * Antes esto era un email hardcodeado (`noelia@whatspro.uno`), así que ningún
 * otro miembro del equipo podía ver el plugin ni siquiera teniéndolo habilitado.
 * Ahora manda la activación por usuario en `team_member_plugins`, que es el
 * mecanismo que el manifiesto ya declara (`activationMode: 'user'`): habilitar
 * a alguien es una fila, no un deploy.
 *
 * En el cliente no hay sesión de servidor a mano, así que la señal equivalente
 * es que `/plugins/radar` aparezca en la navegación que devuelve
 * `/api/plugins/nav` — esa ruta ya resuelve la activación por usuario.
 */
export function isRadarEnabledInNav(navItems: Array<{ href?: string }> | undefined | null) {
  return Array.isArray(navItems) && navItems.some((item) => item.href === RADAR_NAV_HREF);
}
