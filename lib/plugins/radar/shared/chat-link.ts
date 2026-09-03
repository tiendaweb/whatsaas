/**
 * Ruta canónica del chat de un contacto.
 *
 * La página del chat (`/dashboard/chat/[jid]`) NO recibe el JID completo:
 * recibe el número pelado y ella misma le agrega `@s.whatsapp.net`. Pasarle
 * `549...@s.whatsapp.net` produce `549...@s.whatsapp.net@s.whatsapp.net` y el
 * chat nunca abre — ese era el bug del botón "Abrir chat" de Radar.
 *
 * Los grupos son la excepción: ahí sí viaja el JID completo, porque la página
 * detecta el grupo por el sufijo `@g.us`.
 */
export function chatRouteParam(remoteJid: string): string {
  const jid = remoteJid.trim();
  return jid.endsWith('@g.us') ? jid : jid.split('@')[0];
}

export function chatHrefFor(
  remoteJid: string | null | undefined,
  instanceId?: number | string | null,
): string | null {
  if (!remoteJid || !remoteJid.trim()) return null;
  const param = chatRouteParam(remoteJid);
  if (!param) return null;
  const query = instanceId !== null && instanceId !== undefined && String(instanceId).trim() !== ''
    ? `?instanceId=${encodeURIComponent(String(instanceId))}`
    : '';
  return `/dashboard/chat/${encodeURIComponent(param)}${query}`;
}
