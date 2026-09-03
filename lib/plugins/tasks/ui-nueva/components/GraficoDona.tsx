'use client';

import { ES } from '../i18n/es';
import { PRIO_COLORES, type Prioridad } from '../data/tipos';

const R = 80;
const STROKE = 28;
const C = 2 * Math.PI * R;

export function GraficoDona(props: {
  valores: Record<Prioridad, number>;
  porcentajes: Record<Prioridad, number>;
  total: number;
}) {
  const order: Prioridad[] = ['alta', 'media', 'baja'];
  const sum = order.reduce((n, key) => n + props.valores[key], 0) || 1;
  let offset = 0;
  const segs = order.map((key) => {
    const len = (props.valores[key] / sum) * C;
    const seg = { key, len, offset };
    offset += len;
    return seg;
  });

  return (
    <div className="flex flex-col items-stretch gap-6">
      <div className="relative mx-auto" style={{ width: 220, height: 220 }}>
        <svg width={220} height={220} className="-rotate-90">
          <circle cx={110} cy={110} r={R} fill="none" stroke="currentColor" className="text-neutral-200" strokeWidth={STROKE} />
          {segs.map((seg) => (
            <circle
              key={seg.key}
              cx={110}
              cy={110}
              r={R}
              fill="none"
              stroke={PRIO_COLORES[seg.key]}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${seg.len} ${C - seg.len}`}
              strokeDashoffset={-seg.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-black text-[var(--t-text)]">{props.total}</div>
          <div className="text-[10px] uppercase font-black tracking-[0.2em] text-[var(--t-muted)] mt-1">
            {ES.metricas.total}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {order.map((key) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-[var(--t-text)]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: PRIO_COLORES[key] }} />
              {ES.prioridad[key]}
            </span>
            <span className="font-bold text-[var(--t-text)]">{props.porcentajes[key]}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
