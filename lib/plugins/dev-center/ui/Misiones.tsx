'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ClipboardCopy, ExternalLink, Loader2, Plus, Rocket, Send, TerminalSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TerminalAutoOpen } from '@/components/admin/terminal/TerminalWorkspace';
import {
  MISSION_AGENTS,
  MISSION_AGENT_META,
  MISSION_MODES,
  MISSION_MODE_META,
  MISSION_STATUS_META,
  MISSION_STATUS_ORDER,
  MISSION_TRANSITIONS,
  esAgenteMcp,
  esAgenteTerminal,
  modoTerminalDe,
  rellenarPrompt,
  type DevPromptRow,
  type MissionAgent,
  type MissionMode,
  type MissionRow,
  type MissionStatus,
} from '../shared/types';
import { cancelarMision, crearMision, editarMision, haceCuanto, lanzarMision, type DevCenterPayload } from './api';
import { AGENT_TONE, Boton, Chip, Hoja, STATUS_TONE, Vacio, control, rotulo, tarjeta } from './atomos';

/**
 * Misiones: el tablero de trabajo técnico. Una misión va a una TERMINAL del
 * servidor (Claude Code / Codex, el prompt se tipea en tmux) o a un cliente MCP
 * (Claude Desktop, Codex de escritorio o cualquier conector) por la cola de
 * corridas. Desde acá se crea, se manda, se abre y se cierra; el estado de las
 * de MCP lo trae el servidor desde la corrida (`runStatus`).
 */

type FiltroAgente = 'todas' | 'terminal' | 'claude_desktop' | 'codex_desktop' | 'connector';
const FILTROS: Array<{ id: FiltroAgente; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'claude_desktop', label: 'Claude Desktop' },
  { id: 'codex_desktop', label: 'Codex Desktop' },
  { id: 'connector', label: 'Conector' },
];
const PRIORIDAD: Record<number, { label: string; tone: string }> = {
  1: { label: 'Alta', tone: 'text-red-300' },
  2: { label: 'Normal', tone: 'text-neutral-400' },
  3: { label: 'Baja', tone: 'text-neutral-500' },
};
const RUN_LABEL: Record<string, string> = { queued: 'esperando conector', in_progress: 'el conector la tomó', completed: 'el conector la cerró', blocked: 'el conector pide una decisión', failed: 'el conector falló', cancelled: 'cancelada en la cola' };

const instruccionEscritorio = (m: MissionRow) =>
  m.agent === 'claude_desktop'
    ? `Abrí Claude Desktop con el conector WhatsPro y decile: tomá la misión #${m.id} con whatspro_dev_missions {for_agent:"claude_desktop"}`
    : m.agent === 'codex_desktop'
      ? `Abrí Codex con el conector WhatsPro y decile: tomá la misión #${m.id} con whatspro_dev_missions {for_agent:"codex_desktop"}`
      : `Cualquier conector con WhatsPro la va a ver en whatspro_work_queue; para pedirla a mano: tomá la misión #${m.id} con whatspro_dev_missions {for_agent:"connector"}`;

