'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Menu, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Skill } from '../../shared/skills';
import { SALES_OPS_API, fetcher } from '../components/format';
import { ErrorState } from '../components/States';
import { LimiteDeError } from '../focus/LimiteDeError';
import { ExperimentosView } from '../views/ExperimentosView';
import { Actividad } from '../skills/Actividad';
import { SkillEditor } from '../skills/SkillEditor';
import { SkillLauncher } from '../skills/SkillLauncher';
import { duplicateSkill as duplicateSkillApi, pinSkill, retireSkillByKey, type SkillRun, type SkillsPayload } from '../skills/api';
import { BibliotecaView } from './BibliotecaView';
import { ComponerView } from './ComponerView';
import { StudioSidebar, type StudioUser } from './StudioSidebar';
import { SystemPromptsView, type SystemPromptsPayload } from './SystemPromptsView';
import { SECCIONES, SECCION_BAJADAS, SECCION_ICONS, SECCION_LABELS, isSeccion, type Seccion } from './secciones';

/**
 * Prompt Studio: aplicación aparte.
 *
 * Salió del Command Center —donde era una vista más del rail, entre listas de
 * trabajo— porque no es un lugar al que se entra a operar clientes: es donde se
 * escriben y se prueban las skills del equipo. Mezclado con Dinero y Cola,
 * competía por un renglón del menú con cosas que se miran todos los días.
 *
 * Vive en `/plugins/sales-ops/studio` y toma la pantalla completa: usa las
 * mismas rutas y permisos del plugin `sales-ops` (las skills son del Command
 * Center, no de otra base), pero con shell, navegación y piel propios. La
 * sección viaja en `?s=` y la skill abierta en `?skill=`, así se comparte un
 * enlace a lo que uno está mirando.
 */
export function StudioApp({ slug }: { slug: string[] }) {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-[#0d090f]" />}>
      <LimiteDeError nombre="Prompt Studio">
        <StudioShell slug={slug} />
      </LimiteDeError>
    </Suspense>
  );
}

