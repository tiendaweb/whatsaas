'use client';

import { useEffect } from 'react';

export function PWARegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const registerServiceWorker = () => {
      void navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      }).catch(() => undefined);
    };

    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker, { once: true });

    return () => window.removeEventListener('load', registerServiceWorker);
  }, []);

  return null;
}
