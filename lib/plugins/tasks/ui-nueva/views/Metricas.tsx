'use client';

import { AlertTriangle, BarChart, CheckCircle, PieChart, Target, TrendingUp, Zap } from 'lucide-react';
import { C } from '../data/clases';
import { GraficoBarras } from '../components/GraficoBarras';
import { GraficoDona } from '../components/GraficoDona';
import type { Metricas as MetricasData } from '../data/metricas';
import { ES } from '../i18n/es';

export function Metricas(props: {
  data: MetricasData;
  workspaces: { id: number; name: string }[];
  workspaceId: number | null;
  onWorkspace: (id: number | null) => void;
}) {
  const kpis = [
    { label: ES.metricas.racha, value: String(props.data.racha), icon: Zap, bg: 'bg-amber-100 text-amber-500' },
    { label: ES.metricas.completadas, value: String(props.data.completadas), icon: CheckCircle, bg: 'bg-indigo-100 text-indigo-500' },
    { label: ES.metricas.eficiencia, value: `${props.data.eficiencia}%`, icon: TrendingUp, bg: 'bg-emerald-100 text-emerald-500' },
    { label: ES.metricas.vencidas, value: String(props.data.vencidas), icon: AlertTriangle, bg: 'bg-rose-100 text-rose-500' },
  ];

  return (
    <div className="space-y-6 pb-32">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[var(--t-text)]">{ES.metricas.titulo}</h1>
          <p className="text-[var(--t-text-secondary)] mt-1">{ES.metricas.bajada}</p>
        </div>
        <select
          value={props.workspaceId ?? ''}
          onChange={(event) => props.onWorkspace(event.target.value ? Number(event.target.value) : null)}
          className={C.chip}
        >
          <option value="">{ES.metricas.todosLosEspacios}</option>
          {props.workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${C.card} p-6 flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${kpi.bg}`}>
              <kpi.icon className="w-5 h-5" />
            </div>
            <div>
              <div className={C.rotulo}>{kpi.label}</div>
              <div className="text-3xl font-black text-[var(--t-text)]">{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${C.card} p-8 lg:col-span-2`}>
          <div className="flex items-start justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--t-text)]">
              <BarChart className="w-5 h-5 text-[var(--tareas-accent)]" />
              {ES.metricas.velocidad}
            </h2>
            <div className="text-right">
              <div className={C.rotulo}>{ES.metricas.promedioDiario}</div>
              <div className="text-[var(--tareas-accent)] font-black">{ES.contadores.tareas(props.data.promedioDiario)}</div>
            </div>
          </div>
          <div className="mt-6">
            <GraficoBarras puntos={props.data.velocidad} />
          </div>
        </div>
        <div className={`${C.card} p-8`}>
          <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--t-text)] mb-4">
            <PieChart className="w-5 h-5 text-[var(--tareas-accent)]" />
            {ES.metricas.mezcla}
          </h2>
          <GraficoDona
            valores={props.data.mezcla}
            porcentajes={props.data.mezclaPct}
            total={props.data.totalActivas}
          />
        </div>
      </div>

      <div className="bg-[var(--tareas-accent)] text-white rounded-3xl p-8 flex items-center gap-6">
        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
          <Target className="w-6 h-6" />
        </div>
        <div>
          <div className="text-[10px] uppercase font-black tracking-[0.2em] opacity-80">{ES.metricas.pico}</div>
          <div className="text-3xl font-black capitalize">{props.data.pico}</div>
          <div className="text-sm font-bold opacity-90 mt-1">{ES.metricas.picoBajada}</div>
        </div>
      </div>
    </div>
  );
}
