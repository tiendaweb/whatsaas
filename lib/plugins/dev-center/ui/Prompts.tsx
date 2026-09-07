'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ClipboardCopy, Loader2, Pencil, Pin, PinOff, Play, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MISSION_AGENTS, MISSION_AGENT_META, MISSION_MODES, MISSION_MODE_META, type DevPromptRow, type MissionAgent, type MissionMode, type PromptVariable } from '../shared/types';
import { borrarPrompt, crearPrompt, editarPrompt, haceCuanto, sembrarPrompts, variablesDelCuerpo, type DevCenterPayload } from './api';
import { AGENT_TONE, Boton, Chip, Hoja, Vacio, control, rotulo, tarjeta } from './atomos';

/**
 * Biblioteca de prompts técnicos. Cada uno tiene agente, proyecto y modo por
 * defecto, y `{{variables}}` que se detectan del cuerpo y se completan al
 * ejecutar. El servidor los expone además como prompts MCP `dev.<key>`, así
 * que aparecen en el menú «+» de Claude Desktop y en Codex.
 */
export function Prompts({ data, onChanged, onEjecutar }: { data: DevCenterPayload | undefined; onChanged: () => void; onEjecutar: (p: DevPromptRow) => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<DevPromptRow | 'nuevo' | null>(null);
  const [sembrando, setSembrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompts = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es');
    return (data?.prompts ?? [])
      .filter((p) => !q || [p.title, p.description ?? '', p.key, p.body].some((s) => s.toLocaleLowerCase('es').includes(q)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.usageCount - a.usageCount || a.title.localeCompare(b.title, 'es'));
  }, [busqueda, data?.prompts]);

  const sembrar = async () => { setSembrando(true); setError(null); try { await sembrarPrompts(); onChanged(); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo sembrar.'); } finally { setSembrando(false); } };
  const fijar = async (p: DevPromptRow) => { try { await editarPrompt(p.id, { pinned: !p.pinned }); onChanged(); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo.'); } };
  const borrar = async (p: DevPromptRow) => { if (!window.confirm(`¿Borrar el prompt «${p.title}»? Las misiones que lo usaron conservan su texto.`)) return; try { await borrarPrompt(p.id); onChanged(); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo borrar.'); } };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-5 sm:py-3">
        <div className="mr-auto"><h2 className="text-base font-black">Prompts</h2><p className="text-[11px] text-neutral-500">{data ? `${data.prompts.length} en la biblioteca` : 'Cargando…'}</p></div>
        <label className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-500" aria-hidden /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" className={cn(control, 'h-9 w-44 pl-8')} data-testid="devcenter-buscar-prompts" /></label>
        <Boton tono="primario" onClick={() => setEditando('nuevo')} data-testid="devcenter-accion-nuevo-prompt"><Plus className="size-4" aria-hidden /> Nuevo</Boton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-5">
        <ConectarEscritorio />
        {error && <p className="mb-2 text-xs font-semibold text-red-300">{error}</p>}
        {!data ? (
          <div className="flex min-h-[240px] items-center justify-center text-neutral-500"><Loader2 className="size-5 animate-spin" /></div>
        ) : prompts.length === 0 ? (
          <Vacio titulo={busqueda ? 'Nada con ese texto' : 'La biblioteca está vacía'} detalle={busqueda ? 'Probá con otra palabra.' : 'Sembrá los prompts iniciales (auditar, corregir un bug, revisar seguridad, preparar deploy…) o creá el primero.'}>
            {!busqueda && <Boton tono="primario" disabled={sembrando} onClick={() => void sembrar()} data-testid="devcenter-accion-sembrar">{sembrando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Sembrar prompts iniciales</Boton>}
          </Vacio>
        ) : (
          <div className="grid gap-2 pt-1 lg:grid-cols-2 2xl:grid-cols-3">
            {prompts.map((p) => (
              <article key={p.id} data-testid={`devcenter-prompt-${p.id}`} className={cn(tarjeta, 'flex flex-col p-3')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="text-sm font-black leading-snug">{p.pinned && <Pin className="mr-1 inline size-3 text-emerald-300" aria-hidden />}{p.title}</p>{p.description && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400">{p.description}</p>}</div>
                  <Chip className={AGENT_TONE[p.agentDefault]}>{MISSION_AGENT_META[p.agentDefault].corto}</Chip>
                </div>
                <p className="mt-2 flex flex-wrap gap-x-1.5 text-[11px] text-neutral-500">
                  <span>{MISSION_MODE_META[p.modeDefault].label}</span>{p.projectDefault && <><span>·</span><span>{data.projects.find((x) => x.slug === p.projectDefault)?.name ?? p.projectDefault}</span></>}
                  <span>·</span><span>{p.usageCount} usos{p.lastUsedAt ? ` · ${haceCuanto(p.lastUsedAt)}` : ''}</span>
                </p>
                {p.variables.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.variables.map((v) => <span key={v.key} className="rounded bg-white/5 px-1.5 font-mono text-[10px] text-neutral-400">{`{{${v.key}}}`}</span>)}</div>}
                <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-cyan-200/70" title="Aparece en el menú + de Claude Desktop y en Codex como prompt MCP"><Sparkles className="size-3" aria-hidden /> MCP <code className="font-mono">dev.{p.key}</code></p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                  <Boton tono="primario" className="h-8" onClick={() => onEjecutar(p)} data-testid={`devcenter-accion-ejecutar-${p.id}`}><Play className="size-3.5" aria-hidden /> Ejecutar</Boton>
                  <Boton className="h-8" onClick={() => setEditando(p)}><Pencil className="size-3.5" aria-hidden /> Editar</Boton>
                  <Boton tono="fantasma" className="h-8" onClick={() => void fijar(p)} title={p.pinned ? 'Quitar de fijados' : 'Fijar arriba'}>{p.pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}</Boton>
                  <Boton tono="fantasma" className="h-8 text-red-300" onClick={() => void borrar(p)} title="Borrar"><Trash2 className="size-3.5" aria-hidden /></Boton>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <EditorPrompt abierto={editando !== null} prompt={editando === 'nuevo' ? null : editando} proyectos={data?.projects ?? []} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); onChanged(); }} />
    </div>
  );
}

function ConectarEscritorio() {
  const [abierto, setAbierto] = useState(false);
  const codex = 'codex mcp add whatspro <URL-del-conector>';
  return (
    <section className={cn(tarjeta, 'mb-3 mt-1 p-3')} data-testid="devcenter-conectar-escritorio">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <ChevronDown className={cn('size-4 shrink-0 text-neutral-400 transition-transform', abierto && 'rotate-180')} aria-hidden />
        <span className="text-sm font-black">Conectar tu escritorio</span>
        <span className="ml-auto text-[11px] text-neutral-500">Claude Desktop · Codex</span>
      </button>
      {abierto && (
        <ol className="mt-3 space-y-2 text-xs text-neutral-300">
          <li className="flex gap-2"><span className="font-black text-emerald-300">1.</span><span>En WhatsPro, <a href="/plugins/claude-code-connector" className="font-bold text-emerald-300 underline">Conectores de IA</a>: creá (o copiá) la URL del conector MCP de tu usuario.</span></li>
          <li className="flex gap-2"><span className="font-black text-emerald-300">2.</span><span>En <b>Claude Desktop</b> → Ajustes → Conectores → «Agregar conector personalizado» → pegá la URL. En <b>Codex</b>, en una terminal: <code className="rounded bg-black/40 px-1 font-mono">{codex}</code> <button type="button" onClick={() => void navigator.clipboard?.writeText(codex)} className="ml-1 inline-flex items-center gap-1 text-emerald-300"><ClipboardCopy className="size-3" aria-hidden /> copiar</button></span></li>
          <li className="flex gap-2"><span className="font-black text-emerald-300">3.</span><span>Listo: los prompts <code className="font-mono">dev.*</code> aparecen en el menú «+» de Claude y las misiones en cola se toman con <code className="font-mono">whatspro_dev_missions</code>.</span></li>
        </ol>
      )}
    </section>
  );
}

function EditorPrompt({ abierto, prompt, proyectos, onCerrar, onGuardado }: { abierto: boolean; prompt: DevPromptRow | null; proyectos: DevCenterPayload['projects']; onCerrar: () => void; onGuardado: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [agentDefault, setAgentDefault] = useState<MissionAgent>('claude');
  const [projectDefault, setProjectDefault] = useState('');
  const [modeDefault, setModeDefault] = useState<MissionMode>('editar');
  const [meta, setMeta] = useState<Record<string, { label: string; placeholder: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setTitle(prompt?.title ?? ''); setDescription(prompt?.description ?? ''); setBody(prompt?.body ?? '');
    setAgentDefault(prompt?.agentDefault ?? 'claude'); setProjectDefault(prompt?.projectDefault ?? ''); setModeDefault(prompt?.modeDefault ?? 'editar');
    setMeta(Object.fromEntries((prompt?.variables ?? []).map((v) => [v.key, { label: v.label, placeholder: v.placeholder ?? '' }])));
    setError(null);
  }, [abierto, prompt]);

  // Las variables salen del cuerpo: escribir {{cliente}} crea el campo solo.
  const claves = useMemo(() => variablesDelCuerpo(body), [body]);
  const variables: PromptVariable[] = claves.map((key) => ({ key, label: meta[key]?.label?.trim() || key, ...(meta[key]?.placeholder?.trim() ? { placeholder: meta[key].placeholder.trim() } : {}) }));

  const guardar = async () => {
    if (title.trim().length < 3) return setError('Poné un título.');
    if (body.trim().length < 10) return setError('El cuerpo necesita al menos 10 caracteres.');
    setBusy(true); setError(null);
    const input = { title: title.trim(), body, description: description.trim() || null, agentDefault, projectDefault: projectDefault || null, modeDefault, variables };
    try { if (prompt) await editarPrompt(prompt.id, input); else await crearPrompt(input); onGuardado(); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); } finally { setBusy(false); }
  };

  return (
    <Hoja abierta={abierto} titulo={prompt ? 'Editar prompt' : 'Nuevo prompt'} onCerrar={onCerrar} testId="devcenter-hoja-prompt">
      <div className="space-y-4">
        <label className="block space-y-1"><span className={rotulo}>Título</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={control} data-testid="devcenter-prompt-campo-titulo" autoFocus /></label>
        <label className="block space-y-1"><span className={rotulo}>Descripción</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué sirve, en una línea" className={control} /></label>
        <label className="block space-y-1"><span className={rotulo}>Cuerpo — usá {'{{variable}}'} para los datos que cambian</span><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className={cn(control, 'h-auto py-2 font-mono text-xs leading-5')} data-testid="devcenter-prompt-campo-cuerpo" /></label>
        {claves.length > 0 && (
          <div className="space-y-2 rounded-xl border border-white/10 p-3">
            <p className={rotulo}>Variables detectadas</p>
            {claves.map((key) => (
              <div key={key} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
                <code className="font-mono text-[11px] text-neutral-300">{`{{${key}}}`}</code>
                <input value={meta[key]?.label ?? ''} onChange={(e) => setMeta((m) => ({ ...m, [key]: { label: e.target.value, placeholder: m[key]?.placeholder ?? '' } }))} placeholder="Etiqueta" className={cn(control, 'h-8 text-xs')} />
                <input value={meta[key]?.placeholder ?? ''} onChange={(e) => setMeta((m) => ({ ...m, [key]: { label: m[key]?.label ?? '', placeholder: e.target.value } }))} placeholder="Ejemplo" className={cn(control, 'h-8 text-xs')} />
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1"><span className={rotulo}>Agente por defecto</span><select value={agentDefault} onChange={(e) => setAgentDefault(e.target.value as MissionAgent)} className={control}>{MISSION_AGENTS.map((a) => <option key={a} value={a}>{MISSION_AGENT_META[a].label}</option>)}</select></label>
          <label className="block space-y-1"><span className={rotulo}>Proyecto</span><select value={projectDefault} onChange={(e) => setProjectDefault(e.target.value)} className={control}><option value="">Cualquiera</option>{proyectos.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
          <label className="block space-y-1"><span className={rotulo}>Modo</span><select value={modeDefault} onChange={(e) => setModeDefault(e.target.value as MissionMode)} className={control}>{MISSION_MODES.map((m) => <option key={m} value={m}>{MISSION_MODE_META[m].label}</option>)}</select></label>
        </div>
        {error && <p className="text-xs font-semibold text-red-300">{error}</p>}
        <div className="flex gap-2 pb-2"><Boton tono="primario" disabled={busy} onClick={() => void guardar()} data-testid="devcenter-accion-guardar-prompt">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Guardar</Boton><Boton tono="fantasma" onClick={onCerrar}>Cancelar</Boton></div>
      </div>
    </Hoja>
  );
}