export function Misiones({ data, onChanged, onAbrirTerminal, promptInicial, onPromptInicialUsado }: {
  data: DevCenterPayload | undefined;
  onChanged: () => void;
  onAbrirTerminal: (pedido: Omit<TerminalAutoOpen, 'key'>) => void;
  promptInicial: DevPromptRow | null;
  onPromptInicialUsado: () => void;
}) {
  const [filtro, setFiltro] = useState<FiltroAgente>('todas');
  const [nueva, setNueva] = useState(false);
  const [historial, setHistorial] = useState(false);
  useEffect(() => { if (promptInicial) setNueva(true); }, [promptInicial]);

  const misiones = useMemo(() => (data?.missions ?? []).filter((m) => filtro === 'todas' || (filtro === 'terminal' ? esAgenteTerminal(m.agent) : m.agent === filtro)), [data?.missions, filtro]);
  const porEstado = useMemo(() => {
    const out = new Map<MissionStatus, MissionRow[]>();
    for (const s of MISSION_STATUS_ORDER) out.set(s, []);
    for (const m of misiones) out.get(m.status)?.push(m);
    return out;
  }, [misiones]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-5 sm:py-3">
        <div className="mr-auto">
          <h2 className="text-base font-black">Misiones</h2>
          <p className="text-[11px] text-neutral-500">{data ? `${data.missions.length} abiertas · ${data.history.length} cerradas` : 'Cargando…'}</p>
        </div>
        <Boton tono="primario" onClick={() => setNueva(true)} data-testid="devcenter-accion-nueva-mision"><Plus className="size-4" aria-hidden /> Nueva misión</Boton>
      </div>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filtrar por agente">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)} data-testid={`devcenter-filtro-${f.id}`} className={cn('shrink-0 rounded-full border px-3 py-1 text-[11px] font-black', filtro === f.id ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-white/10 text-neutral-400 hover:bg-white/5')}>
            {f.label} <span className="tabular-nums opacity-60">{(data?.missions ?? []).filter((m) => f.id === 'todas' || (f.id === 'terminal' ? esAgenteTerminal(m.agent) : m.agent === f.id)).length}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-5">
        {!data ? (
          <div className="flex min-h-[240px] items-center justify-center text-neutral-500"><Loader2 className="size-5 animate-spin" /></div>
        ) : misiones.length === 0 ? (
          <Vacio titulo="Sin misiones abiertas" detalle="Creá una: elegís proyecto, agente y modo, escribís qué hay que hacer (o partís de un prompt de la biblioteca) y la mandás a una terminal o a la cola de los conectores.">
            <Boton tono="primario" onClick={() => setNueva(true)}><Plus className="size-4" aria-hidden /> Nueva misión</Boton>
          </Vacio>
        ) : (
          <div className="space-y-5 pt-1">
            {MISSION_STATUS_ORDER.filter((s) => MISSION_STATUS_META[s].abierta && porEstado.get(s)?.length).map((estado) => (
              <section key={estado} data-testid={`devcenter-columna-${estado}`}>
                <h3 className="mb-2 flex items-center gap-2"><Chip className={STATUS_TONE[estado]}>{MISSION_STATUS_META[estado].label}</Chip><span className="text-[11px] font-bold tabular-nums text-neutral-500">{porEstado.get(estado)!.length}</span></h3>
                <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                  {porEstado.get(estado)!.map((m) => <TarjetaMision key={m.id} mision={m} onChanged={onChanged} onAbrirTerminal={onAbrirTerminal} />)}
                </div>
              </section>
            ))}
          </div>
        )}

        {data && data.history.length > 0 && (
          <section className="mt-6">
            <button type="button" onClick={() => setHistorial((v) => !v)} className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-neutral-500 hover:text-neutral-300" data-testid="devcenter-historial">
              <ChevronDown className={cn('size-4 transition-transform', historial && 'rotate-180')} aria-hidden /> Historial · {data.history.length} cerradas
            </button>
            {historial && <div className="mt-2 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">{data.history.map((m) => <TarjetaMision key={m.id} mision={m} onChanged={onChanged} onAbrirTerminal={onAbrirTerminal} cerrada />)}</div>}
          </section>
        )}
      </div>

      <NuevaMision abierta={nueva} data={data} promptInicial={promptInicial} onCerrar={() => { setNueva(false); onPromptInicialUsado(); }} onCreada={(m, ejecutar) => { setNueva(false); onPromptInicialUsado(); onChanged(); if (ejecutar && esAgenteTerminal(m.agent)) abrirEnTerminal(m, onAbrirTerminal); }} />
    </div>
  );
}

function abrirEnTerminal(m: MissionRow, onAbrirTerminal: (pedido: Omit<TerminalAutoOpen, 'key'>) => void) {
  const mode = modoTerminalDe(m.agent);
  if (!mode) return;
  // Un salto de línea final: el agente recibe la misión y arranca solo.
  onAbrirTerminal({ project: m.project, mode, initialInput: `${m.prompt.trim()}\n`, missionId: m.id, title: m.title });
}

