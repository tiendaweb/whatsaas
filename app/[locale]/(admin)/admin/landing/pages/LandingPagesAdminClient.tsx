'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, PencilLine, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LandingPage } from '@/lib/db/schema';
import { createLandingPage, deleteLandingPage } from '../landing-actions';

function createPageDraft() {
  return { name: '', slug: '' };
}

export function LandingPagesAdminClient({ initialPages }: { initialPages: LandingPage[] }) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [draft, setDraft] = useState(createPageDraft());
  const [isCreating, startCreating] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function handleCreatePage() {
    startCreating(async () => {
      const result = await createLandingPage(draft);
      if (!result.success) {
        toast.error('No se pudo crear la página', { description: result.message });
        return;
      }

      toast.success('Página creada', {
        description: `Ahora puedes editar /${result.slug} con el builder visual.`,
      });
      setDraft(createPageDraft());
      router.push(`/admin/landing/pages/${result.pageId}`);
      router.refresh();
    });
  }

  function handleDeletePage(page: LandingPage) {
    setDeletingId(page.id);
    void (async () => {
      const result = await deleteLandingPage(page.id);
      setDeletingId(null);
      if (!result.success) {
        toast.error('No se pudo eliminar', { description: result.message });
        return;
      }
      setPages((current) => current.filter((item) => item.id !== page.id));
      toast.success('Página eliminada', {
        description: `La ruta /${page.slug} fue removida.`,
      });
      router.refresh();
    })();
  }

  return (
    <div className="space-y-8">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Páginas internas</CardTitle>
            <CardDescription>
              Cada página se edita por separado con un builder visual de 4 secciones reutilizables. Ya no tendrás todos los contenidos mezclados en lote.
            </CardDescription>
          </div>
          <Link href="/admin/landing">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver a landing principal
            </Button>
          </Link>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nueva página</CardTitle>
          <CardDescription>
            Crea la página y luego entrarás a su editor individual con hero, métricas, highlights y CTA final.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ej: Servicios" />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))} placeholder="ej: servicios" />
          </div>
          <div className="md:col-span-2">
            <Button onClick={handleCreatePage} disabled={isCreating}>
              <Plus className="mr-2 h-4 w-4" /> {isCreating ? 'Creando...' : 'Crear y abrir editor'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {pages.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Aún no hay páginas adicionales. Crea la primera y te llevamos directo a su editor visual.
            </CardContent>
          </Card>
        ) : (
          pages.map((page) => (
            <Card key={page.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <FileText className="h-5 w-5 text-primary" /> {page.name}
                    </CardTitle>
                    <CardDescription className="mt-1">/{page.slug}</CardDescription>
                  </div>
                  <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    4 secciones builder
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                  Edita esta página individualmente con bloques reutilizables del sistema: hero, métricas, highlights y CTA final.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/landing/pages/${page.id}`}>
                    <Button variant="outline">
                      <PencilLine className="mr-2 h-4 w-4" /> Editar página
                    </Button>
                  </Link>
                  <Button variant="destructive" onClick={() => handleDeletePage(page)} disabled={deletingId === page.id}>
                    <Trash2 className="mr-2 h-4 w-4" /> {deletingId === page.id ? 'Eliminando...' : 'Eliminar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
