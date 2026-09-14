'use client';

import { AlertCircle, Bot, Calendar, CheckCircle, Clock, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import type { NavId } from '../data/tipos';
import { ES } from '../i18n/es';

const ITEMS: Array<{
  id: Extract<NavId, 'bandeja' | 'hoy' | 'proximas' | 'vencidas' | 'completadas' | 'enCola'>;
  label: string;
  icon: typeof Inbox;
  danger?: boolean;
  badge?: 'bandeja' | 'vencidas' | 'enCola';
}> = [
  { id: 'bandeja', label: ES.nav.bandeja, icon: Inbox, badge: 'bandeja' },
  { id: 'hoy', label: ES.nav.hoy, icon: Calendar },
  { id: 'proximas', label: ES.nav.proximas, icon: Clock },
  { id: 'vencidas', label: ES.nav.vencidas, icon: AlertCircle, danger: true, badge: 'vencidas' },
  { id: 'enCola', label: ES.nav.enCola, icon: Bot, badge: 'enCola' },
  { id: 'completadas', label: ES.nav.completadas, icon: CheckCircle },
];

export function FiltrosSistema(props: {
  nav: NavId;
  onNav: (nav: NavId) => void;
  contadores: { bandeja: number; vencidas: number; enCola: number };
}) {
  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ITEMS.map((item) => {
        const active = props.nav === item.id;
        const Icon = item.icon;
        const badge = item.badge ? props.contadores[item.badge] : 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => props.onNav(item.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative shrink-0 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all duration-200',
              active ? 'border-[color-mix(in_srgb,var(--tareas-accent)_28%,transparent)] shadow-sm' : 'border-transparent',
              active ? C.navActive : C.navIdle,
              item.danger && !active && 'text-rose-500',
            )}
          >
            <Icon className={cn('w-4 h-4', active && 'text-[var(--tareas-accent)]', item.danger && !active && 'text-rose-500')} />
            {item.label}
            {badge > 0 && <span className={C.badge}>{badge}</span>}
            {active && <span className="absolute inset-x-3 -bottom-[5px] h-0.5 rounded-full bg-[var(--tareas-accent)]" aria-hidden />}
          </button>
        );
      })}
    </nav>
  );
}
