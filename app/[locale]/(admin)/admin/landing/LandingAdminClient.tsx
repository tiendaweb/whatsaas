'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { RotateCcw, Save, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { defaultLandingContent } from '@/lib/landing/default-content';
import type { LandingContentRecord, LandingFaqItem, LandingHomeSection } from '@/lib/landing/types';
import { resetLandingContent, updateLandingContent } from './landing-actions';

export function LandingAdminClient({
  initialContent,
}: {
  initialContent: LandingContentRecord;
}) {
  const [content, setContent] = useState(initialContent);
  const [isSavingContent, startSavingContent] = useTransition();
  const [isResetting, startResetting] = useTransition();

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
    });
  }

  return (
    <div className="space-y-8">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Landing principal</CardTitle>
            <CardDescription>
              Aquí editas únicamente el home y las FAQs. Las páginas internas ahora viven en un editor separado para trabajar una por una.
            </CardDescription>
          </div>
          <Link href="/admin/landing/pages">
            <Button variant="outline">
              Administrar páginas internas <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Home editable</CardTitle>
          <CardDescription>
            Edita las 3 secciones visuales del home con el mensaje comercial que verá el visitante.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {content.homeSections.map((section, index) => (
            <div key={section.id} className="rounded-2xl border border-border/60 p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Sección {index + 1}</h3>
                <p className="text-sm text-muted-foreground">El preview visual del home usa este contenido junto al mockup de UI.</p>
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
                    Quitar
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
              Agregar pregunta
            </Button>
            <Button onClick={handleSaveContent} disabled={isSavingContent}>
              <Save className="mr-2 h-4 w-4" /> {isSavingContent ? 'Guardando...' : 'Guardar FAQs'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
