'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { LandingPage } from '@/lib/db/schema';
import type { LandingPageSection } from '@/lib/landing/types';
import { updateLandingPage } from '../../landing-actions';

function encodeStats(items: { value: string; label: string; description: string }[]) {
  return items.map((item) => `${item.value} | ${item.label} | ${item.description}`).join('\n');
}

function decodeStats(raw: string, current: Extract<LandingPageSection, { type: 'stats' }>['items']) {
  return raw
    .split('\n')
    .map((line, index) => {
      const [value = '', label = '', description = ''] = line.split('|').map((item) => item.trim());
      return {
        id: current[index]?.id ?? `stat-${index + 1}`,
        value,
        label,
        description,
      };
    })
    .filter((item) => item.value || item.label || item.description)
    .slice(0, 3);
}

function encodeHighlights(items: { title: string; description: string }[]) {
  return items.map((item) => `${item.title} | ${item.description}`).join('\n');
}

function decodeHighlights(raw: string, current: Extract<LandingPageSection, { type: 'highlights' }>['items']) {
  return raw
    .split('\n')
    .map((line, index) => {
      const [title = '', description = ''] = line.split('|').map((item) => item.trim());
      return {
        id: current[index]?.id ?? `highlight-${index + 1}`,
        title,
        description,
      };
    })
    .filter((item) => item.title || item.description)
    .slice(0, 4);
}

function getSectionName(section: LandingPageSection) {
  if (section.type === 'hero') return 'Hero';
  if (section.type === 'stats') return 'Métricas';
  if (section.type === 'highlights') return 'Highlights';
  return 'CTA final';
}

