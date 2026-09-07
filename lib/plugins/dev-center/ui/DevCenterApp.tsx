'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, CheckSquare, FolderGit2, LayoutGrid, Radar, Rocket, Sparkles, TerminalSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TerminalAutoOpen } from '@/components/admin/terminal/TerminalWorkspace';
import type { DevPromptRow } from '../shared/types';
import { DEV_CENTER_API, editarMision, fetcher, type DevCenterPayload } from './api';
import { Misiones } from './Misiones';
import { Prompts } from './Prompts';
import { Proyectos } from './Proyectos';
import { Terminales } from './Terminales';

/**
 * Centro de Desarrollo: la app de Noelia para mandar trabajo técnico.
 *
 * Cuatro vistas —Misiones, Prompts, Terminales, Proyectos— sobre el mismo
 * fondo oscuro que la terminal. Takeover a pantalla completa (`fixed inset-0`)
 * como el Command Center comercial; en móvil la navegación es una barra
 * inferior, en escritorio un rail a la izquierda. La URL manda: el primer
 * segmento del slug es la vista (`/plugins/dev-center/prompts`).
 *
 * La puerta real está en el servidor (activación por usuario del plugin +
 * lista blanca de las terminales); si la API devuelve 403 acá se muestra por
 * qué, sin adivinar.
 */

type Vista = 'misiones' | 'prompts' | 'terminal' | 'proyectos';
const VISTAS: Array<{ id: Vista; label: string; icon: typeof Rocket; slug: string }> = [
  { id: 'misiones', label: 'Misiones', icon: Rocket, slug: '' },
  { id: 'prompts', label: 'Prompts', icon: Sparkles, slug: 'prompts' },
  { id: 'terminal', label: 'Terminales', icon: TerminalSquare, slug: 'terminal' },
  { id: 'proyectos', label: 'Proyectos', icon: FolderGit2, slug: 'proyectos' },
];
const vistaDeSlug = (slug: string | undefined): Vista => (VISTAS.find((v) => v.slug === (slug ?? ''))?.id ?? 'misiones');

/**
 * Salidas de la app. Como el Centro de Desarrollo hace takeover (`fixed
 * inset-0`) y el panel esconde su barra inferior en estas rutas, la vuelta a
 * WhatsPro y el salto a las otras apps tienen que vivir acá adentro: si no,
 * desde el celular no hay forma de salir salvo el botón atrás del navegador.
 */
const ATAJOS: Array<{ href: string; label: string; corto: string; icon: typeof Rocket }> = [
  { href: '/dashboard', label: 'Volver a WhatsPro', corto: 'WhatsPro', icon: ArrowLeft },
  { href: '/plugins/sales-ops', label: 'Ir a Command Center', corto: 'Command', icon: Radar },
  { href: '/plugins/tasks', label: 'Ir a Tareas', corto: 'Tareas', icon: CheckSquare },
  { href: '/apps', label: 'Apps', corto: 'Apps', icon: LayoutGrid },
];
const atajoId = (href: string) => href.replace(/^\//, '').replace(/\//g, '-');

type UserLite = { email?: string | null; name?: string | null } | null;
type GatewayInfo = { gatewayOk?: boolean; sessions?: unknown[] };

export function DevCenterApp({ slug }: { slug: string[] }) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#0b0f14]" />}>
      <DevCenterShell slug={slug} />
    </Suspense>
  );
}

