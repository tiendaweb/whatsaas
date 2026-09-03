'use client';

import useSWR from 'swr';
import type { BwThemeDefinition, BwThemeMode } from '../shared/schema';

type ThemeResponse = { mode: BwThemeMode; definition: BwThemeDefinition | null };

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

/**
 * Lee el tema resuelto (modo + definición ya publicada) del mini-app. En
 * modo "default" `definition` siempre es null y el llamador debe renderizar
 * la UI clásica sin tocar nada de este módulo — es la garantía de que el
 * tema actual queda exactamente igual.
 */
export function useBusinessTheme(slug: string) {
  const { data, isLoading, mutate } = useSWR<ThemeResponse>(`/api/mini-apps/${slug}/theme`, fetcher);

  async function switchMode(mode: BwThemeMode) {
    await fetch(`/api/mini-apps/${slug}/theme`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    await mutate();
  }

  return {
    mode: data?.mode ?? 'default',
    definition: data?.definition ?? null,
    isLoading,
    switchMode,
  };
}
