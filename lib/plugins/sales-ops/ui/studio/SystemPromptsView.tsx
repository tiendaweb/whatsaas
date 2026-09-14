'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, FileCode2, FileText, History, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export type SystemPromptModule = { id: string; label: string; description: string };
export type SystemPromptVersion = {
  id: number | null;
  version: number;
  status: 'active' | 'retired' | 'default';
  title: string;
  systemPrompt: string;
  userTemplate: string;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: number | null;
};
export type SystemPromptDocument = {
  key: string;
  title: string;
  module: string;
  description: string;
  filePath: string;
  variables: string[];
  toolChain: string[];
  active: {
    id: number | null;
    key: string;
    version: number;
    title: string;
    systemPrompt: string;
    userTemplate: string;
    source: 'db' | 'default';
  };
  versions: SystemPromptVersion[];
};
export type SystemPromptsPayload = { teamId: number; modules: SystemPromptModule[]; prompts: SystemPromptDocument[] };

type Props = {
  data?: SystemPromptsPayload;
  isLoading: boolean;
  moduleId: string | null;
  promptKey: string | null;
  onSelectModule: (moduleId: string) => void;
  onSelectPrompt: (key: string) => void;
  onSaved: () => Promise<unknown> | void;
};

const fecha = (value: string | null) =>
  value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Archivo base';

