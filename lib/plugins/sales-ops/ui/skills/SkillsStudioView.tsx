'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { FlaskConical, Inbox, Plus, Repeat, Search, Sparkles, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Skill, SkillCategory } from '../../shared/skills';
import { SALES_OPS_API, fetcher, fmtInt, tiempoRelativo } from '../components/format';
import { ErrorState } from '../components/States';
import { duplicateSkill as duplicateSkillApi, pinSkill, retireSkillByKey, type SkillRun, type SkillsPayload } from './api';
import { Actividad } from './Actividad';
import { SkillCard } from './SkillCard';
import { SkillEditor } from './SkillEditor';
import { SkillLauncher } from './SkillLauncher';
import { SKILL_TABS, SKILL_TAB_LABELS, type SkillTab } from './skill-meta';

type Props = {
  onOpen?: (chatId: number) => void;
  /** Navega a otra vista del Command Center (para el acceso a Experimentos). */
  onNav?: (vista: 'experimentos') => void;
};

/**
 * Prompt Studio: el gestor de skills del Command Center.
 *
 * La vista se organiza por la pregunta que trae quien entra: "¿qué puedo
 * lanzar ahora?". Por eso arriba están las **rutinas** —lo que un conector
 * corre de forma recurrente— separadas de las **acciones puntuales**, y la
 * actividad (lo que se lanzó y qué contestó) va al final, no compitiendo por
 * el espacio de arriba.
 *
 * Todo lo que se puede hacer acá se puede hacer también por MCP con
 * `whatspro_sales_prompt_*`: la vista no es el único camino, es el cómodo.
 */
export function SkillsStudioView({ onOpen, onNav }: Props) {
  const { data, isLoading, error, mutate } = useSWR<SkillsPayload>(`${SALES_OPS_API}/prompts`, fetcher);
  const runs = useSWR<{ runs: SkillRun[] }>(`${SALES_OPS_API}/prompts/queue?status=all`, fetcher, { refreshInterval: 30_000 });

  const [tab, setTab] = useState<SkillTab>('todas');
  const [category, setCategory] = useState<SkillCategory | null>(null);
  const [query, setQuery] = useState('');
  const [launching, setLaunching] = useState<Skill | null>(null);
  const [editing, setEditing] = useState<Skill | null | 'new'>(null);

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

  const todasLasCorridas = runs.data?.runs ?? [];
  const abiertas = todasLasCorridas.filter((r) => r.status === 'queued' || r.status === 'in_progress');

  const refrescar = () => {
    void mutate();
    void runs.mutate();
  };

  const onPin = async (skill: Skill) => {
    try {
      await pinSkill(skill.id, !skill.pinned);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo fijar.');
    }
  };

  const onDuplicate = async (skill: Skill) => {
    try {
      const copia = await duplicateSkillApi(skill.id);
      await mutate();
      setEditing(copia);
      toast.success('Copia creada. Editala y guardá.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo duplicar.');
    }
  };

  const onRetire = async (skill: Skill) => {
    if (!window.confirm(`¿Retirar "${skill.title}"? Las corridas ya encoladas no se tocan.`)) return;
    try {
      await retireSkillByKey(skill.key);
      void mutate();
      toast.success('Skill retirada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo retirar.');
    }
  };

  if (error) return <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />;

  return (
    <div className="space-y-5">
      {/* Encabezado: qué es esto y el acceso a crear. */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/8 via-card to-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wand2 className="size-4" aria-hidden />
              </span>
              Skills del equipo
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Prompts guardados que cualquiera —o un conector— puede lanzar con un toque. Las <strong className="font-medium text-foreground">rutinas</strong> se corren de
              forma recurrente; las <strong className="font-medium text-foreground">puntuales</strong>, cuando alguien las pide. Se ejecutan con la IA del equipo o quedan en
              la cola de conectores.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Experimentos salió del rail: se llega desde acá, que es donde uno
                está cuando piensa en probar dos textos distintos. */}
            {onNav && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onNav('experimentos')}>
                <FlaskConical className="size-4" aria-hidden />
                <span className="hidden sm:inline">Experimentos A/B</span>
              </Button>
            )}
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden />
              Nueva skill
            </Button>
          </div>
        </div>

        {data && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Contador icon={Sparkles} label="Skills" value={data.counts.total} />
            <Contador icon={Repeat} label="Rutinas" value={data.counts.routines} />
            <Contador icon={SlidersIcon} label="Con formulario" value={data.counts.withVariables} />
            <Contador icon={Inbox} label="En cola" value={abiertas.length} />
          </div>
        )}
      </section>

      {/* Buscador + filtros. En móvil los chips scrollean en horizontal. */}
      <section className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar una skill…"
            className="h-10 pl-9 pr-9"
            aria-label="Buscar skills"
          />
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
          <p className="text-sm font-medium">
            {skills.length === 0 ? 'Todavía no hay skills' : 'Nada con esos filtros'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {skills.length === 0
              ? 'Una skill es un prompt guardado con nombre, formulario y motor. Creá la primera o sembrá las del doc 07 con el seed del Prompt Studio.'
              : 'Probá con otra categoría o borrá la búsqueda.'}
          </p>
          {skills.length === 0 && (
            <Button type="button" size="sm" className="mt-3 gap-1.5" onClick={() => setEditing('new')}>
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
          onLaunch={setLaunching}
          onEdit={setEditing}
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
          onLaunch={setLaunching}
          onEdit={setEditing}
          onDuplicate={onDuplicate}
          onPin={onPin}
          onRetire={onRetire}
        />
      )}

      <Actividad
        runs={todasLasCorridas}
        onOpen={onOpen}
        onChanged={() => {
          void runs.mutate();
          void mutate();
        }}
      />

      {launching && (
        <SkillLauncher
          key={launching.id}
          skill={launching}
          target={{ kind: 'team' }}
          open
          onOpenChange={(o) => !o && setLaunching(null)}
          onLaunched={refrescar}
        />
      )}

      {editing && (
        <SkillEditor
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
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
        active ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
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
            onEdit={() => onEdit(skill)}
            onDuplicate={() => void onDuplicate(skill)}
            onPin={() => void onPin(skill)}
            onRetire={() => void onRetire(skill)}
          />
        ))}
      </div>
    </section>
  );
}
