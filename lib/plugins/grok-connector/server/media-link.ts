import 'server-only';

import crypto from 'crypto';

/**
 * Enlaces firmados y efímeros para media de chat.
 *
 * Por qué existen: la descarga privada exige la cabecera `Authorization` del
 * conector. Eso sirve cuando el propio conector hace el pedido, pero no
 * cuando la URL tiene que viajar a algo que no manda esa cabecera —un informe
 * generado, una vista previa, un paso de visión—. Ahí la única alternativa
 * era volcar el binario en base64 dentro del contexto del modelo.
 *
 * La firma es la que sostiene la privacidad: la URL sólo sirve si lleva un
 * HMAC válido de (equipo + mensaje + vencimiento), así que no se puede
 * adivinar ni fabricar, y deja de funcionar sola al vencer. NO es un enlace
 * público: es una credencial de un solo recurso, acotada en el tiempo.
 *
 * Sigue siendo un secreto portable mientras dura — quien tenga el enlace
 * puede abrirlo. Por eso el vencimiento es corto y la ruta vuelve a validar
 * equipo, permiso y visibilidad del chat antes de servir el archivo: la firma
 * autoriza a PEDIR, no reemplaza el control de acceso.
 */

const DEFAULT_TTL_SECONDS = 15 * 60;
export const MEDIA_LINK_MAX_TTL_SECONDS = 60 * 60;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('Falta AUTH_SECRET para firmar enlaces de media.');
  return value;
}

function firmar(teamId: number, messageId: string, expiraEn: number) {
  return crypto
    .createHmac('sha256', secret())
    .update(`chat-media:${teamId}:${messageId}:${expiraEn}`)
    .digest('base64url');
}

export function crearEnlaceFirmado(input: {
  baseUrl: string;
  teamId: number;
  messageId: string;
  ttlSeconds?: number;
}) {
  const ttl = Math.min(Math.max(input.ttlSeconds ?? DEFAULT_TTL_SECONDS, 60), MEDIA_LINK_MAX_TTL_SECONDS);
  const expiraEn = Math.floor(Date.now() / 1000) + ttl;
  const firma = firmar(input.teamId, input.messageId, expiraEn);
  const url = new URL(input.baseUrl);
  url.searchParams.set('team', String(input.teamId));
  url.searchParams.set('exp', String(expiraEn));
  url.searchParams.set('sig', firma);
  return { url: url.toString(), expiresAt: new Date(expiraEn * 1000).toISOString(), ttlSeconds: ttl };
}

export type VerificacionEnlace =
  | { ok: true; teamId: number }
  | { ok: false; motivo: 'incompleto' | 'vencido' | 'firma_invalida' };

export function verificarEnlaceFirmado(messageId: string, params: URLSearchParams): VerificacionEnlace {
  const team = Number(params.get('team'));
  const exp = Number(params.get('exp'));
  const sig = params.get('sig');
  if (!Number.isInteger(team) || team <= 0 || !Number.isInteger(exp) || !sig) {
    return { ok: false, motivo: 'incompleto' };
  }
  if (exp * 1000 < Date.now()) return { ok: false, motivo: 'vencido' };

  const esperada = Buffer.from(firmar(team, messageId, exp));
  const recibida = Buffer.from(sig);
  // Comparación en tiempo constante: una comparación normal filtra, por el
  // tiempo que tarda, cuántos caracteres del prefijo son correctos.
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) {
    return { ok: false, motivo: 'firma_invalida' };
  }
  return { ok: true, teamId: team };
}
