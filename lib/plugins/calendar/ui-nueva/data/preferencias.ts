'use client';

import type { VistaCalendario } from './tipos-ui';

export type PrefsCalendario = {
  /** `sistema` sigue el tema de WhatsPro; claro/oscuro lo fija para el calendario. */
  tema: 'sistema' | 'claro' | 'oscuro';
  acento: string;
  vista: VistaCalendario;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** Tipos de evento visibles. Vacío = todos. */
  kinds: string[];
  /** Sólo los míos. */
  soloMios: boolean;
  verCancelados: boolean;
};

export const PREFS_CALENDARIO: PrefsCalendario = {
  tema: 'sistema',
  acento: '#6366f1',
  vista: 'semana',
  sidebarCollapsed: false,
  sidebarWidth: 280,
  kinds: [],
  soloMios: false,
  verCancelados: false,
};

const clave = (teamId: number, userId: number) => `calendario-ui:${teamId}:${userId}:prefs`;

export function leerPrefs(teamId: number | null, userId: number | null): PrefsCalendario {
  if (!teamId || !userId || typeof window === 'undefined') return PREFS_CALENDARIO;
  try {
    const raw = window.localStorage.getItem(clave(teamId, userId));
    return raw ? { ...PREFS_CALENDARIO, ...(JSON.parse(raw) as Partial<PrefsCalendario>) } : PREFS_CALENDARIO;
  } catch {
    return PREFS_CALENDARIO;
  }
}

export function escribirPrefs(teamId: number | null, userId: number | null, prefs: PrefsCalendario) {
  if (!teamId || !userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(clave(teamId, userId), JSON.stringify(prefs));
  } catch {
    /* sin storage */
  }
}
