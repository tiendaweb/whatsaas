'use client';

import { useState } from 'react';
import { Check, ClipboardCopy, ExternalLink, FolderGit2, Loader2, TerminalSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TerminalAutoOpen } from '@/components/admin/terminal/TerminalWorkspace';
import { MISSION_AGENT_META, MISSION_STATUS_META } from '../shared/types';
import type { DevCenterPayload } from './api';
import { AGENT_TONE, Boton, Chip, STATUS_TONE, rotulo, tarjeta } from './atomos';

const ORDEN_COMANDOS = ['install', 'build', 'test', 'deploy'];

/**
 * Proyectos: el registro de `config/terminal-projects.json` tal cual, con lo
 * que alguien necesita antes de tocar: stack, rama, dónde está y con qué
 * comandos se instala, compila, prueba y despliega. «Abrir terminal acá» abre
 * una shell en esa carpeta.
 */
export function Proyectos({ data, onAbrirTerminal }: { data: DevCenterPayload | undefined; onAbrirTerminal: (pedido: Omit<TerminalAutoOpen, 'key'>) => void }) {
  if (!data) return <div className="flex min-h-[240px] items-center justify-center text-neutral-500"><Loader2 className="size-5 animate-spin" /></div>;
  return (
    <div className="h-full min-h-0 overflow-y-auto px-3 pb-6 sm:px-5">
      <div className="py-3"><h2 className="text-base font-black">Proyectos</h2><p className="text-[11px] text-neutral-500">{data.projects.length} en el registro · el navegador nunca elige rutas: elige un proyecto</p></div>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.projects.map((p) => {
          const abiertas = data.missions.filter((m) => m.project === p.slug);
          return (
            <article key={p.slug} data-testid={`devcenter-proyecto-${p.slug}`} className={cn(tarjeta, 'p-4')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-black"><FolderGit2 className="size-4 text-emerald-300" aria-hidden /> {p.name}</p><p className="mt-0.5 font-mono text-[11px] text-neutral-500">{p.cwd}</p></div>
                <a href={p.productionUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-emerald-300 hover:underline">producción <ExternalLink className="size-3" aria-hidden /></a>
              </div>
              <p className="mt-2 text-xs text-neutral-400">{p.stack} · rama <code className="font-mono">{p.defaultBranch}</code> · máx. {p.maxSessions} terminales</p>
              <div className="mt-2 flex flex-wrap gap-1">{p.agents.map((a) => (a === 'claude' || a === 'codex') && <Chip key={a} className={AGENT_TONE[a]}>{MISSION_AGENT_META[a].corto}</Chip>)}</div>
              <div className="mt-3 space-y-1">
                <p className={rotulo}>Comandos</p>
                {ORDEN_COMANDOS.filter((k) => p.commands[k]).map((k) => <Comando key={k} nombre={k} valor={p.commands[k]} />)}
              </div>
              {abiertas.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className={rotulo}>Misiones abiertas · {abiertas.length}</p>
                  {abiertas.slice(0, 5).map((m) => <p key={m.id} className="flex items-center gap-2 text-xs text-neutral-300"><Chip className={STATUS_TONE[m.status]}>{MISSION_STATUS_META[m.status].label}</Chip><span className="truncate">{m.title}</span></p>)}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Boton tono="primario" className="h-8" onClick={() => onAbrirTerminal({ project: p.slug, mode: 'shell', title: `${p.name} · shell` })} data-testid={`devcenter-accion-terminal-${p.slug}`}><TerminalSquare className="size-3.5" aria-hidden /> Abrir terminal acá</Boton>
                {p.agents.includes('claude') && <Boton className="h-8" onClick={() => onAbrirTerminal({ project: p.slug, mode: 'claude', title: `${p.name} · Claude` })}>Claude Code</Boton>}
                {p.agents.includes('codex') && <Boton className="h-8" onClick={() => onAbrirTerminal({ project: p.slug, mode: 'codex', title: `${p.name} · Codex` })}>Codex</Boton>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Comando({ nombre, valor }: { nombre: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1">
      <span className="w-14 shrink-0 text-[10px] font-black uppercase text-neutral-500">{nombre}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-200" title={valor}>{valor}</code>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(valor).then(() => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1200); }); }} className="text-neutral-400 hover:text-white" aria-label={`Copiar ${nombre}`}>{copiado ? <Check className="size-3.5 text-emerald-300" /> : <ClipboardCopy className="size-3.5" />}</button>
    </div>
  );
}
