'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Archive, Blocks, ExternalLink, Eye, LayoutGrid, LayoutTemplate, Loader2, PanelsTopLeft, Plus, Rocket, Search, Settings2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { APPS_AGRUPADAS } from '../shared/agrupadas';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Error ${response.status}`);
  return body;
};

type AppSummary = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  accent: string;
  status: 'draft' | 'preview' | 'published' | 'archived';
  version: number;
  publishedVersion: number | null;
  updatedAt: string;
};

type Catalog = {
  templates: Array<{ key: string; name: string; description: string; preview: { views: string[]; accent: string } }>;
  resources: Array<{ key: string }>;
  connectors: Array<{ key: string; operations: string[] }>;
  blocks: Array<{ type: string }>;
  formFields: Array<{ type: string }>;
  charts: Array<{ type: string }>;
  designTemplates: Array<{ key: string }>;
};

const ACCENT_DOT: Record<string, string> = {
  emerald: 'bg-emerald-500', blue: 'bg-blue-500', violet: 'bg-violet-500', rose: 'bg-rose-500', amber: 'bg-amber-500', slate: 'bg-slate-500',
};

/** Los iconos de lo agrupado. El nombre viaja como texto en la lista. */
const ICONOS_AGRUPADAS: Record<string, LucideIcon> = { PanelsTopLeft, LayoutGrid };

export function AppMakerDashboard() {
  const { data, error, isLoading, mutate } = useSWR<{ apps: AppSummary[] }>('/api/plugins/app-maker/apps', fetcher);
  const { data: catalog } = useSWR<Catalog>('/api/plugins/app-maker/catalog', fetcher);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const apps = (data?.apps ?? []).filter((app) => `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(query.toLowerCase()));

  async function createFromTemplate(template: Catalog['templates'][number]) {
    const suggestedSlug = `${template.key}-${Date.now().toString().slice(-5)}`;
    const slug = window.prompt('Slug único de la aplicación', suggestedSlug)?.trim();
    if (!slug) return;
    const name = window.prompt('Nombre visible', template.name)?.trim();
    if (!name) return;
    setCreating(template.key);
    try {
      const response = await fetch('/api/plugins/app-maker/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey: template.key, slug, name }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.details?.[0]?.message ?? body?.error ?? 'No se pudo crear la app.');
      await mutate();
      window.location.href = `/plugins/app-maker/apps/${encodeURIComponent(slug)}`;
    } catch (creationError) {
      toast.error(creationError instanceof Error ? creationError.message : 'No se pudo crear la app.');
    } finally { setCreating(null); }
  }

  return (
    <div className="h-screen overflow-y-auto bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Blocks className="size-5" /></span>
            <div><h1 className="text-xl font-bold">APP MAKER</h1><p className="text-sm text-muted-foreground">Creá aplicaciones internas sobre datos y acciones reales de WhatsPro.</p></div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border px-2.5 py-1">{catalog?.blocks.length ?? '—'} bloques</span>
            <span className="rounded-full border px-2.5 py-1">{catalog?.designTemplates.length ?? '—'} diseños</span>
            <span className="rounded-full border px-2.5 py-1">{catalog?.resources.length ?? '—'} fuentes</span>
            <span className="rounded-full border px-2.5 py-1">{catalog?.connectors.length ?? '—'} conector</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6">
        {/* Lo que el equipo ya construye por otros medios. Vive acá adentro
            porque es el mismo trabajo —armar algo y publicarlo— y tenerlo en
            tres iconos sueltos del lanzador escondía que son lo mismo. */}
        <section className="space-y-3" aria-labelledby="am-agrupadas">
          <div>
            <h2 id="am-agrupadas" className="text-base font-semibold">Lo que ya construiste</h2>
            <p className="text-xs text-muted-foreground">Sitios publicados y mini apps instaladas, junto con lo que armes acá.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {APPS_AGRUPADAS.map((app) => {
              const Icono = ICONOS_AGRUPADAS[app.icono] ?? Blocks;
              return (
                <a key={app.href} href={app.href} className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icono className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><span className="font-semibold">{app.label}</span><ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></span>
                    <span className="mt-1 block text-sm text-muted-foreground">{app.descripcion}</span>
                  </span>
                </a>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div><h2 className="text-base font-semibold">Comenzar desde una estructura</h2><p className="text-xs text-muted-foreground">Dos apps distintas, sin frontend específico: el mismo runtime resuelve ambas definiciones.</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            {catalog?.templates.map((template) => <article key={template.key} className="rounded-xl border bg-card p-4"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><LayoutTemplate className="size-5" /></span><div className="min-w-0 flex-1"><h3 className="font-semibold">{template.name}</h3><p className="mt-1 text-sm text-muted-foreground">{template.description}</p><div className="mt-3 flex flex-wrap gap-1.5">{template.preview.views.map((view) => <span key={view} className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{view}</span>)}</div></div><Button size="sm" onClick={() => void createFromTemplate(template)} disabled={creating !== null}>{creating === template.key ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Crear</Button></div></article>)}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-semibold">Tus aplicaciones</h2><p className="text-xs text-muted-foreground">Borradores, previews y versiones publicadas.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar aplicación…" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
          {isLoading ? <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando apps…</div> : error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div> : apps.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center"><Blocks className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Todavía no hay aplicaciones</p><p className="mt-1 text-xs text-muted-foreground">Elegí una plantilla para crear una definición editable y versionada.</p></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{apps.map((app) => <AppCard key={app.slug} app={app} />)}</div>}
        </section>
      </main>
    </div>
  );
}

function AppCard({ app }: { app: AppSummary }) {
  const status = app.status === 'published' ? { label: 'Publicada', icon: Rocket, className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' } : app.status === 'preview' ? { label: 'Preview', icon: Eye, className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' } : { label: 'Borrador', icon: Settings2, className: 'bg-muted text-muted-foreground' };
  const StatusIcon = status.icon;
  return <article className="flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"><div className="flex items-start gap-3"><span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted"><Blocks className="size-5" /><span className={cn('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card', ACCENT_DOT[app.accent] ?? ACCENT_DOT.slate)} /></span><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{app.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{app.category} · v{app.version}</p></div><span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold', status.className)}><StatusIcon className="size-3" />{status.label}</span></div><p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">{app.description || 'Aplicación interna sin descripción.'}</p><div className="mt-4 flex gap-2"><Button asChild size="sm" className="flex-1"><a href={`/plugins/app-maker/${app.status === 'published' ? 'run' : 'apps'}/${encodeURIComponent(app.slug)}`}>{app.status === 'published' ? <Eye className="size-4" /> : <Settings2 className="size-4" />}{app.status === 'published' ? 'Abrir' : 'Editar'}</a></Button>{app.status === 'published' && <Button asChild size="sm" variant="outline"><a href={`/plugins/app-maker/apps/${encodeURIComponent(app.slug)}`} aria-label="Editar"><Settings2 className="size-4" /></a></Button>}</div></article>;
}
