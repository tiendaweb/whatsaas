'use client';

import { useEffect } from 'react';

const RELOAD_KEY = 'whatspro:last-chunk-reload-at';
const RELOAD_COOLDOWN_MS = 15_000;

function isChunkLoadFailure(reason: unknown) {
  const message =
    reason instanceof Error
      ? `${reason.name} ${reason.message}`
      : typeof reason === 'string'
        ? reason
        : reason && typeof reason === 'object' && 'message' in reason
          ? String((reason as { message?: unknown }).message)
          : '';

  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
}

function recoverFromChunkLoadFailure() {
  const now = Date.now();
  const lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);

  if (now - lastReload < RELOAD_COOLDOWN_MS) return;

  window.sessionStorage.setItem(RELOAD_KEY, String(now));
  const url = new URL(window.location.href);
  url.searchParams.set('__chunk_reload', String(now));
  window.location.replace(url.toString());
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!isChunkLoadFailure(event.error || event.message)) return;
      event.preventDefault();
      recoverFromChunkLoadFailure();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadFailure(event.reason)) return;
      event.preventDefault();
      recoverFromChunkLoadFailure();
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
