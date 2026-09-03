'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  BellRing,
  GanttChartSquare,
  Grid3x3,
  LayoutList,
  ListChecks,
  Menu,
  Moon,
  Radar,
  Search,
  Sun,
  Sunrise,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster, toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EVENT_KINDS, KIND_META, type EventoRow } from '../shared/tipos';
import { C } from './data/clases';
import { KIND_ICON } from './data/iconos';
import { editarEvento } from './data/api';
import { claveDia, etiquetaLarga, finDelDia, inicioDelDia, lunesDe, mesLargo, sumarDias } from './data/fechas';
import { escribirPrefs, leerPrefs, type PrefsCalendario } from './data/preferencias';
import { VISTA_LABELS, type VistaCalendario } from './data/tipos-ui';
import { ModalEvento, type BorradorEvento } from './components/ModalEvento';
import { VistaAgenda } from './views/VistaAgenda';
import { VistaGantt } from './views/VistaGantt';
import { PanelAvisos } from './views/PanelAvisos';
import { VistaAno } from './views/VistaAno';
import { VistaDia } from './views/VistaDia';
import { VistaMes } from './views/VistaMes';
import { VistaSemana } from './views/VistaSemana';
import './calendario.css';

const ICONOS: Record<VistaCalendario, LucideIcon> = {
  hoy: Sun,
  manana: Sunrise,
  pasado: CalendarPlus,
  semana: CalendarRange,
  mes: CalendarDays,
  ano: Grid3x3,
  agenda: LayoutList,
  gantt: GanttChartSquare,
  avisos: BellRing,
};

