'use client';

import { ArrowLeft, Braces, ListChecks, Plus, Radar, ScanSearch, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Skill } from '../../shared/skills';
import { iniciales } from '../components/format';
import { SKILL_ICON_COMPONENTS } from '../skills/skill-meta';
import { SECCIONES, SECCION_ICONS, SECCION_LABELS, type Seccion } from './secciones';
import type { SystemPromptModule } from './SystemPromptsView';

export type StudioUser = { name: string | null; email: string | null } | null;

type Props = {
  seccion: Seccion;
  /** Skills del acceso rápido: las fijadas primero y después las últimas usadas. */
  atajos: Skill[];
  skillActiva: number | null;
  user: StudioUser;
  onNav: (s: Seccion) => void;
  onNuevaSkill: () => void;
  onElegirSkill: (skill: Skill) => void;
  modules: SystemPromptModule[];
  moduleId: string | null;
  onElegirModulo: (moduleId: string) => void;
  className?: string;
};

/**
 * Rail del Prompt Studio.
 *
 * Copia la estructura de la maqueta: marca arriba, navegación, la acción que
 * crea (Nueva skill) separada por un aire, y debajo la lista de acceso rápido
 * —donde la maqueta pone el historial de conversaciones, acá van las skills
 * fijadas y las últimas usadas, que es lo que uno vuelve a abrir—. Abajo del
 * todo, la puerta a las otras aplicaciones: el Studio es una app aparte, y
 * salir no puede obligar a adivinar la URL.
 */
const MODULE_ICONS = { 'command-center': Radar, radar: ScanSearch, tasks: ListChecks } as const;

export function StudioSidebar({ seccion, atajos, skillActiva, user, onNav, onNuevaSkill, onElegirSkill, modules, moduleId, onElegirModulo, className }: Props) {
  return (
    <aside
      className={cn('flex h-full w-[252px] shrink-0 flex-col border-r border-[var(--ps-line)] bg-[var(--ps-shell)]', className)}
      aria-label="Navegación del Prompt Studio"
    >
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <span className="ps-brand grid size-8 shrink-0 place-items-center rounded-[10px] text-sm font-black text-white">
          <Wand2 className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-tight tracking-[0.16em]">PROMPT</span>
          <span className="block truncate text-[10px] leading-tight tracking-[0.1em] text-muted-foreground">STUDIO · WHATSPRO</span>
        </span>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {SECCIONES.map((s) => {
          const Icon = SECCION_ICONS[s];
          const active = seccion === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onNav(s)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold transition-colors',
                active
                  ? 'bg-[var(--ps-accent-wash)] text-[var(--ps-accent-soft)] shadow-[inset_0_0_0_1px_var(--ps-line-strong)]'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {SECCION_LABELS[s]}
            </button>
          );
        })}
      </nav>

      <div className="mx-3 mt-2 border-t border-[var(--ps-line)] pt-2" aria-label="Prompts internos por aplicación">
        {modules.map((module) => {
          const ModuleIcon = MODULE_ICONS[module.id as keyof typeof MODULE_ICONS] ?? Braces;
          const active = seccion === 'sistema' && moduleId === module.id;
          return (
            <button key={module.id} type="button" onClick={() => onElegirModulo(module.id)} aria-current={active ? 'page' : undefined} className={cn('flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold transition-colors', active ? 'bg-[var(--ps-accent-wash)] text-[var(--ps-accent-soft)] shadow-[inset_0_0_0_1px_var(--ps-line-strong)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground')}>
              <ModuleIcon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{module.label}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNuevaSkill}
        className="mx-3 mb-1.5 mt-3.5 flex items-center justify-center gap-2 rounded-[11px] border border-[var(--ps-line-strong)] bg-[var(--ps-accent-wash)] px-3 py-2.5 text-[13px] font-semibold text-[var(--ps-accent-soft)] transition-colors hover:bg-[rgba(244,63,142,0.2)] hover:text-white"
      >
        <Plus className="size-3.5" aria-hidden />
        Nueva skill
      </button>

      <p className="px-5 pb-1.5 pt-4 text-[10px] font-semibold tracking-[0.16em] text-[var(--ps-dim)]">ACCESO RÁPIDO</p>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {atajos.length === 0 && <p className="px-2 text-[11px] text-[var(--ps-dim)]">Fijá una skill y aparece acá.</p>}
        {atajos.map((skill) => {
          const Icon = SKILL_ICON_COMPONENTS[skill.icon];
          const active = skillActiva === skill.id;
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => onElegirSkill(skill)}
              title={skill.title}
              className={cn(
                'flex items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[12.5px] transition-colors',
                active ? 'bg-[var(--ps-accent-wash)] text-foreground' : 'text-muted-foreground hover:bg-white/5',
              )}
            >
              <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{skill.title}</span>
              {skill.variables.length > 0 && (
                <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--ps-dim)]">{skill.variables.length}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-auto space-y-1 border-t border-[var(--ps-line)] p-2">
        {/* Volver a las otras aplicaciones. El Studio se abre a pantalla
            completa y no tiene la barra de WhatsPro arriba: sin estos tres, la
            única salida sería el botón de atrás del navegador. */}
        <div className="grid grid-cols-3 gap-1">
          <a
            href="/apps"
            className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground"
            title="Volver al lanzador de aplicaciones"
          >
            <ArrowLeft className="size-[18px]" aria-hidden />
            WhatsPro
          </a>
          <a
            href="/plugins/sales-ops"
            className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground"
            title="Ir al Command Center comercial"
          >
            <Radar className="size-[18px]" aria-hidden />
            Command
          </a>
          <a
            href="/plugins/tasks"
            className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground"
            title="Ir a Tareas OS"
          >
            <ListChecks className="size-[18px]" aria-hidden />
            Tareas
          </a>
        </div>
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/5 text-[11px] font-semibold">{iniciales(user?.name || user?.email || '?')}</span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">{user?.name || user?.email || '—'}</span>
            <span className="block truncate text-[10px] text-[var(--ps-dim)]">Skills del equipo</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
