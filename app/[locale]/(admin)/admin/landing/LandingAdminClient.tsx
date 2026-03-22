'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { defaultLandingContent } from '@/lib/landing/default-content';
import type { LandingContentRecord, LandingFaqItem, LandingHomeSection } from '@/lib/landing/types';
import type { LandingPage } from '@/lib/db/schema';
import {
  createLandingPage,
  deleteLandingPage,
  resetLandingContent,
  updateLandingContent,
  updateLandingPage,
} from './landing-actions';

function createPageDraft() {
  return { name: '', slug: '', content: '' };
}

export function LandingAdminClient({
  initialContent,
  initialPages,
}: {
  initialContent: LandingContentRecord;
  initialPages: LandingPage[];
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [pages, setPages] = useState(initialPages);
  const [newPage, setNewPage] = useState(createPageDraft());
  const [isSavingContent, startSavingContent] = useTransition();
  const [isResetting, startResetting] = useTransition();
  const [isCreatingPage, startCreatingPage] = useTransition();
  const [savingPageId, setSavingPageId] = useState<number | null>(null);
  const [deletingPageId, setDeletingPageId] = useState<number | null>(null);

  const totalFaqs = useMemo(() => content.faqItems.length, [content.faqItems.length]);

  function updateSectionField(index: number, field: keyof Omit<LandingHomeSection, 'id' | 'bullets'>, value: string) {
    setContent((current) => ({
      ...current,
      homeSections: current.homeSections.map((section, currentIndex) =>
        currentIndex === index ? { ...section, [field]: value } : section,
      ),
    }));
  }

  function updateSectionBullets(index: number, raw: string) {
    setContent((current) => ({
      ...current,
      homeSections: current.homeSections.map((section, currentIndex) =>
        currentIndex === index
          ? {
              ...section,
              bullets: raw
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean),
            }
          : section,
      ),
    }));
  }

  function updateFaqItem(index: number, field: keyof Omit<LandingFaqItem, 'id'>, value: string) {
    setContent((current) => ({
      ...current,
      faqItems: current.faqItems.map((faq, currentIndex) =>
        currentIndex === index ? { ...faq, [field]: value } : faq,
      ),
    }));
  }

  function addFaqItem() {
    setContent((current) => ({
      ...current,
      faqItems: [
        ...current.faqItems,
        {
          id: `faq-${Date.now()}`,
          question: '',
          answer: '',
        },
      ],
    }));
  }

  function removeFaqItem(index: number) {
    setContent((current) => ({
      ...current,
      faqItems: current.faqItems.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  function handleSaveContent() {
    startSavingContent(async () => {
      const result = await updateLandingContent(content);
      if (!result.success) {
        toast.error('No se pudo guardar', { description: result.message });
        return;
      }
      toast.success('Landing actualizada', {
        description: 'Las secciones del home y FAQs ya están publicadas.',
      });
    });
  }

  function handleResetContent() {
    startResetting(async () => {
      const result = await resetLandingContent();
      if (!result.success) {
        toast.error('No se pudo restaurar', { description: result.message });
        return;
      }
      setContent(defaultLandingContent);
      toast.success('Contenido restaurado', {
        description: 'Se volvió al contenido base configurado para la landing.',
      });
      router.refresh();
    });
  }

  function handleCreatePage() {
    startCreatingPage(async () => {
      const result = await createLandingPage(newPage);
      if (!result.success) {
        toast.error('No se pudo crear la página', { description: result.message });
        return;
      }

      toast.success('Página creada', {
        description: `La página /${newPage.slug} ya está disponible en la landing.`,
      });
      setNewPage(createPageDraft());
      router.refresh();
    });
  }

  function handleUpdatePage(page: LandingPage) {
    setSavingPageId(page.id);
    void (async () => {
      const result = await updateLandingPage(page);
      setSavingPageId(null);
      if (!result.success) {
        toast.error('No se pudo guardar la página', { description: result.message });
        return;
      }
      toast.success('Página actualizada', {
        description: `Se guardaron los cambios de /${page.slug}.`,
      });
    })();
  }

  function handleDeletePage(page: LandingPage) {
    setDeletingPageId(page.id);
    void (async () => {
      const result = await deleteLandingPage(page.id);
      setDeletingPageId(null);
      if (!result.success) {
        toast.error('No se pudo eliminar', { description: result.message });
        return;
      }
      setPages((current) => current.filter((item) => item.id !== page.id));
      toast.success('Página eliminada', {
        description: `La ruta /${page.slug} fue removida.`,
      });
    })();
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Home editable</CardTitle>
          <CardDescription>
            Edita las 3 nuevas secciones tipo dashboard y administra el bloque de preguntas frecuentes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {content.homeSections.map((section, index) => (
            <div key={section.id} className="rounded-2xl border border-border/60 p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Sección {index + 1}</h3>
                <p className="text-sm text-muted-foreground">El preview visual del home usa este contenido y mantiene el mockup de UI al lado.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Badge / Eyebrow</Label>
                  <Input
                    value={section.eyebrow}
                    onChange={(event) => updateSectionField(index, 'eyebrow', event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Título</Label>
                  <Textarea
                    rows={3}
                    value={section.title}
                    onChange={(event) => updateSectionField(index, 'title', event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Descripción</Label>
                  <Textarea
                    rows={4}
                    value={section.description}
                    onChange={(event) => updateSectionField(index, 'description', event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Bullets (uno por línea)</Label>
                  <Textarea
                    rows={5}
                    value={section.bullets.join('\n')}
                    onChange={(event) => updateSectionBullets(index, event.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSaveContent} disabled={isSavingContent}>
              <Save className="mr-2 h-4 w-4" /> {isSavingContent ? 'Guardando...' : 'Guardar landing'}
            </Button>
            <Button type="button" variant="outline" onClick={handleResetContent} disabled={isResetting}>
              <RotateCcw className="mr-2 h-4 w-4" /> {isResetting ? 'Restaurando...' : 'Restaurar defaults'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preguntas frecuentes</CardTitle>
          <CardDescription>
            Actualmente tienes {totalFaqs} preguntas. La landing requiere al menos 15 respuestas publicadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {content.faqItems.map((item, index) => (
            <div key={item.id} className="rounded-2xl border border-border/60 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-semibold">Pregunta #{index + 1}</h3>
                {content.faqItems.length > 15 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeFaqItem(index)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Quitar
                  </Button>
                )}
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Pregunta</Label>
                  <Input
                    value={item.question}
                    onChange={(event) => updateFaqItem(index, 'question', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Respuesta</Label>
                  <Textarea
                    rows={4}
                    value={item.answer}
                    onChange={(event) => updateFaqItem(index, 'answer', event.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={addFaqItem}>
              <Plus className="mr-2 h-4 w-4" /> Agregar pregunta
            </Button>
            <Button onClick={handleSaveContent} disabled={isSavingContent}>
              <Save className="mr-2 h-4 w-4" /> {isSavingContent ? 'Guardando...' : 'Guardar FAQs'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Páginas adicionales</CardTitle>
          <CardDescription>
            Crea páginas nuevas con nombre, slug y contenido. Se publican automáticamente en la ruta indicada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5">
            <h3 className="text-lg font-semibold">Nueva página</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={newPage.name} onChange={(event) => setNewPage((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={newPage.slug} onChange={(event) => setNewPage((current) => ({ ...current, slug: event.target.value }))} placeholder="ej: nosotros" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Contenido</Label>
                <Textarea rows={8} value={newPage.content} onChange={(event) => setNewPage((current) => ({ ...current, content: event.target.value }))} />
              </div>
            </div>
            <Button className="mt-4" onClick={handleCreatePage} disabled={isCreatingPage}>
              <Plus className="mr-2 h-4 w-4" /> {isCreatingPage ? 'Creando...' : 'Crear página'}
            </Button>
          </div>

          <div className="space-y-4">
            {pages.length === 0 ? (
              <div className="rounded-2xl border border-border/60 p-6 text-sm text-muted-foreground">
                Aún no hay páginas adicionales. Crea una para mostrar rutas como /nosotros, /servicios o /partners.
              </div>
            ) : (
              pages.map((page, index) => (
                <div key={page.id} className="rounded-2xl border border-border/60 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">Página {index + 1}</h3>
                      <p className="text-sm text-muted-foreground">Disponible en /{page.slug}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => handleUpdatePage(page)} disabled={savingPageId === page.id}>
                        <Save className="mr-2 h-4 w-4" /> {savingPageId === page.id ? 'Guardando...' : 'Guardar'}
                      </Button>
                      <Button type="button" variant="destructive" onClick={() => handleDeletePage(page)} disabled={deletingPageId === page.id}>
                        <Trash2 className="mr-2 h-4 w-4" /> {deletingPageId === page.id ? 'Eliminando...' : 'Eliminar'}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nombre</Label>
                      <Input
                        value={page.name}
                        onChange={(event) => setPages((current) => current.map((item) => item.id === page.id ? { ...item, name: event.target.value } : item))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Slug</Label>
                      <Input
                        value={page.slug}
                        onChange={(event) => setPages((current) => current.map((item) => item.id === page.id ? { ...item, slug: event.target.value } : item))}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Contenido</Label>
                      <Textarea
                        rows={8}
                        value={page.content}
                        onChange={(event) => setPages((current) => current.map((item) => item.id === page.id ? { ...item, content: event.target.value } : item))}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
