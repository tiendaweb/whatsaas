import type { Preferencias } from './tipos';

export const PREFS_DEFAULT: Preferencias = {
  tema: 'claro',
  acento: '#6366f1',
  objetivoDiario: 5,
  duracionEnfoque: 25,
  destinoProjectId: null,
  escritura: 'conservadora',
  nav: 'bandeja',
  layout: 'lista',
  workspaceId: null,
  projectIds: null,
  sidebarCollapsed: false,
  sidebarWidth: 332,
  etiquetasConfirmadas: [],
};

export function prefsKey(teamId: number, userId: number) {
  return `tareas-ui:${teamId}:${userId}:prefs`;
}

export function flagKey(teamId: number, userId: number) {
  return `tareas-ui:${teamId}:${userId}:flag`;
}

export function leerPrefs(teamId: number | null, userId: number | null): Preferencias {
  if (!teamId || !userId || typeof window === 'undefined') return PREFS_DEFAULT;
  try {
    const raw = window.localStorage.getItem(prefsKey(teamId, userId));
    if (!raw) return PREFS_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Preferencias>;
    return { ...PREFS_DEFAULT, ...parsed };
  } catch {
    return PREFS_DEFAULT;
  }
}

export function escribirPrefs(teamId: number, userId: number, prefs: Preferencias) {
  window.localStorage.setItem(prefsKey(teamId, userId), JSON.stringify(prefs));
}

export function leerFlag(teamId: number | null, userId: number | null): 'clasico' | 'nuevo' | null {
  if (!teamId || !userId || typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(flagKey(teamId, userId));
    if (value === 'clasico' || value === 'nuevo') return value;
  } catch {
    // ignore
  }
  return null;
}

export function escribirFlag(teamId: number, userId: number, ui: 'clasico' | 'nuevo') {
  window.localStorage.setItem(flagKey(teamId, userId), ui);
}