function TarjetaMision({ mision: m, onChanged, onAbrirTerminal, cerrada = false }: { mision: MissionRow; onChanged: () => void; onAbrirTerminal: (pedido: Omit<TerminalAutoOpen, 'key'>) => void; cerrada?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [resumen, setResumen] = useState('');
  const [pidiendoResumen, setPidiendoResumen] = useState<'completed' | 'failed' | null>(null);
  const [copiado, setCopiado] = useState(false);
  const permitidas = MISSION_TRANSITIONS[m.status];
  const terminal = esAgenteTerminal(m.agent);
  const mcp = esAgenteMcp(m.agent);

  const correr = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo.'); } finally { setBusy(false); }
  };
  const cerrar = (status: 'completed' | 'failed') => correr(() => editarMision(m.id, { status, resultSummary: resumen.trim() || null })).then(() => { setPidiendoResumen(null); setResumen(''); });
  const copiar = () => { void navigator.clipboard?.writeText(instruccionEscritorio(m)).then(() => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1500); }); };

  return (
    <article data-testid={`devcenter-mision-${m.id}`} data-estado={m.status} data-agente={m.agent} className={cn(tarjeta, 'p-3', cerrada && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => setAbierta((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="line-clamp-2 text-sm font-black leading-snug">{m.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-neutral-500">
            <span className="font-bold text-neutral-300">{m.projectName}</span><span>·</span>
            <span>{MISSION_MODE_META[m.mode].label}</span><span>·</span>
            <span className={PRIORIDAD[m.priority]?.tone}>{PRIORIDAD[m.priority]?.label ?? m.priority}</span><span>·</span>
            <span title={m.updatedAt}>{haceCuanto(m.updatedAt)}</span>
          </p>
        </button>
        <Chip className={cn(AGENT_TONE[m.agent], (m.agent === 'claude_desktop' || m.agent === 'codex_desktop') && 'border-dashed')}>{MISSION_AGENT_META[m.agent].corto}</Chip>
      </div>

      {mcp && m.promptRunId && (
        <p className="mt-2 text-[11px] text-cyan-200/80" data-testid={`devcenter-corrida-${m.id}`}>Corrida #{m.promptRunId} · {RUN_LABEL[m.runStatus ?? ''] ?? m.runStatus ?? 'sin estado'}{m.runSummary ? ` — ${m.runSummary.slice(0, 160)}` : ''}</p>
      )}
      {m.tmuxName && <p className="mt-1 font-mono text-[10px] text-neutral-500">tmux {m.tmuxName}</p>}
      {m.resultSummary && <p className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-neutral-300">{m.resultSummary}</p>}
      {m.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{m.tags.map((t) => <span key={t} className="rounded bg-white/5 px-1.5 text-[10px] text-neutral-400">#{t}</span>)}</div>}

      {abierta && (
        <div className="mt-2 space-y-2">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[11px] leading-4 text-neutral-300">{m.prompt}</pre>
          {mcp && m.status === 'queued' && (
            <div className="rounded-lg border border-dashed border-cyan-400/30 bg-cyan-500/5 p-2" data-testid={`devcenter-instruccion-${m.id}`}>
              <p className={rotulo}>Cómo la toma tu escritorio</p>
              <p className="mt-1 text-xs text-neutral-300">{instruccionEscritorio(m)}</p>
              <Boton className="mt-2 h-8" onClick={copiar}>{copiado ? <Check className="size-3.5" aria-hidden /> : <ClipboardCopy className="size-3.5" aria-hidden />} {copiado ? 'Copiada' : 'Copiar instrucción'}</Boton>
            </div>
          )}
        </div>
      )}

      {pidiendoResumen && (
        <div className="mt-2 space-y-2">
          <textarea value={resumen} onChange={(e) => setResumen(e.target.value)} rows={3} placeholder={pidiendoResumen === 'completed' ? 'Qué se hizo, en 1-3 líneas.' : 'Qué falló.'} className={cn(control, 'h-auto py-2')} data-testid="devcenter-campo-resumen" />
          <div className="flex gap-2"><Boton tono="primario" disabled={busy} onClick={() => void cerrar(pidiendoResumen)}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Guardar</Boton><Boton tono="fantasma" onClick={() => setPidiendoResumen(null)}>Cancelar</Boton></div>
        </div>
      )}

      {!pidiendoResumen && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {terminal && (m.status === 'draft' || m.status === 'queued' || m.status === 'running' || m.status === 'blocked' || m.status === 'failed') && (
            <Boton tono="primario" className="h-8" disabled={busy} onClick={() => abrirEnTerminal(m, onAbrirTerminal)} data-testid="devcenter-accion-abrir-terminal"><TerminalSquare className="size-3.5" aria-hidden /> {m.tmuxName ? 'Volver a la terminal' : 'Abrir en terminal'}</Boton>
          )}
          {mcp && (m.status === 'draft' || m.status === 'failed') && (
            <Boton tono="primario" className="h-8" disabled={busy} onClick={() => void correr(() => lanzarMision(m.id))} data-testid="devcenter-accion-enviar-conector"><Send className="size-3.5" aria-hidden /> Enviar a la cola</Boton>
          )}
          {mcp && m.promptRunId && <a href="/plugins/sales-ops/cola" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-cyan-200 hover:bg-white/5">Ver en el Command Center <ExternalLink className="size-3" aria-hidden /></a>}
          {permitidas.includes('completed') && <Boton className="h-8" disabled={busy} onClick={() => setPidiendoResumen('completed')} data-testid="devcenter-accion-completar"><Check className="size-3.5" aria-hidden /> Completada</Boton>}
          {permitidas.includes('failed') && m.status !== 'draft' && <Boton className="h-8" disabled={busy} onClick={() => setPidiendoResumen('failed')} data-testid="devcenter-accion-fallo"><X className="size-3.5" aria-hidden /> Falló</Boton>}
          {permitidas.includes('running') && terminal && m.status !== 'running' && !m.tmuxName && <Boton tono="fantasma" className="h-8" disabled={busy} onClick={() => void correr(() => editarMision(m.id, { status: 'running' }))}>Marcar en curso</Boton>}
          {permitidas.includes('cancelled') && <Boton tono="peligro" className="h-8" disabled={busy} onClick={() => { if (window.confirm(`¿Cancelar «${m.title}»?`)) void correr(() => cancelarMision(m.id)); }} data-testid="devcenter-accion-cancelar">Cancelar</Boton>}
          {m.status === 'cancelled' && <Boton tono="fantasma" className="h-8" disabled={busy} onClick={() => void correr(() => editarMision(m.id, { status: 'draft' }))}>Reabrir</Boton>}
          {m.status === 'completed' && terminal && <Boton tono="fantasma" className="h-8" disabled={busy} onClick={() => void correr(() => editarMision(m.id, { status: 'running' }))}>Retomar</Boton>}
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}
    </article>
  );
}

// ── Nueva misión ─────────────────────────────────────────────────────────────

const GRUPOS_AGENTE: Array<{ titulo: string; agentes: MissionAgent[] }> = [
  { titulo: 'En el servidor', agentes: ['claude', 'codex'] },
  { titulo: 'Desde tu escritorio (MCP)', agentes: ['claude_desktop', 'codex_desktop', 'connector'] },
];

function NuevaMision({ abierta, data, promptInicial, onCerrar, onCreada }: { abierta: boolean; data: DevCenterPayload | undefined; promptInicial: DevPromptRow | null; onCerrar: () => void; onCreada: (m: MissionRow, ejecutar: boolean) => void }) {
  const proyectos = data?.projects ?? [];
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [agent, setAgent] = useState<MissionAgent>('claude');
  const [mode, setMode] = useState<MissionMode>('editar');
  const [promptId, setPromptId] = useState<number | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!project && proyectos[0]) setProject(proyectos[0].slug); }, [project, proyectos]);
  const plantilla = useMemo(() => (data?.prompts ?? []).find((p) => p.id === promptId) ?? null, [data?.prompts, promptId]);

  // Elegir un prompt de la biblioteca rellena todo lo que el prompt trae por
  // defecto; lo que la persona ya escribió a mano no se pisa salvo el cuerpo.
  const usarPrompt = (p: DevPromptRow | null) => {
    setPromptId(p?.id ?? null);
    setValores({});
    if (!p) return;
    setPrompt(p.body);
    if (!title.trim()) setTitle(p.title);
    setAgent(p.agentDefault);
    setMode(p.modeDefault);
    if (p.projectDefault && proyectos.some((x) => x.slug === p.projectDefault)) setProject(p.projectDefault);
  };
  useEffect(() => { if (abierta && promptInicial) usarPrompt(promptInicial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [abierta, promptInicial?.id]);
  useEffect(() => { if (!abierta) { setTitle(''); setPrompt(''); setPromptId(null); setValores({}); setTags(''); setPriority(2); setError(null); } }, [abierta]);

  const promptFinal = plantilla ? rellenarPrompt(prompt, valores) : prompt;
  const faltan = plantilla ? plantilla.variables.filter((v) => !valores[v.key]?.trim()) : [];

  const guardar = async (ejecutar: boolean) => {
    if (title.trim().length < 3) return setError('Poné un título.');
    if (promptFinal.trim().length < 10) return setError('La misión necesita un prompt de al menos 10 caracteres.');
    setBusy(true); setError(null);
    try {
      const m = await crearMision({ title: title.trim(), project, agent, mode, prompt: promptFinal, promptId, variables: valores, priority, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), launch: ejecutar && esAgenteMcp(agent) });
      onCreada(m, ejecutar);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la misión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Hoja abierta={abierta} titulo="Nueva misión" onCerrar={onCerrar} testId="devcenter-hoja-nueva-mision">
      <div className="space-y-4">
        <label className="block space-y-1"><span className={rotulo}>Título</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: corregir el filtro de la cola de Producción" className={control} data-testid="devcenter-campo-titulo" autoFocus /></label>
        <label className="block space-y-1"><span className={rotulo}>Proyecto</span>
          <select value={project} onChange={(e) => setProject(e.target.value)} className={control} data-testid="devcenter-campo-proyecto">{proyectos.map((p) => <option key={p.slug} value={p.slug}>{p.name} · {p.cwd}</option>)}</select>
        </label>
        <div className="space-y-2">
          <span className={rotulo}>Agente</span>
          {GRUPOS_AGENTE.map((g) => (
            <div key={g.titulo}>
              <p className="mb-1 text-[10px] font-bold text-neutral-500">{g.titulo}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {g.agentes.filter((a) => MISSION_AGENTS.includes(a)).map((a) => (
                  <button key={a} type="button" onClick={() => setAgent(a)} title={MISSION_AGENT_META[a].ayuda} aria-pressed={agent === a} data-testid={`devcenter-agente-${a}`} className={cn('rounded-xl border px-2.5 py-2 text-left text-xs font-black', AGENT_TONE[a], (a === 'claude_desktop' || a === 'codex_desktop') && 'border-dashed', agent === a ? 'ring-2 ring-emerald-400/60' : 'opacity-60 hover:opacity-100')}>
                    {MISSION_AGENT_META[a].corto}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-neutral-500">{MISSION_AGENT_META[agent].ayuda}</p>
        </div>
        <div className="space-y-1">
          <span className={rotulo}>Modo</span>
          <div className="flex flex-wrap gap-1.5">{MISSION_MODES.map((mo) => <button key={mo} type="button" onClick={() => setMode(mo)} title={MISSION_MODE_META[mo].ayuda} aria-pressed={mode === mo} data-testid={`devcenter-modo-${mo}`} className={cn('rounded-full border px-3 py-1 text-[11px] font-black', mode === mo ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-white/10 text-neutral-400')}>{MISSION_MODE_META[mo].label}</button>)}</div>
        </div>
        <label className="block space-y-1"><span className={rotulo}>Desde un prompt de la biblioteca</span>
          <select value={promptId ?? ''} onChange={(e) => usarPrompt((data?.prompts ?? []).find((p) => p.id === Number(e.target.value)) ?? null)} className={control} data-testid="devcenter-campo-plantilla">
            <option value="">Escribir desde cero</option>
            {(data?.prompts ?? []).map((p) => <option key={p.id} value={p.id}>{p.pinned ? '★ ' : ''}{p.title}</option>)}
          </select>
        </label>
        {plantilla && plantilla.variables.length > 0 && (
          <div className="space-y-2 rounded-xl border border-white/10 p-3">
            <p className={rotulo}>Datos del prompt</p>
            {plantilla.variables.map((v) => <label key={v.key} className="block space-y-1"><span className="text-xs font-bold text-neutral-300">{v.label}</span><input value={valores[v.key] ?? ''} onChange={(e) => setValores((prev) => ({ ...prev, [v.key]: e.target.value }))} placeholder={v.placeholder ?? `{{${v.key}}}`} className={control} data-testid={`devcenter-variable-${v.key}`} /></label>)}
            {faltan.length > 0 && <p className="text-[11px] text-amber-300">Sin completar: {faltan.map((v) => v.label).join(', ')} — quedan como {'{{clave}}'} en el prompt.</p>}
          </div>
        )}
        <label className="block space-y-1"><span className={rotulo}>{plantilla ? 'Prompt (plantilla, editable)' : 'Prompt'}</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={10} placeholder="Qué hay que hacer, en qué archivos, cómo se verifica y qué NO hay que tocar." className={cn(control, 'h-auto py-2 font-mono text-xs leading-5')} data-testid="devcenter-campo-prompt" />
        </label>
        {plantilla && plantilla.variables.length > 0 && <details className="rounded-xl border border-white/10 p-3"><summary className={cn(rotulo, 'cursor-pointer')}>Previsualización con los datos</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-neutral-300">{promptFinal}</pre></details>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1"><span className={rotulo}>Prioridad</span><select value={priority} onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)} className={control}><option value={1}>Alta</option><option value={2}>Normal</option><option value={3}>Baja</option></select></label>
          <label className="block space-y-1"><span className={rotulo}>Tags (coma)</span><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="bug, produccion" className={control} /></label>
        </div>
        {error && <p className="text-xs font-semibold text-red-300" data-testid="devcenter-aviso">{error}</p>}
        <div className="flex flex-wrap gap-2 pb-2">
          <Boton disabled={busy} onClick={() => void guardar(false)} data-testid="devcenter-accion-guardar-borrador">Guardar borrador</Boton>
          <Boton tono="primario" disabled={busy} onClick={() => void guardar(true)} data-testid="devcenter-accion-crear-ejecutar">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : esAgenteTerminal(agent) ? <TerminalSquare className="size-4" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
            {esAgenteTerminal(agent) ? 'Crear y abrir en terminal' : 'Crear y enviar a la cola'}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}
