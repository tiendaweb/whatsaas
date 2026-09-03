'use client';

import { useCallback, useEffect, useState } from 'react';
import { escribirPrefs, leerPrefs, PREFS_DEFAULT } from '../data/preferencias';
import type { Preferencias } from '../data/tipos';

export function useAjustes(teamId: number | null, userId: number | null) {
  const [prefs, setPrefsState] = useState<Preferencias>(PREFS_DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefsState(leerPrefs(teamId, userId));
    setReady(true);
  }, [teamId, userId]);

  const setPrefs = useCallback((patch: Partial<Preferencias>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      if (teamId && userId) escribirPrefs(teamId, userId, next);
      return next;
    });
  }, [teamId, userId]);

  return { prefs, setPrefs, ready };
}
