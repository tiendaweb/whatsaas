import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

/**
 * Contexto de una ruta HTTP de Marketing.
 *
 * Marketing casi no escribe: cada cosa se edita en la app dueña del dato (una
 * campaña en Meta Ads, un posteo en Publicaciones). La excepción son los
 * comentarios de Facebook e Instagram, que no tienen otra casa: responderlos
 * publica en la red, así que esa parte pide `marketingWrite`.
 */
export async function getMarketingContext() {
  return getPluginRequestContext('marketingRead');
}

/** Para lo que sale hacia afuera: responder u ocultar un comentario. */
export async function getMarketingWriteContext() {
  return getPluginRequestContext('marketingWrite');
}
