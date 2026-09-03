'use client';

import {
  Boxes,
  Briefcase,
  Building2,
  Factory,
  Globe,
  Heart,
  Laptop,
  Rocket,
  Sparkles,
  Star,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { cn } from '@/lib/utils';
import { ES } from '../i18n/es';

export type EspacioIcono = {
  id: number;
  name: string;
  color?: string | null;
  icon?: string | null;
  proyectos: number;
};

const FALLBACK_ICONS: LucideIcon[] = [
  Briefcase, Building2, Store, Users, Factory, Laptop, Sparkles, Globe, Boxes, Rocket, Heart, Star,
];

const FALLBACK_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#f43f5e', '#06b6d4', '#8b5cf6', '#f97316', '#3b82f6',
];

export function iconoDeEspacio(espacio: EspacioIcono) {
  return resolveTaskIcon(espacio.icon) ?? FALLBACK_ICONS[Math.abs(espacio.id) % FALLBACK_ICONS.length];
}

export function colorDeEspacio(espacio: EspacioIcono) {
  return espacio.color || FALLBACK_COLORS[Math.abs(espacio.id) % FALLBACK_COLORS.length];
}

export function IconosEspacios(props: {
  espacios: EspacioIcono[];
  activoId: number | null;
  onElegir: (id: number | null) => void;
  variant?: 'os' | 'dashboard';
}) {
  const os = props.variant !== 'dashboard';

  return (
    <div className={cn(
      'grid gap-x-5 gap-y-6',
      os
        ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 max-w-5xl'
        : 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8',
    )}>
      <button
        type="button"
        onClick={() => props.onElegir(null)}
        className="group flex flex-col items-center gap-2.5 text-center"
      >
        <span
          className={cn(
            'rounded-[1.35rem] flex items-center justify-center text-white shadow-xl transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-95',
            os ? 'w-16 h-16' : 'w-14 h-14',
            props.activoId == null && (os
              ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent'
              : 'ring-2 ring-[var(--tareas-accent)] ring-offset-2 ring-offset-[var(--t-bg)]'),
          )}
          style={{ background: 'linear-gradient(145deg, #64748b, #1e293b)' }}
        >
          <Boxes className={os ? 'w-7 h-7' : 'w-6 h-6'} />
        </span>
        <span className={cn(
          'block text-sm font-bold whitespace-normal break-words leading-tight max-w-[8.5rem]',
          os ? 'text-white' : 'text-[var(--t-text)]',
        )}>
          {ES.metricas.todosLosEspacios}
        </span>
      </button>
      {props.espacios.map((espacio) => {
        const Icon = iconoDeEspacio(espacio);
        const color = colorDeEspacio(espacio);
        const activo = props.activoId === espacio.id;
        return (
          <button
            key={espacio.id}
            type="button"
            onClick={() => props.onElegir(espacio.id)}
            className="group flex flex-col items-center gap-2.5 text-center"
          >
            <span
              className={cn(
                'rounded-[1.35rem] flex items-center justify-center text-white shadow-xl transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-95',
                os ? 'w-16 h-16' : 'w-14 h-14',
                activo && (os
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent'
                  : 'ring-2 ring-[var(--tareas-accent)] ring-offset-2 ring-offset-[var(--t-bg)]'),
              )}
              style={{
                background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 55%, #0f172a))`,
                boxShadow: `0 18px 30px -12px ${color}`,
              }}
            >
              <Icon className={os ? 'w-7 h-7' : 'w-6 h-6'} />
            </span>
            <span className="min-w-0">
              <span className={cn(
                'block text-sm font-bold whitespace-normal break-words leading-tight max-w-[8.5rem]',
                os ? 'text-white' : 'text-[var(--t-text)]',
              )}>
                {espacio.name}
              </span>
              <span className={cn('block text-[11px]', os ? 'text-white/50' : 'text-[var(--t-muted)]')}>
                {espacio.proyectos}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
