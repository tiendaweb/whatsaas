'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

import type { AnalysisDetail } from '../../shared/api-types';
import { fmtInt } from './format';

export type EjeRadar = { label: string; corto: string; valor: number; crudo: string };

/**
 * Los seis ejes del análisis, normalizados a 0–100.
 *
 * Cada uno ya existía como número suelto adentro del desplegable "Todos los
 * datos": intención 83, confianza 61, probabilidad 40 %… Leídos de a uno no
 * dicen nada; juntos dibujan una forma que se reconoce de un vistazo —el
 * triángulo flaco del que no contesta hace un mes, el hexágono lleno del que
 * está por pagar.
 *
 * `daysSilent` se invierte (más silencio, menos actividad) y se corta a los 30
 * días: entre "hace dos meses" y "hace seis" no hay diferencia comercial.
 */
export function ejesDeAnalisis(a: AnalysisDetail): EjeRadar[] {
  const temperatura = a.temperature === 'hot' ? 100 : a.temperature === 'warm' ? 60 : 25;
  const silencio = a.daysSilent == null ? 50 : Math.max(0, 100 - (Math.min(a.daysSilent, 30) / 30) * 100);
  return [
    { label: 'Intención', corto: 'INT', valor: a.intentScore, crudo: String(a.intentScore) },
    { label: 'Prioridad', corto: 'PRI', valor: a.priorityScore, crudo: fmtInt(a.priorityScore) },
    { label: 'Probabilidad', corto: 'PRO', valor: a.recoveryProbability, crudo: `${Math.round(a.recoveryProbability)} %` },
    { label: 'Confianza', corto: 'CNF', valor: a.confidence, crudo: String(a.confidence) },
    { label: 'Temperatura', corto: 'TMP', valor: temperatura, crudo: a.temperature },
    { label: 'Actividad', corto: 'ACT', valor: silencio, crudo: a.daysSilent == null ? 'sin dato' : `${a.daysSilent} d` },
  ];
}

const norm = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);

/**
 * Gráfico de radar del contacto, dibujado en SVG.
 *
 * Sin librería: son seis puntos y dos polígonos, y cualquier paquete de charts
 * pesa más que toda la ficha. Usa `currentColor` para el trazo, así hereda el
 * color del contenedor y funciona igual en claro y en oscuro.
 */
export function ScoreRadar({ ejes, size = 168, className }: { ejes: EjeRadar[]; size?: number; className?: string }) {
  const centro = size / 2;
  const radio = centro - 26;

  const puntos = useMemo(() => {
    const n = Math.max(1, ejes.length);
    return ejes.map((eje, i) => {
      // Arranca arriba (-90°) y gira en sentido horario, como se lee un reloj.
      const angulo = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (norm(eje.valor) / 100) * radio;
      return {
        eje,
        x: centro + Math.cos(angulo) * r,
        y: centro + Math.sin(angulo) * r,
        bordeX: centro + Math.cos(angulo) * radio,
        bordeY: centro + Math.sin(angulo) * radio,
        etiquetaX: centro + Math.cos(angulo) * (radio + 14),
        etiquetaY: centro + Math.sin(angulo) * (radio + 14),
      };
    });
  }, [ejes, centro, radio]);

  const poligono = puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const marco = puntos.map((p) => `${p.bordeX.toFixed(1)},${p.bordeY.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn('text-primary', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Radar del contacto: ${ejes.map((e) => `${e.label} ${e.crudo}`).join(', ')}`}
    >
      {[0.33, 0.66, 1].map((escala) => (
        <polygon
          key={escala}
          points={puntos
            .map((p) => `${(centro + (p.bordeX - centro) * escala).toFixed(1)},${(centro + (p.bordeY - centro) * escala).toFixed(1)}`)
            .join(' ')}
          className="fill-none stroke-border"
          strokeWidth="1"
        />
      ))}
      <polygon points={marco} className="fill-none stroke-border" strokeWidth="1" />
      {puntos.map((p) => (
        <line key={p.eje.label} x1={centro} y1={centro} x2={p.bordeX} y2={p.bordeY} className="stroke-border" strokeWidth="1" />
      ))}

      <polygon points={poligono} className="fill-current stroke-current" fillOpacity={0.18} strokeWidth="2" strokeLinejoin="round" />
      {puntos.map((p) => (
        <circle key={`pt-${p.eje.label}`} cx={p.x} cy={p.y} r="2.5" className="fill-current" />
      ))}

      {puntos.map((p) => (
        <text
          key={`tx-${p.eje.label}`}
          x={p.etiquetaX}
          y={p.etiquetaY}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-muted-foreground text-[8px] font-bold"
        >
          {p.eje.corto}
        </text>
      ))}
    </svg>
  );
}