function StudioShell({ slug }: { slug: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seccion: Seccion = useMemo(() => {
    const fromQuery = searchParams.get('s');
    if (isSeccion(fromQuery)) return fromQuery;
    // `/plugins/sales-ops/studio/componer` también entra: el slug es la forma
    // en que se comparte un enlace a mano.
    const fromSlug = slug?.[1];
    if (isSeccion(fromSlug)) return fromSlug;
    return 'biblioteca';
  }, [searchParams, slug]);

  const skillKey = searchParams.get('skill');
  const moduleId = searchParams.get('modulo');
  const systemPromptKey = searchParams.get('prompt');

  const [drawer, setDrawer] = useState(false);
  const [launching, setLaunching] = useState<Skill | null>(null);
  const [editing, setEditing] = useState<Skill | null | 'new'>(null);

  // Cabina oscura, como la maqueta. La clase va en el <html> y no sólo en el
  // contenedor porque los modales, desplegables y avisos se montan en <body>:
  // sin esto, un Select del formulario saldría con la paleta del tema normal
  // encima de la app rosa. Al salir se restaura lo que había.
  useEffect(() => {
    const root = document.documentElement;
    const teniaDark = root.classList.contains('dark');
    root.classList.add('dark', 'prompt-studio');
    const anterior = document.title;
    document.title = 'Prompt Studio — WhatsPro';
    return () => {
      root.classList.remove('prompt-studio');
      if (!teniaDark) root.classList.remove('dark');
      document.title = anterior;
    };
  }, []);

  const { data, isLoading, error, mutate } = useSWR<SkillsPayload>(`${SALES_OPS_API}/prompts`, fetcher);
  const systemPrompts = useSWR<SystemPromptsPayload>(`${SALES_OPS_API}/prompts/system`, fetcher);
  const runs = useSWR<{ runs: SkillRun[] }>(`${SALES_OPS_API}/prompts/queue?status=all`, fetcher, { refreshInterval: 30_000 });
  const { data: user } = useSWR<StudioUser>('/api/user', fetcher);

  const skills = useMemo(() => data?.skills ?? [], [data?.skills]);
  const todasLasCorridas = useMemo(() => runs.data?.runs ?? [], [runs.data?.runs]);
  const abiertas = useMemo(() => todasLasCorridas.filter((r) => r.status === 'queued' || r.status === 'in_progress'), [todasLasCorridas]);

  const seleccionada = useMemo(() => skills.find((s) => s.key === skillKey) ?? null, [skills, skillKey]);

  /** Fijadas primero y después las últimas usadas: es lo que se vuelve a abrir. */
  const atajos = useMemo(() => {
    const fijadas = skills.filter((s) => s.pinned);
    const recientes = skills
      .filter((s) => !s.pinned && s.lastUsedAt)
      .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))
      .slice(0, 6);
    return [...fijadas, ...recientes];
  }, [skills]);

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const onNav = useCallback(
    (s: Seccion) => {
      setDrawer(false);
      setParams({ s: s === 'biblioteca' ? null : s });
    },
    [setParams],
  );

  /** Abrir una skill en Componer: cambia sección y skill de una. */
  const abrirEnComponer = useCallback(
    (skill: Skill) => {
      setDrawer(false);
      setParams({ s: 'componer', skill: skill.key });
    },
    [setParams],
  );

  const refrescar = useCallback(() => {
    void mutate();
    void systemPrompts.mutate();
    void runs.mutate();
  }, [mutate, runs, systemPrompts]);

  const elegirModulo = useCallback((nextModule: string) => {
    setDrawer(false);
    setParams({ s: 'sistema', modulo: nextModule, prompt: null });
  }, [setParams]);

  const elegirSystemPrompt = useCallback((key: string) => setParams({ s: 'sistema', prompt: key }), [setParams]);

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
      // La retirada podía ser la que estaba abierta en Componer: dejarla en la
      // URL mostraría una skill que ya no existe.
      if (seleccionada?.key === skill.key) setParams({ skill: null });
      toast.success('Skill retirada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo retirar.');
    }
  };

  const sidebarProps = {
    seccion,
    atajos,
    skillActiva: seleccionada?.id ?? null,
    user: user ?? null,
    onNav,
    onNuevaSkill: () => {
      setDrawer(false);
      setEditing('new');
    },
    onElegirSkill: abrirEnComponer,
    modules: systemPrompts.data?.modules ?? [],
    moduleId,
    onElegirModulo: elegirModulo,
  };

  const contenido = (() => {
    if (error) return <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />;
    if (seccion === 'componer') {
      return (
        <ComponerView
          skills={skills}
          seleccionada={seleccionada}
          onSeleccionar={(skill) => setParams({ skill: skill.key })}
          onEditar={(skill) => setEditing(skill)}
          onLanzada={refrescar}
        />
      );
    }
    if (seccion === 'sistema') {
      if (systemPrompts.error) return <ErrorState message={String(systemPrompts.error.message ?? systemPrompts.error)} onRetry={() => void systemPrompts.mutate()} />;
      return (
        <SystemPromptsView
          data={systemPrompts.data}
          isLoading={systemPrompts.isLoading}
          moduleId={moduleId}
          promptKey={systemPromptKey}
          onSelectModule={elegirModulo}
          onSelectPrompt={elegirSystemPrompt}
          onSaved={systemPrompts.mutate}
        />
      );
    }
    if (seccion === 'actividad') {
      // Abrir un contacto lleva al Command Center: la ficha vive allá, y
      // duplicarla acá sería mantener dos.
      return <Actividad runs={todasLasCorridas} onOpen={(chatId) => router.push(`/plugins/sales-ops?chat=${chatId}`)} onChanged={refrescar} />;
    }
    if (seccion === 'experimentos') return <ExperimentosView />;
    return (
      <BibliotecaView
        data={data}
        isLoading={isLoading}
        enCola={abiertas.length}
        onLaunch={setLaunching}
        onComponer={abrirEnComponer}
        onEdit={(skill) => setEditing(skill)}
        onDuplicate={(skill) => void onDuplicate(skill)}
        onPin={(skill) => void onPin(skill)}
        onRetire={(skill) => void onRetire(skill)}
        onNueva={() => setEditing('new')}
      />
    );
  })();

  const Icono = SECCION_ICONS[seccion];

  return (
    <div className="prompt-studio flex h-screen w-full overflow-hidden bg-background text-foreground">
      <StudioSidebar {...sidebarProps} className="hidden lg:flex" />

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[252px] p-0 sm:max-w-[252px] lg:hidden">
          <SheetTitle className="sr-only">Navegación del Prompt Studio</SheetTitle>
          <StudioSidebar {...sidebarProps} className="w-full border-r-0" />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--ps-line)] bg-[rgba(18,12,22,0.6)] px-3 py-2 lg:px-6 lg:py-3">
          <Button variant="ghost" size="icon" className="size-8 lg:hidden" onClick={() => setDrawer(true)} aria-label="Menú">
            <Menu className="size-5" />
          </Button>
          <Icono className="hidden size-4 shrink-0 text-[var(--ps-accent-soft)] lg:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight lg:text-lg">{SECCION_LABELS[seccion]}</h1>
            <p className="truncate text-[11px] text-muted-foreground lg:text-xs">{SECCION_BAJADAS[seccion]}</p>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={refrescar} title="Recargar skills y corridas" aria-label="Recargar">
            <RefreshCw className={cn('size-4', (isLoading || runs.isLoading) && 'animate-spin')} />
          </Button>
          {seccion !== 'sistema' && <Button size="sm" className="h-9 shrink-0 gap-1.5 rounded-xl px-3 font-semibold" onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Nueva skill</span>
            </Button>}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:py-5 lg:pb-8">
          <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col">{contenido}</div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--ps-line)] bg-[var(--ps-shell)] pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Secciones">
        {SECCIONES.map((s) => {
          const Icon = SECCION_ICONS[s];
          const active = seccion === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onNav(s)}
              aria-current={active ? 'page' : undefined}
              className={cn('flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium', active ? 'text-[var(--ps-accent-soft)]' : 'text-muted-foreground')}
            >
              <Icon className="size-5" aria-hidden />
              {SECCION_LABELS[s]}
            </button>
          );
        })}
      </nav>

      {launching && (
        <SkillLauncher key={launching.id} skill={launching} target={{ kind: 'team' }} open onOpenChange={(o) => !o && setLaunching(null)} onLaunched={refrescar} />
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
