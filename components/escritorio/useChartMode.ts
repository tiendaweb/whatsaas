'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import type { ChartMode } from '@/lib/charts/theme';

/**
 * Modo de color para los gráficos.
 *
 * `resolvedTheme` de next-themes sólo existe después de montar, así que hasta
 * entonces se devuelve 'light' — que es lo mismo que asume el render del
 * servidor y evita el desajuste de hidratación.
 */
export function useChartMode(): ChartMode {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return 'light';
  return resolvedTheme === 'dark' ? 'dark' : 'light';
}
