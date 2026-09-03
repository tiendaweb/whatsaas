'use client';

import { useEffect } from 'react';

function isChunkLoadError(error: Error & { digest?: string }) {
  return /ChunkLoadError|Loading chunk|failed to fetch dynamically imported module/i.test(
    `${error.name} ${error.message} ${error.digest ?? ''}`
  );
}

export default function LocaleError({
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
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">No pudimos cargar esta página.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Actualiza la página e inténtalo de nuevo. Si sigue ocurriendo, la
          última versión todavía se está cargando.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Intentar de nuevo
        </button>
      </div>
    </main>
  );
}
