'use client';

import { useEffect, useRef } from 'react';

/**
 * Confeti de fin de etapa, dibujado a mano en un canvas.
 *
 * Sin librería, por el mismo criterio que `ScoreRadar`: son 140 rectángulos con
 * gravedad y cualquier paquete de confeti pesa más que toda la vista. Se dibuja
 * encima de todo pero no recibe clics (`pointer-events-none`): la persona puede
 * seguir trabajando mientras cae.
 *
 * Respeta `prefers-reduced-motion`: quien pidió que no se muevan las cosas no
 * recibe una lluvia de papelitos en la cara.
 */

const COLORES = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#eab308'];
const CANTIDAD = 140;
const DURACION_MS = 2800;

type Papelito = { x: number; y: number; vx: number; vy: number; giro: number; vGiro: number; ancho: number; alto: number; color: string };

export function Confeti({ activo }: { activo: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!activo) return;
    const canvas = ref.current;
    if (!canvas) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ancho = window.innerWidth;
    const alto = window.innerHeight;
    canvas.width = ancho * dpr;
    canvas.height = alto * dpr;
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${alto}px`;
    ctx.scale(dpr, dpr);

    const papelitos: Papelito[] = Array.from({ length: CANTIDAD }, () => ({
      // Salen de los dos costados hacia el centro: cae desde arriba parece
      // lluvia, y esto parece una celebración.
      x: ancho * (Math.random() < 0.5 ? 0.08 : 0.92) + (Math.random() - 0.5) * 80,
      y: alto * 0.45 + (Math.random() - 0.5) * 120,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 13 - 4,
      giro: Math.random() * Math.PI,
      vGiro: (Math.random() - 0.5) * 0.35,
      ancho: 5 + Math.random() * 6,
      alto: 3 + Math.random() * 5,
      color: COLORES[Math.floor(Math.random() * COLORES.length)],
    }));

    const inicio = performance.now();
    let frame = 0;

    const dibujar = (t: number) => {
      const transcurrido = t - inicio;
      if (transcurrido > DURACION_MS) {
        ctx.clearRect(0, 0, ancho, alto);
        return;
      }
      const opacidad = transcurrido > DURACION_MS * 0.6 ? 1 - (transcurrido - DURACION_MS * 0.6) / (DURACION_MS * 0.4) : 1;
      ctx.clearRect(0, 0, ancho, alto);
      ctx.globalAlpha = Math.max(0, opacidad);
      for (const p of papelitos) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.giro += p.vGiro;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto);
        ctx.restore();
      }
      frame = window.requestAnimationFrame(dibujar);
    };

    frame = window.requestAnimationFrame(dibujar);
    return () => window.cancelAnimationFrame(frame);
  }, [activo]);

  if (!activo) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[70]" />;
}
