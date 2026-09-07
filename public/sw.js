const STATIC_CACHE = 'whatspro-static-v4';
const STATIC_ASSETS = [
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('whatspro-static-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isVersionedStaticAsset = url.pathname.startsWith('/_next/static/');
  const isPwaAsset = STATIC_ASSETS.includes(url.pathname);
  const isNotificationSound = url.pathname.startsWith('/sounds/');
  if (!isVersionedStaticAsset && !isPwaAsset && !isNotificationSound) return;

  // `<audio>` pide el mp3 por rangos y el navegador contesta 206. `Cache.put`
  // no acepta respuestas parciales: tiraba y, como el throw pasaba dentro del
  // respondWith, el fetch entero fallaba con ERR_FAILED y el sonido no sonaba.
  // Un pedido con Range se deja pasar sin tocar la caché.
  if (request.headers.has('range')) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // Sólo se guarda un 200 completo: `response.ok` también es cierto para
      // 206, y una opaca (`type: 'opaque'`) no sirve para servir después.
      if (response.status === 200 && response.type === 'basic') {
        // Guardar es best-effort: si la caché está llena o rechaza la entrada,
        // el usuario igual tiene que recibir su respuesta.
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }).catch(() => fetch(request)),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/**
 * Avisos con la app cerrada (web push).
 *
 * El servidor manda { title, body, url }; el clic lo maneja el listener de
 * abajo, que ya sabía abrir o enfocar la pestaña.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'WhatsPro', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'WhatsPro';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/pwa-icon-192.png',
      badge: '/pwa-icon-192.png',
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/apps' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const relativeUrl = event.notification.data?.url || '/dashboard';
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        const appClient = clientList.find((client) => new URL(client.url).origin === self.location.origin);
        if (appClient) {
          if ('navigate' in appClient) await appClient.navigate(targetUrl);
          return appClient.focus();
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
