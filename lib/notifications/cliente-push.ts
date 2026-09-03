'use client';

/**
 * Alta del push en este navegador.
 *
 * El permiso lo da la persona en su navegador y no se puede activar desde el
 * servidor: por eso esto vive en el cliente y lo llaman tanto la campana como
 * el panel de Avisos.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type ResultadoPush = { ok: true } | { ok: false; motivo: 'no-soportado' | 'sin-permiso' | 'sin-claves' | 'error'; detalle?: string };

export async function activarPushAqui(vapid: string | null): Promise<ResultadoPush> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return { ok: false, motivo: 'no-soportado' };
  if (!vapid) return { ok: false, motivo: 'sin-claves' };
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return { ok: false, motivo: 'sin-permiso' };
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource }));
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const res = await fetch('/api/notifications/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) }),
    });
    if (!res.ok) return { ok: false, motivo: 'error', detalle: `HTTP ${res.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, motivo: 'error', detalle: error instanceof Error ? error.message : String(error) };
  }
}

/** ¿Este navegador ya está suscrito? */
export async function tienePushAqui(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}
