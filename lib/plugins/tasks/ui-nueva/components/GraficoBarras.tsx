'use client';

export function GraficoBarras(props: { puntos: { label: string; valor: number }[] }) {
  const max = Math.max(4, ...props.puntos.map((p) => p.valor));
  const ticks = [0, 1, 2, 3, 4].map((n) => Math.round((n / 4) * max));
  const uniqueTicks = Array.from(new Set(ticks));
  const w = 520;
  const h = 220;
  const padL = 28;
  const padB = 28;
  const padT = 8;
  const innerW = w - padL - 8;
  const innerH = h - padB - padT;
  const barW = innerW / props.puntos.length * 0.55;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-56">
      {uniqueTicks.map((tick) => {
        const y = padT + innerH - (tick / max) * innerH;
        return (
          <g key={tick}>
            <line
              x1={padL}
              x2={w - 8}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-neutral-200"
              strokeDasharray="4 6"
            />
            <text x={0} y={y + 4} className="fill-[var(--t-muted)]" fontSize="10" fontWeight="700">
              {tick}
            </text>
          </g>
        );
      })}
      {props.puntos.map((punto, i) => {
        const x = padL + (i + 0.5) * (innerW / props.puntos.length) - barW / 2;
        const bh = (punto.valor / max) * innerH;
        const y = padT + innerH - bh;
        return (
          <g key={punto.label}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(bh, 0)}
              rx={8}
              fill="var(--tareas-accent)"
            />
            <text
              x={x + barW / 2}
              y={h - 8}
              textAnchor="middle"
              className="fill-[var(--t-muted)]"
              fontSize="11"
              fontWeight="700"
            >
              {punto.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