function DevCenterShell({ slug }: { slug: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const vista = vistaDeSlug(slug?.[0]);
  const base = useMemo(() => pathname.replace(/\/plugins\/dev-center.*$/, '/plugins/dev-center'), [pathname]);
  const ir = useCallback((v: Vista) => { const s = VISTAS.find((x) => x.id === v)?.slug ?? ''; router.push(s ? `${base}/${s}` : base); }, [base, router]);

  const { data, error, mutate } = useSWR<DevCenterPayload>(DEV_CENTER_API, fetcher, { refreshInterval: vista === 'misiones' ? 15_000 : 60_000, revalidateOnFocus: false });
  const { data: user } = useSWR<UserLite>('/api/user', fetcher);
  const { data: gateway } = useSWR<GatewayInfo>('/api/admin/terminal/sessions', fetcher, { refreshInterval: 30_000, revalidateOnFocus: false, shouldRetryOnError: false });

  // Lo que la vista Terminales debe abrir sola al llegar: viene de «Abrir en
  // terminal» de una misión o de «Abrir terminal acá» de un proyecto.
  const [autoOpen, setAutoOpen] = useState<TerminalAutoOpen | null>(null);
  const abrirTerminal = useCallback((pedido: Omit<TerminalAutoOpen, 'key'>) => { setAutoOpen({ ...pedido, key: String(Date.now()) }); ir('terminal'); }, [ir]);
  /** Prompt elegido en la biblioteca para «Ejecutar»: la vista Misiones abre el formulario con él. */
  const [promptParaMision, setPromptParaMision] = useState<DevPromptRow | null>(null);
  const ejecutarPrompt = useCallback((prompt: DevPromptRow) => { setPromptParaMision(prompt); ir('misiones'); }, [ir]);
  /** Barra inferior escondida para que la terminal ocupe todo en el celular. */
  const [barraOculta, setBarraOculta] = useState(false);
  useEffect(() => { if (vista !== 'terminal') setBarraOculta(false); }, [vista]);

  useEffect(() => {
    const anterior = document.title;
    document.title = 'Centro de Desarrollo — WhatsPro';
    return () => { document.title = anterior; };
  }, []);

  const refrescar = useCallback(() => void mutate(), [mutate]);
  const abiertas = data?.missions.length ?? 0;

  // La terminal conectó con la misión adentro: queda «en curso» con su sesión
  // tmux. Si ya estaba en curso (volver a la terminal), el servidor rechaza
  // repetir el estado y alcanza con guardar el tmux.
  const marcarEnCurso = useCallback(async (missionId: number, tmux: string) => {
    try { await editarMision(missionId, { status: 'running', tmuxName: tmux }); }
    catch { await editarMision(missionId, { tmuxName: tmux }).catch(() => undefined); }
    refrescar();
  }, [refrescar]);

  return (
    <div data-testid="devcenter-app" className="fixed inset-0 z-40 flex flex-col bg-[#0b0f14] text-neutral-100 sm:flex-row">
      {/* Rail (escritorio) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] sm:flex">
        <div className="px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Developer Command Center</p>
          <h1 className="mt-1 text-base font-black">Centro de Desarrollo</h1>
          <p className="mt-1 truncate text-[11px] text-neutral-500" title={user?.email ?? ''}>{user?.email ?? '…'}</p>
        </div>
        <nav className="flex flex-col gap-1 px-2" aria-label="Secciones">
          {VISTAS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" data-testid={`devcenter-nav-${id}`} aria-current={vista === id ? 'page' : undefined} onClick={() => ir(id)} className={cn('flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-bold transition-colors', vista === id ? 'bg-emerald-500/15 text-emerald-200' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100')}>
              <Icon className="size-4" aria-hidden /> {label}
              {id === 'misiones' && abiertas > 0 && <span className="ml-auto rounded-full bg-white/10 px-1.5 text-[10px] font-black tabular-nums">{abiertas}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2 px-3 py-4">
          <div className="px-1"><EstadoGateway ok={gateway?.gatewayOk} /></div>
          <p className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-600">Atajos</p>
          <div className="space-y-1">
            {ATAJOS.map(({ href, label, icon: Icon }) => (
              <a key={href} href={href} data-testid={`devcenter-atajo-${atajoId(href)}`} className="flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-neutral-300 hover:bg-white/5 hover:text-neutral-100">
                <Icon className="size-3.5" aria-hidden /> {label}
              </a>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Cabecera (móvil) */}
        {!(vista === 'terminal' && barraOculta) && (
          <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 sm:hidden">
            <a href="/dashboard" aria-label="Volver a WhatsPro" className="flex size-8 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10"><ArrowLeft className="size-4" /></a>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">Centro de Desarrollo</p>
              <p className="truncate text-[10px] text-neutral-500">sólo Noelia · {VISTAS.find((v) => v.id === vista)?.label}</p>
            </div>
            <EstadoGateway ok={gateway?.gatewayOk} compacto />
          </header>
        )}

        {/* Atajos (móvil): la única salida de la app en el celular. */}
        {!(vista === 'terminal' && barraOculta) && (
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/10 px-3 py-2 sm:hidden" aria-label="Atajos">
            {ATAJOS.map(({ href, label, corto, icon: Icon }) => (
              <a key={href} href={href} aria-label={label} title={label} data-testid={`devcenter-atajo-${atajoId(href)}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-black text-neutral-300 active:bg-white/10">
                <Icon className="size-3.5" aria-hidden /> {corto}
              </a>
            ))}
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-hidden">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-sm font-black text-red-200">No se pudo cargar el Centro de Desarrollo</p>
              <p className="max-w-md text-xs text-neutral-400">{error.message}</p>
            </div>
          ) : vista === 'misiones' ? (
            <Misiones data={data} onChanged={refrescar} onAbrirTerminal={abrirTerminal} promptInicial={promptParaMision} onPromptInicialUsado={() => setPromptParaMision(null)} />
          ) : vista === 'prompts' ? (
            <Prompts data={data} onChanged={refrescar} onEjecutar={ejecutarPrompt} />
          ) : vista === 'terminal' ? (
            <Terminales email={user?.email ?? ''} autoOpen={autoOpen} barraOculta={barraOculta} onBarra={setBarraOculta} onOpened={(info) => { if (info.missionId) void marcarEnCurso(info.missionId, info.tmux); }} />
          ) : (
            <Proyectos data={data} onAbrirTerminal={abrirTerminal} />
          )}
        </main>

        {/* Barra inferior (móvil) */}
        {!(vista === 'terminal' && barraOculta) && (
          <nav className="flex shrink-0 border-t border-white/10 bg-[#0b0f14] pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Secciones">
            {VISTAS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" data-testid={`devcenter-nav-${id}`} aria-current={vista === id ? 'page' : undefined} onClick={() => ir(id)} className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-black', vista === id ? 'text-emerald-300' : 'text-neutral-500')}>
                <span className="relative"><Icon className="size-5" aria-hidden />{id === 'misiones' && abiertas > 0 && <span className="absolute -right-2 -top-1 rounded-full bg-emerald-500 px-1 text-[9px] text-black">{abiertas}</span>}</span>
                {label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function EstadoGateway({ ok, compacto = false }: { ok: boolean | undefined; compacto?: boolean }) {
  const tono = ok ? 'border-emerald-500/40 text-emerald-300' : ok === false ? 'border-red-500/40 text-red-300' : 'border-white/10 text-neutral-500';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black', tono)} data-testid="devcenter-gateway" data-ok={ok ?? 'unknown'} title="Terminal Gateway del servidor">
      <span className={cn('size-1.5 rounded-full', ok ? 'bg-emerald-400' : ok === false ? 'bg-red-500' : 'bg-neutral-600')} />
      {compacto ? (ok ? 'gateway' : ok === false ? 'sin gateway' : '…') : ok ? 'Gateway conectado' : ok === false ? 'Gateway sin respuesta' : 'Gateway…'}
    </span>
  );
}