export function SystemPromptsView({ data, isLoading, moduleId, promptKey, onSelectModule, onSelectPrompt, onSaved }: Props) {
  const modules = data?.modules ?? [];
  const currentModule = moduleId && modules.some((item) => item.id === moduleId) ? moduleId : modules[0]?.id ?? '';
  const documents = useMemo(() => (data?.prompts ?? []).filter((item) => item.module === currentModule), [data?.prompts, currentModule]);
  const document = documents.find((item) => item.key === promptKey) ?? documents[0] ?? null;
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userTemplate, setUserTemplate] = useState('');
  const [notes, setNotes] = useState('');
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!document) return;
    setSystemPrompt(document.active.systemPrompt);
    setUserTemplate(document.active.userTemplate);
    setNotes('');
    setViewingVersion(document.active.version);
  }, [document?.key, document?.active.version, document?.active.systemPrompt, document?.active.userTemplate]);

  useEffect(() => {
    if (!moduleId && modules[0]) onSelectModule(modules[0].id);
  }, [moduleId, modules, onSelectModule]);

  useEffect(() => {
    if (document && document.key !== promptKey) onSelectPrompt(document.key);
  }, [document, promptKey, onSelectPrompt]);

  if (isLoading && !data) {
    return <div className="grid min-h-[560px] animate-pulse gap-3 lg:grid-cols-[240px_minmax(0,1fr)_210px]"><div className="rounded-2xl bg-white/5" /><div className="rounded-2xl bg-white/5" /><div className="rounded-2xl bg-white/5" /></div>;
  }
  if (!document) return <div className="grid min-h-[420px] place-items-center rounded-2xl border border-[var(--ps-line)] text-sm text-muted-foreground">No hay documentos en este módulo.</div>;

  const dirty = systemPrompt !== document.active.systemPrompt || userTemplate !== document.active.userTemplate;
  const latestVersion = Math.max(0, ...document.versions.map((item) => item.version));

  const openVersion = (version: SystemPromptVersion) => {
    setSystemPrompt(version.systemPrompt);
    setUserTemplate(version.userTemplate);
    setNotes(version.notes ?? '');
    setViewingVersion(version.version);
  };

  const reset = () => {
    setSystemPrompt(document.active.systemPrompt);
    setUserTemplate(document.active.userTemplate);
    setNotes('');
    setViewingVersion(document.active.version);
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/plugins/sales-ops/prompts/system/${encodeURIComponent(document.key)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemPrompt, userTemplate, notes: notes || null, expectedVersion: latestVersion }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar.');
      await onSaved();
      toast.success(`Versión ${payload.version} activa para este equipo.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Módulos de prompts">
        {modules.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelectModule(item.id)} className={cn('whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold', currentModule === item.id ? 'border-[var(--ps-line-strong)] bg-[var(--ps-accent-wash)] text-[var(--ps-accent-soft)]' : 'border-[var(--ps-line)] text-muted-foreground')}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_220px]">
        <aside className="rounded-2xl border border-[var(--ps-line)] bg-[rgba(255,255,255,0.018)] p-2">
          <div className="px-2 pb-2 pt-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ps-dim)]">Documentos</p>
            <p className="mt-1 text-xs text-muted-foreground">{documents.length} {documents.length === 1 ? 'prompt' : 'prompts'} en este módulo</p>
          </div>
          <div className="space-y-1">
            {documents.map((item) => (
              <button key={item.key} type="button" onClick={() => onSelectPrompt(item.key)} className={cn('w-full rounded-xl px-3 py-3 text-left transition-colors', item.key === document.key ? 'bg-[var(--ps-accent-wash)] shadow-[inset_0_0_0_1px_var(--ps-line-strong)]' : 'hover:bg-white/[0.035]')}>
                <span className="flex items-start gap-2"><FileText className="mt-0.5 size-4 shrink-0 text-[var(--ps-accent-soft)]" /><span className="min-w-0"><span className="block text-[13px] font-semibold leading-snug">{item.title}</span><span className="mt-1 block truncate font-mono text-[10px] text-[var(--ps-dim)]">{item.key}</span></span></span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-[var(--ps-line)] bg-[rgba(255,255,255,0.018)]">
          <div className="flex flex-wrap items-start gap-3 border-b border-[var(--ps-line)] px-4 py-4 sm:px-5">
            <div className="min-w-[220px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{document.title}</h2>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', document.active.source === 'db' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-[var(--ps-line-strong)] bg-[var(--ps-accent-wash)] text-[var(--ps-accent-soft)]')}>
                  {document.active.source === 'db' ? `Equipo · v${document.active.version}` : 'Archivo base'}
                </span>
                {dirty && <span className="size-1.5 rounded-full bg-amber-400" title="Cambios sin guardar" />}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{document.description}</p>
              <p className="mt-2 flex items-center gap-1.5 truncate font-mono text-[10px] text-[var(--ps-dim)]"><FileCode2 className="size-3" />{document.filePath}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" disabled={!dirty || saving} onClick={reset}><RotateCcw className="size-3.5" />Descartar</Button>
              <Button size="sm" className="h-8 gap-1.5 rounded-lg font-semibold" disabled={!dirty || saving} onClick={() => void save()}><Save className="size-3.5" />{saving ? 'Guardando…' : 'Guardar versión'}</Button>
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-5">
            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold">Instrucciones del sistema</span><span className="font-mono text-[10px] tabular-nums text-[var(--ps-dim)]">{systemPrompt.length.toLocaleString('es-AR')} caracteres</span></span>
              <textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} spellCheck={false} className="min-h-[310px] w-full resize-y rounded-xl border border-[var(--ps-line)] bg-[#0d0910] px-3.5 py-3 font-mono text-[12px] leading-5 text-foreground outline-none transition focus:border-[var(--ps-accent)] focus:ring-2 focus:ring-[var(--ps-accent-wash)]" />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold">Plantilla de entrada</span><span className="text-[10px] text-[var(--ps-dim)]">Se completa en el servidor</span></span>
              <textarea value={userTemplate} onChange={(event) => setUserTemplate(event.target.value)} spellCheck={false} className="min-h-[170px] w-full resize-y rounded-xl border border-[var(--ps-line)] bg-[#0d0910] px-3.5 py-3 font-mono text-[12px] leading-5 text-foreground outline-none transition focus:border-[var(--ps-accent)] focus:ring-2 focus:ring-[var(--ps-accent-wash)]" />
            </label>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ps-dim)]">Variables disponibles</p>
              <div className="flex flex-wrap gap-1.5">{document.variables.map((variable) => <code key={variable} className="rounded-md border border-[var(--ps-line)] bg-white/[0.025] px-2 py-1 text-[10px] text-[var(--ps-accent-soft)]">{'{{'}{variable}{'}}'}</code>)}</div>
            </div>
            <label className="block"><span className="mb-2 block text-xs font-semibold">Nota de esta versión <span className="font-normal text-muted-foreground">(opcional)</span></span><input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} placeholder="Qué cambió y por qué" className="h-10 w-full rounded-xl border border-[var(--ps-line)] bg-[#0d0910] px-3 text-sm outline-none focus:border-[var(--ps-accent)]" /></label>
          </div>
        </section>

        <aside className="rounded-2xl border border-[var(--ps-line)] bg-[rgba(255,255,255,0.018)] p-3">
          <div className="flex items-center gap-2 px-1 pb-3"><History className="size-4 text-[var(--ps-accent-soft)]" /><div><p className="text-xs font-semibold">Historial</p><p className="text-[10px] text-[var(--ps-dim)]">Cada guardado crea una versión</p></div></div>
          <div className="space-y-1.5">
            {document.versions.map((version) => {
              const selected = viewingVersion === version.version;
              return <button key={`${version.id ?? 'base'}-${version.version}`} type="button" onClick={() => openVersion(version)} className={cn('w-full rounded-xl border px-3 py-2.5 text-left transition-colors', selected ? 'border-[var(--ps-line-strong)] bg-[var(--ps-accent-wash)]' : 'border-transparent hover:border-[var(--ps-line)] hover:bg-white/[0.025]')}>
                <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-xs font-semibold">{version.status === 'active' ? <Check className="size-3.5 text-emerald-400" /> : version.status === 'default' ? <ShieldCheck className="size-3.5 text-[var(--ps-accent-soft)]" /> : <Clock3 className="size-3.5 text-[var(--ps-dim)]" />}{version.version === 0 ? 'Base' : `Versión ${version.version}`}</span>{version.status === 'active' && <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">Activa</span>}</span>
                <span className="mt-1 block text-[10px] text-[var(--ps-dim)]">{fecha(version.updatedAt ?? version.createdAt)}</span>
                {version.notes && <span className="mt-1.5 line-clamp-2 block text-[10px] leading-relaxed text-muted-foreground">{version.notes}</span>}
              </button>;
            })}
          </div>
          {viewingVersion !== document.active.version && <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-[10px] leading-relaxed text-amber-100/70">Estás viendo una versión anterior. Si la guardás, se crea una nueva versión activa.</p>}
        </aside>
      </div>
    </div>
  );
}