export function LandingPageEditorClient({ initialPage }: { initialPage: LandingPage }) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [isSaving, startSaving] = useTransition();

  const sectionSummary = useMemo(
    () => page.sections.map((section) => ({ id: section.id, label: getSectionName(section), title: section.title })),
    [page.sections],
  );

  function updateSection(sectionId: string, updater: (section: LandingPageSection) => LandingPageSection) {
    setPage((current) => ({
      ...current,
      sections: current.sections.map((section) => (section.id === sectionId ? updater(section) : section)),
    }));
  }

  function handleSave() {
    startSaving(async () => {
      const result = await updateLandingPage(page);
      if (!result.success) {
        toast.error('No se pudo guardar la página', { description: result.message });
        return;
      }

      toast.success('Página actualizada', {
        description: `Se guardaron los cambios de /${result.slug}.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>{page.name}</CardTitle>
            <CardDescription>
              Editor individual con builder visual de 4 secciones reutilizadas del sistema. Ruta pública: /{page.slug}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/landing/pages">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver a páginas
              </Button>
            </Link>
            <Link href={`/${page.slug}`} target="_blank">
              <Button variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" /> Ver pública
              </Button>
            </Link>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Guardando...' : 'Guardar página'}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos base</CardTitle>
          <CardDescription>
            Cambia nombre, slug y el texto de apoyo legacy. El constructor principal vive en las 4 secciones de abajo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={page.name} onChange={(event) => setPage((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={page.slug} onChange={(event) => setPage((current) => ({ ...current, slug: event.target.value }))} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Contenido legacy / notas extra</Label>
            <Textarea rows={5} value={page.content} onChange={(event) => setPage((current) => ({ ...current, content: event.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>Mapa visual</CardTitle>
            <CardDescription>Estas son las 4 secciones activas de esta página.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sectionSummary.map((section, index) => (
              <div key={section.id} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Bloque {index + 1}</p>
                <p className="mt-2 font-medium">{section.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{section.title}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {page.sections.map((section) => {
            if (section.type === 'hero') {
              return (
                <Card key={section.id}>
                  <CardHeader>
                    <CardTitle>Builder · Hero</CardTitle>
                    <CardDescription>Reutiliza el bloque de apertura y CTA principal del sistema.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
                      <p className="text-xs uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
                      <h3 className="mt-3 text-2xl font-bold">{section.title}</h3>
                      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{section.description}</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Eyebrow</Label>
                        <Input value={section.eyebrow} onChange={(event) => updateSection(section.id, (current) => ({ ...current, eyebrow: event.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Título</Label>
                        <Textarea rows={3} value={section.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Descripción</Label>
                        <Textarea rows={4} value={section.description} onChange={(event) => updateSection(section.id, (current) => ({ ...current, description: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>CTA principal</Label>
                        <Input value={section.primaryCtaLabel} onChange={(event) => updateSection(section.id, (current) => ({ ...current, primaryCtaLabel: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>URL CTA principal</Label>
                        <Input value={section.primaryCtaHref} onChange={(event) => updateSection(section.id, (current) => ({ ...current, primaryCtaHref: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>CTA secundaria</Label>
                        <Input value={section.secondaryCtaLabel} onChange={(event) => updateSection(section.id, (current) => ({ ...current, secondaryCtaLabel: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>URL CTA secundaria</Label>
                        <Input value={section.secondaryCtaHref} onChange={(event) => updateSection(section.id, (current) => ({ ...current, secondaryCtaHref: event.target.value }))} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            if (section.type === 'stats') {
              return (
                <Card key={section.id}>
                  <CardHeader>
                    <CardTitle>Builder · Métricas</CardTitle>
                    <CardDescription>Recicla la franja de impacto del home para contar resultados rápidos.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Eyebrow</Label>
                        <Input value={section.eyebrow} onChange={(event) => updateSection(section.id, (current) => ({ ...current, eyebrow: event.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Título</Label>
                        <Textarea rows={3} value={section.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Descripción</Label>
                        <Textarea rows={4} value={section.description} onChange={(event) => updateSection(section.id, (current) => ({ ...current, description: event.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Métricas (formato: valor | etiqueta | descripción)</Label>
                        <Textarea
                          rows={5}
                          value={encodeStats(section.items)}
                          onChange={(event) => updateSection(section.id, (current) => current.type === 'stats' ? { ...current, items: decodeStats(event.target.value, current.items) } : current)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            if (section.type === 'highlights') {
              return (
                <Card key={section.id}>
                  <CardHeader>
                    <CardTitle>Builder · Highlights</CardTitle>
                    <CardDescription>Reutiliza tarjetas informativas del sistema para vender beneficios sin código.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Eyebrow</Label>
                        <Input value={section.eyebrow} onChange={(event) => updateSection(section.id, (current) => ({ ...current, eyebrow: event.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Título</Label>
                        <Textarea rows={3} value={section.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Descripción</Label>
                        <Textarea rows={4} value={section.description} onChange={(event) => updateSection(section.id, (current) => ({ ...current, description: event.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Tarjetas (formato: título | descripción)</Label>
                        <Textarea
                          rows={6}
                          value={encodeHighlights(section.items)}
                          onChange={(event) => updateSection(section.id, (current) => current.type === 'highlights' ? { ...current, items: decodeHighlights(event.target.value, current.items) } : current)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle>Builder · CTA final</CardTitle>
                  <CardDescription>Cierra la página con el bloque final que ya usas en la landing principal.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Eyebrow</Label>
                      <Input value={section.eyebrow} onChange={(event) => updateSection(section.id, (current) => ({ ...current, eyebrow: event.target.value }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Título</Label>
                      <Textarea rows={3} value={section.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Descripción</Label>
                      <Textarea rows={4} value={section.description} onChange={(event) => updateSection(section.id, (current) => ({ ...current, description: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Texto del botón</Label>
                      <Input value={section.primaryCtaLabel} onChange={(event) => updateSection(section.id, (current) => ({ ...current, primaryCtaLabel: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>URL del botón</Label>
                      <Input value={section.primaryCtaHref} onChange={(event) => updateSection(section.id, (current) => ({ ...current, primaryCtaHref: event.target.value }))} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
