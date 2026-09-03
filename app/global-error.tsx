'use client';

import { useEffect } from 'react';

function isChunkLoadError(error: Error & { digest?: string }) {
  return /ChunkLoadError|Loading chunk|failed to fetch dynamically imported module/i.test(
    `${error.name} ${error.message} ${error.digest ?? ''}`
  );
}

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isChunkLoadError(error)) return;

    const key = 'whatsaas:chunk-reload-ts';
    const lastAttempt = Number(sessionStorage.getItem(key) ?? 0);
    const now = Date.now();
    if (now - lastAttempt < 15_000) return;

    sessionStorage.setItem(key, String(now));
    window.location.reload();
  }, [error]);

  return (
    <html>
      <body>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420 }}>
            <h1>Error de aplicación</h1>
            <p>No se pudo cargar la página. Actualiza e inténtalo de nuevo.</p>
            <button type="button" onClick={reset}>
              Intentar de nuevo
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