/** Rango que hay que pedirle al servidor para dibujar cada vista. */
function rangoDe(vista: VistaCalendario, ancla: Date): { from: Date; to: Date } {
  if (vista === 'hoy') return { from: inicioDelDia(ancla), to: finDelDia(ancla) };
  if (vista === 'manana') return { from: inicioDelDia(sumarDias(ancla, 1)), to: finDelDia(sumarDias(ancla, 1)) };
  if (vista === 'pasado') return { from: inicioDelDia(sumarDias(ancla, 2)), to: finDelDia(sumarDias(ancla, 2)) };
  if (vista === 'semana') {
    const lunes = lunesDe(ancla);
    return { from: lunes, to: finDelDia(sumarDias(lunes, 6)) };
  }
  if (vista === 'mes') return { from: new Date(ancla.getFullYear(), ancla.getMonth(), 1), to: finDelDia(new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0)) };
  if (vista === 'ano') return { from: new Date(ancla.getFullYear(), 0, 1), to: finDelDia(new Date(ancla.getFullYear(), 11, 31)) };
  if (vista === 'gantt') {
    // La línea de tiempo se mira por semana: en un mes las barras quedan de un píxel.
    const lunes = lunesDe(ancla);
    return { from: lunes, to: finDelDia(sumarDias(lunes, 6)) };
  }
  // Agenda: de hoy hacia adelante, un mes y medio.
  return { from: inicioDelDia(ancla), to: finDelDia(sumarDias(ancla, 45)) };
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`))));

/**
 * Calendario: la app de eventos del equipo.
 *
 * Misma piel que Tareas OS (mismos tokens, mismo shell, mismo modal con pie
 * fijo) porque se usan a la par y cambiar de una a otra no debería sentirse
 * como cambiar de producto. Lo que cambia es la pregunta: acá es "cuándo", no
 * "qué falta".
 *
 * Las vistas son siete y todas leen el mismo endpoint con un rango distinto;
 * las repeticiones las expande el servidor, así que la UI no sabe nada de
 * recurrencias.
 */
export function CalendarioApp() {
  const team = useSWR<{ id: number } | null>('/api/team', fetcher);
  const user = useSWR<{ id: number; name?: string | null; email?: string | null } | null>('/api/user', fetcher);
  const teamId = team.data?.id ?? null;
  const userId = user.data?.id ?? null;

  const [prefs, setPrefsState] = useState<PrefsCalendario>(leerPrefs(null, null));
  useEffect(() => {
    if (!teamId || !userId) return;
    // `?panel=avisos` (lo usa la campana) gana sobre la vista guardada: si no,
    // al llegar las preferencias volvía a la última vista usada.
    const panel = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('panel') : null;
    const guardadas = leerPrefs(teamId, userId);
    setPrefsState(panel === 'avisos' ? { ...guardadas, vista: 'avisos' } : guardadas);
  }, [teamId, userId]);
  const setPrefs = useCallback(
    (patch: Partial<PrefsCalendario>) => {
      setPrefsState((prev) => {
        const next = { ...prev, ...patch };
        escribirPrefs(teamId, userId, next);
        return next;
      });
    },
    [teamId, userId],
  );

  /**
   * Tema: por defecto el mismo que WhatsPro (incluido "sistema" del sistema
   * operativo). El botón del pie lo fija sólo para el calendario, y volver a
   * "Automático" devuelve el control al tema global.
   */
  const { resolvedTheme } = useTheme();
  const [oscuroDoc, setOscuroDoc] = useState(false);
  useEffect(() => {
    // `resolvedTheme` llega vacío en el primer render y el usuario ve un
    // parpadeo en claro; la clase del <html> ya está puesta por el provider.
    const leer = () => setOscuroDoc(document.documentElement.classList.contains('dark'));
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const oscuro = montado && (prefs.tema === 'sistema' ? resolvedTheme === 'dark' || oscuroDoc : prefs.tema === 'oscuro');

  /**
   * La fecha y el tema se resuelven recién en el navegador: en el servidor no
   * existen ni la zona horaria del usuario ni su tema, y renderizar con los del
   * servidor rompía la hidratación (error 418) además de mostrar un parpadeo en
   * claro. Hasta que monta se dibuja el esqueleto.
   */
  const [ancla, setAncla] = useState<Date | null>(null);
  useEffect(() => setAncla(new Date()), []);
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState<BorradorEvento | null>(null);

  const { from, to } = useMemo(() => rangoDe(prefs.vista, ancla ?? new Date(0)), [prefs.vista, ancla]);
  const clave = useMemo(() => {
    const p = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    if (prefs.kinds.length) p.set('kinds', prefs.kinds.join(','));
    if (q.trim()) p.set('q', q.trim());
    if (prefs.soloMios && userId) p.set('userId', String(userId));
    return `/api/plugins/calendar/agenda?${p.toString()}`;
  }, [from, to, prefs.kinds, prefs.soloMios, q, userId]);

  const { data, isLoading, error, mutate } = useSWR<{ events: EventoRow[] }>(ancla && prefs.vista !== 'avisos' ? clave : null, fetcher, { keepPreviousData: true, refreshInterval: 120_000 });
  const eventos = useMemo(() => {
    const todos = data?.events ?? [];
    return prefs.verCancelados ? todos : todos.filter((e) => e.status !== 'canceled');
  }, [data?.events, prefs.verCancelados]);

  const nuevo = (cuando?: Date) => {
    const inicio = cuando ?? new Date(Math.ceil(Date.now() / 1800000) * 1800000);
    setModal({ title: '', startsAt: inicio.toISOString(), endsAt: new Date(inicio.getTime() + 3600000).toISOString() });
  };

  /** Mover un evento arrastrando en la línea de tiempo: mantiene la duración. */
  const moverEvento = useCallback(
    async (evento: EventoRow, nuevoInicio: Date) => {
      const duracion = new Date(evento.endsAt).getTime() - new Date(evento.startsAt).getTime();
      try {
        await editarEvento(evento.id, { startsAt: nuevoInicio.toISOString(), endsAt: new Date(nuevoInicio.getTime() + duracion).toISOString() });
        toast.success('Evento movido.');
        void mutate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo mover.');
      }
    },
    [mutate],
  );

  const mover = (paso: number) => {
    if (prefs.vista === 'semana' || prefs.vista === 'gantt') setAncla((a) => sumarDias(a ?? new Date(), 7 * paso));
    else if (prefs.vista === 'mes') setAncla((a) => new Date((a ?? new Date()).getFullYear(), (a ?? new Date()).getMonth() + paso, 1));
    else if (prefs.vista === 'ano') setAncla((a) => new Date((a ?? new Date()).getFullYear() + paso, 0, 1));
    else setAncla((a) => sumarDias(a ?? new Date(), paso));
  };

  const titulo = useMemo(() => {
    if (!ancla) return '';
    if (prefs.vista === 'mes') return mesLargo(ancla);
    if (prefs.vista === 'ano') return String(ancla.getFullYear());
    if (prefs.vista === 'semana' || prefs.vista === 'gantt') {
      const lunes = lunesDe(ancla);
      const domingo = sumarDias(lunes, 6);
      return `${lunes.getDate()}/${lunes.getMonth() + 1} — ${domingo.getDate()}/${domingo.getMonth() + 1}`;
    }
    if (prefs.vista === 'agenda') return 'Próximos 45 días';
    const dia = prefs.vista === 'manana' ? sumarDias(ancla, 1) : prefs.vista === 'pasado' ? sumarDias(ancla, 2) : ancla;
    return etiquetaLarga(dia);
  }, [prefs.vista, ancla]);


  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 p-5">
        <span className="flex size-10 items-center justify-center rounded-xl text-white" style={{ background: 'var(--cal-accent)', boxShadow: 'var(--c-shadow-accent)' }}>
          <CalendarDays className="size-5" aria-hidden />
        </span>
        <span className="flex-1 text-xl font-bold tracking-tight text-[var(--c-text)]">Calendario</span>
        <button type="button" onClick={() => setDrawer(false)} className={cn(C.iconBtn, 'lg:hidden')} aria-label="Cerrar">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-2">
        <button type="button" onClick={() => nuevo()} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cal-accent)] px-3 py-2.5 text-sm font-bold text-white" style={{ boxShadow: 'var(--c-shadow-accent)' }}>
          <CalendarPlus className="size-4" aria-hidden />
          Nuevo evento
        </button>
        <p className={cn(C.rotulo, 'px-2 pb-1')}>Vistas</p>
        {(Object.keys(VISTA_LABELS) as VistaCalendario[]).map((v) => {
          const Icon = ICONOS[v];
          return (
            <button
              key={v}
              type="button"
              onClick={() => {
                setPrefs({ vista: v });
                setAncla(new Date());
                setDrawer(false);
              }}
              className={cn(C.nav, prefs.vista === v ? C.navActive : C.navIdle)}
            >
              <span className="flex items-center gap-3">
                <Icon className="size-4" aria-hidden />
                {VISTA_LABELS[v]}
              </span>
            </button>
          );
        })}

        <p className={cn(C.rotulo, 'px-2 pb-1 pt-4')}>Tipos</p>
        <div className="flex flex-wrap gap-1 px-1">
          {EVENT_KINDS.map((k) => {
            const activo = prefs.kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => setPrefs({ kinds: activo ? prefs.kinds.filter((x) => x !== k) : [...prefs.kinds, k] })}
                className={cn(C.chip, activo ? C.chipActive : C.chipIdle)}
              >
                {(() => {
                  const Icon = KIND_ICON[k];
                  return <Icon className="size-3.5" aria-hidden />;
                })()}
                {KIND_META[k].label}
              </button>
            );
          })}
        </div>

        <div className="space-y-1 px-1 pt-4">
          <label className="flex items-center gap-2 px-2 text-xs text-[var(--c-text-secondary)]">
            <input type="checkbox" checked={prefs.soloMios} onChange={(e) => setPrefs({ soloMios: e.target.checked })} />
            Sólo lo mío
          </label>
          <label className="flex items-center gap-2 px-2 text-xs text-[var(--c-text-secondary)]">
            <input type="checkbox" checked={prefs.verCancelados} onChange={(e) => setPrefs({ verCancelados: e.target.checked })} />
            Ver cancelados
          </label>
        </div>
      </div>

      <div className="shrink-0 space-y-1 border-t border-[var(--c-border)] bg-[var(--c-surface)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => setPrefs({ tema: prefs.tema === 'sistema' ? (oscuro ? 'claro' : 'oscuro') : prefs.tema === 'oscuro' ? 'claro' : 'sistema' })}
            className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-[var(--c-muted)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]"
            title={prefs.tema === 'sistema' ? 'Tema: automático (sigue a WhatsPro)' : prefs.tema === 'oscuro' ? 'Tema: oscuro' : 'Tema: claro'}
            suppressHydrationWarning
          >
            {/* Hasta que monta se dibuja igual que en el servidor: el tema real
                lo sabe recién el navegador. */}
            {montado && oscuro ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
            <span suppressHydrationWarning>{!montado || prefs.tema === 'sistema' ? 'Auto' : oscuro ? 'Oscuro' : 'Claro'}</span>
          </button>
          <a href="/plugins/tasks" className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-[var(--c-muted)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]" title="Ir a Tareas OS">
            <ListChecks className="size-[18px]" aria-hidden />
            Tareas
          </a>
          <a href="/plugins/sales-ops" className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-[var(--c-muted)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]" title="Ir al Command Center">
            <Radar className="size-[18px]" aria-hidden />
            Command
          </a>
        </div>
        <a href="/apps" className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--c-muted)] hover:text-[var(--c-text)]">
          <ArrowLeft className="size-3.5" aria-hidden />
          Volver a WhatsPro
        </a>
      </div>
    </div>
  );

  return (
    <div
      className="calendario-ui fixed inset-0 z-40 flex h-screen w-full overflow-hidden"
      /* El tema real sólo se conoce en el navegador: el servidor pinta en claro
         y el cliente corrige. Es un cambio esperado, no un error. */
      suppressHydrationWarning
      data-theme={oscuro ? 'dark' : 'light'}
      style={{ ['--cal-accent' as string]: prefs.acento, colorScheme: oscuro ? 'dark' : 'light' }}
    >
      <aside className="hidden shrink-0 border-r border-[var(--c-border)] bg-[var(--c-surface)] lg:flex" style={{ width: prefs.sidebarWidth }}>
        {sidebar}
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 flex h-full w-[85vw] max-w-xs flex-col bg-[var(--c-surface)]" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2.5 lg:px-5">
          <button type="button" onClick={() => setDrawer(true)} className={cn(C.iconBtn, 'lg:hidden')} aria-label="Menú">
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => mover(-1)} className={C.iconBtn} aria-label="Anterior">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={() => setAncla(new Date())} className={cn(C.chip, C.chipIdle)}>
              Hoy
            </button>
            <button type="button" onClick={() => mover(1)} className={C.iconBtn} aria-label="Siguiente">
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <h1 className="min-w-0 flex-1 truncate text-base font-black tracking-tight text-[var(--c-text)] lg:text-lg">{titulo}</h1>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--c-muted)]" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento o contacto" className={cn(C.control, 'pl-8')} />
          </div>
          <button type="button" onClick={() => nuevo()} className="hidden items-center gap-1.5 rounded-xl bg-[var(--cal-accent)] px-3 py-2 text-xs font-bold text-white sm:inline-flex">
            <CalendarPlus className="size-3.5" aria-hidden />
            Agendar
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 lg:p-5">
          {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">No se pudieron cargar los eventos.</div>}
          {isLoading && !data && <div className="h-40 animate-pulse rounded-2xl bg-[var(--c-surface)]" />}
          {prefs.vista === 'avisos' && <PanelAvisos />}
          {!ancla && prefs.vista !== 'avisos' && <div className="h-40 animate-pulse rounded-2xl bg-[var(--c-surface)]" />}
          {ancla && data && (
            <>
              {(prefs.vista === 'hoy' || prefs.vista === 'manana' || prefs.vista === 'pasado') && (
                <VistaDia
                  fecha={prefs.vista === 'manana' ? sumarDias(ancla, 1) : prefs.vista === 'pasado' ? sumarDias(ancla, 2) : ancla}
                  eventos={eventos}
                  onAbrir={(e) => setModal(e)}
                  onNuevo={nuevo}
                />
              )}
              {prefs.vista === 'semana' && <VistaSemana lunes={lunesDe(ancla)} eventos={eventos} onAbrir={(e) => setModal(e)} onNuevo={nuevo} />}
              {prefs.vista === 'mes' && (
                <VistaMes
                  mes={ancla}
                  eventos={eventos}
                  onAbrir={(e) => setModal(e)}
                  onDia={(f) => {
                    setAncla(f);
                    setPrefs({ vista: 'hoy' });
                  }}
                />
              )}
              {prefs.vista === 'ano' && (
                <VistaAno
                  ano={ancla.getFullYear()}
                  eventos={eventos}
                  onDia={(f) => {
                    setAncla(f);
                    setPrefs({ vista: 'hoy' });
                  }}
                />
              )}
              {prefs.vista === 'agenda' && <VistaAgenda eventos={eventos} onAbrir={(e) => setModal(e)} />}
              {prefs.vista === 'gantt' && (
                <VistaGantt
                  desde={from}
                  hasta={to}
                  eventos={eventos}
                  onAbrir={(e) => setModal(e)}
                  onMover={(evento, nuevoInicio) => void moverEvento(evento, nuevoInicio)}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* En el teléfono el botón del encabezado no entra: acá va el de siempre. */}
      <button
        type="button"
        onClick={() => nuevo()}
        aria-label="Agendar un evento"
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-20 flex size-14 items-center justify-center rounded-full bg-[var(--cal-accent)] text-white shadow-lg sm:hidden"
        style={{ boxShadow: 'var(--c-shadow-accent)' }}
      >
        <CalendarPlus className="size-6" aria-hidden />
      </button>

      {modal && <ModalEvento borrador={modal} onClose={() => setModal(null)} onGuardado={() => void mutate()} />}
      <Toaster position="top-center" richColors />
    </div>
  );
}
