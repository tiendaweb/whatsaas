'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Layers, Loader2, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';

type Attribute = {
  id: number;
  name: string;
  values: string[];
};

type AttributeFormData = {
  id?: number;
  name: string;
  values: string[];
};

const EMPTY_FORM: AttributeFormData = { name: '', values: [] };

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export function ArticleAttributesSettings() {
  const { data, mutate } = useSWR<Attribute[]>('/api/plugins/article-attributes', fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AttributeFormData | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Attribute | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const attributes = data ?? [];

  function handleNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function handleEdit(attr: Attribute) {
    setEditing({ id: attr.id, name: attr.name, values: attr.values });
    setFormOpen(true);
  }

  async function handleSave(form: AttributeFormData) {
    const res = await fetch(form.id ? `/api/plugins/article-attributes/${form.id}` : '/api/plugins/article-attributes', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, values: form.values }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || 'No se pudo guardar el atributo');
      return false;
    }
    toast.success(form.id ? 'Atributo actualizado' : 'Atributo creado');
    mutate();
    return true;
  }

  async function handleDelete() {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/plugins/article-attributes/${toDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('No se pudo eliminar el atributo');
        return;
      }
      toast.success('Atributo eliminado');
      mutate();
    } finally {
      setIsDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/plugins/articles" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-1">
              <ArrowLeft className="h-3 w-3" /> Volver a Artículos
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">Atributos reutilizables</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ej. Color, Talla. Un artículo puede usarlos opcionalmente para generar variaciones con su propio precio/stock.
            </p>
          </div>
          <Button size="sm" onClick={handleNew} className="h-9 gap-1.5 px-3 text-sm">
            <Plus className="h-3.5 w-3.5" />
            Nuevo atributo
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {attributes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">Sin atributos</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">Crea tu primer atributo, por ejemplo &quot;Color&quot;.</p>
            <Button size="sm" onClick={handleNew} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nuevo atributo
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {attributes.map(attr => (
              <div key={attr.id} className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{attr.name}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {attr.values.map(v => (
                      <Badge key={v} variant="outline" className="text-xs font-normal">{v}</Badge>
                    ))}
                    {attr.values.length === 0 && <span className="text-xs text-muted-foreground/50">Sin valores</span>}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => handleEdit(attr)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setToDelete(attr)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      <AttributeFormDialog open={formOpen} onOpenChange={setFormOpen} onSave={handleSave} initialData={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este atributo?</AlertDialogTitle>
            <AlertDialogDescription>
              Los artículos que lo usen dejarán de mostrarlo como opción. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AttributeFormDialog({
  open,
  onOpenChange,
  onSave,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: AttributeFormData) => Promise<boolean>;
  initialData?: AttributeFormData;
}) {
  const [form, setForm] = useState<AttributeFormData>(EMPTY_FORM);
  const [valueInput, setValueInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function addValue() {
    const v = valueInput.trim();
    if (v && !form.values.includes(v)) {
      setForm(prev => ({ ...prev, values: [...prev.values, v] }));
      setValueInput('');
    }
  }

  function removeValue(v: string) {
    setForm(prev => ({ ...prev, values: prev.values.filter(x => x !== v) }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('El nombre del atributo es requerido');
      return;
    }
    setIsSaving(true);
    try {
      const ok = await onSave(form);
      if (ok) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (next) {
          setForm(initialData ?? EMPTY_FORM);
          setValueInput('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Editar atributo' : 'Nuevo atributo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Color" autoFocus />
          </div>

          <div className="space-y-2">
            <Label>Valores</Label>
            <div className="flex gap-2">
              <Input
                value={valueInput}
                onChange={e => setValueInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addValue(); } }}
                placeholder="Ej: Rojo"
                className="h-8 text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={addValue} className="h-8 px-3 text-xs">Agregar</Button>
            </div>
            {form.values.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.values.map(v => (
                  <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {v}
                    <button type="button" onClick={() => removeValue(v)} className="hover:opacity-70">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
