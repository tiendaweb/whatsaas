'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Archive, ArrowLeft, Code2, Database, Eye, LayoutPanelTop, Loader2, Palette, Rocket, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AppMakerRuntime } from './AppMakerRuntime';
import { AppMakerDataModelEditor } from './AppMakerDataModelEditor';
import { AppMakerDesignEditor } from './AppMakerDesignEditor';
import { AppMakerComponentLibrary } from './AppMakerComponentLibrary';
import { cn } from '@/lib/utils';
import type { AppMakerRecord, ApplicationDefinition } from '../shared/contract';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Error ${response.status}`);
  return body;
};

export function AppMakerStudio({ slug }: { slug: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ app: AppMakerRecord }>(`/api/plugins/app-maker/apps/${encodeURIComponent(slug)}`, fetcher);
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState<'draft' | 'preview' | 'published' | 'archived' | null>(null);
  const [editor, setEditor] = useState<'model' | 'components' | 'design' | 'json'>('model');
  const [previewKey, setPreviewKey] = useState(0);
  useEffect(() => { if (data?.app) setSource(JSON.stringify(data.app.definition, null, 2)); }, [data?.app]);

  async function save(status: 'draft' | 'preview' | 'published') {
    if (!data?.app) return;
    let definition: unknown;
    try { definition = JSON.parse(source); } catch { toast.error('El JSON no es válido.'); return; }
    setSaving(status);
    try {
      const response = await fetch(`/api/plugins/app-maker/apps/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition, expectedVersion: data.app.version, status, summary: status === 'published' ? 'Publicación desde Studio' : 'Edición desde Studio' }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.details?.map((item: { path: string; message: string }) => `${item.path}: ${item.message}`).join('\n') ?? body?.error ?? 'No se pudo guardar.');
      await mutate();
      setPreviewKey((value) => value + 1);
      toast.success(status === 'published' ? 'Aplicación publicada' : status === 'preview' ? 'Preview actualizado' : 'Borrador guardado');
    } catch (saveError) { toast.error(saveError instanceof Error ? saveError.message : 'No se pudo guardar.'); } finally { setSaving(null); }
  }

  async function archive() {
    if (!window.confirm('¿Archivar esta aplicación? La versión publicada dejará de estar disponible.')) return;
    setSaving('archived');
    try {
      const response = await fetch(`/api/plugins/app-maker/apps/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo archivar.');
      window.location.href = '/plugins/app-maker';
    } catch (archiveError) { toast.error(archiveError instanceof Error ? archiveError.message : 'No se pudo archivar.'); setSaving(null); }
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Abriendo Studio…</div>;
  if (error || !data?.app) return <div className="m-6 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{error?.message ?? 'App no encontrada.'}</div>;

  let visualDefinition: ApplicationDefinition | null = null;
  try { visualDefinition = JSON.parse(source) as ApplicationDefinition; } catch { visualDefinition = null; }

  return (
    <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-muted/40">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-background px-3 py-3 sm:px-5">
        <a href="/plugins/app-maker" className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Volver"><ArrowLeft className="size-4" /></a>
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{data.app.name}</h1><p className="text-xs text-muted-foreground">Studio · v{data.app.version} · {data.app.status}</p></div>
        <Button size="sm" variant="outline" onClick={() => void save('draft')} disabled={saving !== null}>{saving === 'draft' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar</Button>
        <Button size="sm" variant="outline" onClick={() => void save('preview')} disabled={saving !== null}>{saving === 'preview' ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />} Preview</Button>
        <Button size="sm" onClick={() => void save('published')} disabled={saving !== null}>{saving === 'published' ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Publicar</Button>
        <Button size="icon" variant="ghost" onClick={() => void archive()} disabled={saving !== null} aria-label="Archivar"><Archive className="size-4" /></Button>
      </header>
      <div className={cn('grid min-h-0 flex-1 grid-cols-1', editor === 'json' ? 'xl:grid-cols-[minmax(360px,0.8fr)_minmax(620px,1.4fr)]' : 'xl:grid-cols-[minmax(680px,1.2fr)_minmax(520px,1fr)]')}>
        <section className="flex min-h-0 flex-col border-r bg-background">
          <header className="flex items-center justify-between gap-3 border-b px-4 py-3"><div className="flex items-center gap-2">{editor === 'design' ? <Palette className="size-4 text-primary" /> : editor === 'components' ? <LayoutPanelTop className="size-4 text-primary" /> : <Database className="size-4 text-primary" />}<div><h2 className="text-sm font-semibold">{editor === 'design' ? 'Diseño de la aplicación' : editor === 'components' ? 'Elementos disponibles' : 'Estructura de la aplicación'}</h2><p className="text-[11px] text-muted-foreground">Diseño, modelo y contrato JSON comparten la misma versión.</p></div></div><div className="flex border"><button type="button" onClick={() => setEditor('model')} className={cn('flex h-8 items-center gap-1.5 px-3 text-xs', editor === 'model' && 'bg-primary text-primary-foreground')}><Database className="size-3.5" />Modelo</button><button type="button" onClick={() => setEditor('components')} className={cn('flex h-8 items-center gap-1.5 border-l px-3 text-xs', editor === 'components' && 'bg-primary text-primary-foreground')}><LayoutPanelTop className="size-3.5" />Elementos</button><button type="button" onClick={() => setEditor('design')} className={cn('flex h-8 items-center gap-1.5 border-l px-3 text-xs', editor === 'design' && 'bg-primary text-primary-foreground')}><Palette className="size-3.5" />Diseño</button><button type="button" onClick={() => setEditor('json')} className={cn('flex h-8 items-center gap-1.5 border-l px-3 text-xs', editor === 'json' && 'bg-primary text-primary-foreground')}><Code2 className="size-3.5" />JSON</button></div></header>
          {editor === 'json' ? <Textarea value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} className="min-h-0 flex-1 resize-none rounded-none border-0 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 focus-visible:ring-0" aria-label="Definición JSON de la aplicación" /> : editor === 'components' ? <AppMakerComponentLibrary /> : visualDefinition ? editor === 'design' ? <AppMakerDesignEditor definition={visualDefinition} onChange={(next) => setSource(JSON.stringify(next, null, 2))} /> : <AppMakerDataModelEditor definition={visualDefinition} onChange={(next) => setSource(JSON.stringify(next, null, 2))} /> : <div className="flex flex-1 items-center justify-center p-8 text-center"><div><Code2 className="mx-auto size-6 text-destructive" /><p className="mt-3 text-sm font-semibold">El JSON no es válido</p><p className="mt-1 text-xs text-muted-foreground">Corregilo en la vista JSON para volver al modelador.</p><Button type="button" size="sm" variant="outline" className="mt-4" onClick={() => setEditor('json')}>Abrir JSON</Button></div></div>}
        </section>
        <section className="hidden min-h-0 overflow-auto p-4 xl:block"><div className="mb-2 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Preview conectado</h2><p className="text-[11px] text-muted-foreground">Guardá como Preview para actualizar datos, vistas y acciones.</p></div>{data.app.status === 'published' && <Button asChild size="sm" variant="outline"><a href={`/plugins/app-maker/run/${encodeURIComponent(slug)}`}><Eye className="size-4" /> Abrir publicada</a></Button>}</div><AppMakerRuntime key={previewKey} slug={slug} draft embedded /></section>
      </div>
    </div>
  );
}
