'use client';

import { useMemo, useState } from 'react';
import { Inbox, Plus, Repeat, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Skill, SkillCategory } from '../../shared/skills';
import { fmtInt } from '../components/format';
import { SkillCard } from '../skills/SkillCard';
import { SKILL_TABS, SKILL_TAB_LABELS, type SkillTab } from '../skills/skill-meta';
import type { SkillsPayload } from '../skills/api';

type Props = {
  data: SkillsPayload | undefined;
  isLoading: boolean;
  /** Corridas abiertas, para el contador "En cola". */
  enCola: number;
  onLaunch: (skill: Skill) => void;
  onComponer: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  onDuplicate: (skill: Skill) => void;
  onPin: (skill: Skill) => void;
  onRetire: (skill: Skill) => void;
  onNueva: () => void;
};

/**
 * Biblioteca: la galería de skills del equipo.
 *
 * Es la vista que traía el Prompt Studio cuando vivía dentro del Command
 * Center, con dos cambios. El encabezado explicativo se fue al shell de la app
 * —una app no se presenta a sí misma en cada pantalla— y la actividad pasó a
 * ser su propia sección, así la galería no compite por el alto con una lista
 * de corridas que se mira en otro momento.
 *
 * El corte sigue siendo el mismo: **rutinas** arriba (lo que un conector corre
 * solo) y **puntuales** abajo (lo que alguien pide).
 */
export function BibliotecaView({ data, isLoading, enCola, onLaunch, onComponer, onEdit, onDuplicate, onPin, onRetire, onNueva }: Props) {
  const [tab, setTab] = useState<SkillTab>('todas');
  const [category, setCategory] = useState<SkillCategory | null>(null);
  const [query, setQuery] = useState('');

  const skills = useMemo(() => data?.skills ?? [], [data?.skills]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (tab === 'rutinas' && s.recurrence === 'on_demand') return false;
      if (tab === 'puntuales' && s.recurrence !== 'on_demand') return false;
      if (tab === 'fijadas' && !s.pinned) return false;
      if (category && s.category !== category) return false;
      if (q && !`${s.title} ${s.description ?? ''} ${s.key} ${s.text}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [skills, tab, category, query]);

  const rutinas = visibles.filter((s) => s.recurrence !== 'on_demand');
  const puntuales = visibles.filter((s) => s.recurrence === 'on_demand');

  return (
    <div className="space-y-5">
      {data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Contador icon={Sparkles} label="Skills" value={data.counts.total} />
          <Contador icon={Repeat} label="Rutinas" value={data.counts.routines} />
          <Contador icon={SlidersIcon} label="Con formulario" value={data.counts.withVariables} />
          <Contador icon={Inbox} label="En cola" value={enCola} />
        </div>
      )}

      <section className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar una skill…" className="h-10 pl-9 pr-9" aria-label="Buscar skills" />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Limpiar búsqueda">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        <div className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SKILL_TABS.map((t) => (
            <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
              {SKILL_TAB_LABELS[t]}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
          <Chip active={category === null} onClick={() => setCategory(null)}>
            Todas las categorías
          </Chip>
          {(data?.categories ?? []).map((c) => (
            <Chip key={c.category} active={category === c.category} onClick={() => setCategory(category === c.category ? null : c.category)}>
              {c.label} <span className="tabular-nums opacity-60">{c.count}</span>
            </Chip>
          ))}
        </div>
      </section>

      {isLoading && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && visibles.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">{skills.length === 0 ? 'Todavía no hay skills' : 'Nada con esos filtros'}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {skills.length === 0
              ? 'Una skill es un prompt guardado con nombre, formulario y motor. Creá la primera o sembrá las del doc 07 con el seed del Prompt Studio.'
              : 'Probá con otra categoría o borrá la búsqueda.'}
          </p>
          {skills.length === 0 && (
            <Button type="button" size="sm" className="mt-3 gap-1.5" onClick={onNueva}>
              <Plus className="size-4" aria-hidden />
              Crear la primera
            </Button>
          )}
        </div>
      )}

      {rutinas.length > 0 && (
        <Grupo
          titulo="Rutinas"
          icon={Repeat}
          descripcion="Recurrentes: un conector las puede correr solo cada vez que trabaja."
          skills={rutinas}
          onLaunch={onLaunch}
          onComponer={onComponer}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onPin={onPin}
          onRetire={onRetire}
        />
      )}

      {puntuales.length > 0 && (
        <Grupo
          titulo="Acciones puntuales"
          icon={Sparkles}
          descripcion="Se lanzan cuando alguien las pide, sobre el equipo o sobre un chat."
          skills={puntuales}
          onLaunch={onLaunch}
          onComponer={onComponer}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onPin={onPin}
          onRetire={onRetire}
        />
      )}
    </div>
  );
}

/** Ícono propio del contador "con formulario": no hay uno en el mapa de skills. */
function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h6" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="12" cy="18" r="2" />
    </svg>
  );
}

function Contador({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums leading-none">{fmtInt(value)}</p>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors',
        active ? 'border-[var(--ps-line-strong)] bg-[var(--ps-accent-wash)] font-medium text-[var(--ps-accent-soft)]' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Grupo({
  titulo,
  icon: Icon,
  descripcion,
  skills,
  onLaunch,
  onComponer,
  onEdit,
  onDuplicate,
  onPin,
  onRetire,
}: {
  titulo: string;
  icon: React.ComponentType<{ className?: string }>;
  descripcion: string;
  skills: Skill[];
  onLaunch: (skill: Skill) => void;
  onComponer: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  onDuplicate: (skill: Skill) => void;
  onPin: (skill: Skill) => void;
  onRetire: (skill: Skill) => void;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" />
          {titulo}
          <span className="font-normal tabular-nums">({skills.length})</span>
        </h2>
        <p className="text-[11px] text-muted-foreground">{descripcion}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {skills.map((skill) => (
          <SkillCard
            key={skill.key}
            skill={skill}
            onLaunch={() => onLaunch(skill)}
            onCompose={() => onComponer(skill)}
            onEdit={() => onEdit(skill)}
            onDuplicate={() => onDuplicate(skill)}
            onPin={() => onPin(skill)}
            onRetire={() => onRetire(skill)}
          />
        ))}
      </div>
    </section>
  );
}
