# Skill: new-modal

## Cuándo usar esta skill
Cuando necesites crear un nuevo modal, diálogo, o drawer para acciones rápidas, confirmaciones o formularios secundarios.

**Ejemplos:** Modal de "Agregar contacto", diálogo de confirmación destructiva, drawer de edición rápida, wizard multi-paso.

---

## Archivos clave a leer primero
1. `STYLE.md` — Sección 3.4 (estilos de componentes).
2. `components/ui/dialog.tsx` — Componente Dialog de shadcn.
3. `components/ui/select.tsx` — SelectTrigger (ojo con `w-fit` vs `w-full`).
4. `components/chat/ChatHeader.tsx` — Ejemplo: modal de "Disparar flujo".
5. `components/drafts/DraftEditorModal.tsx` — Ejemplo: modal complejo con múltiples inputs.

---

## Tamaños estándar de modales

```typescript
// Pequeño: confirmación, acción simple
<DialogContent className="sm:max-w-[360px]">

// Mediano: formulario con 2-3 campos
<DialogContent className="sm:max-w-[480px]">

// Grande: formulario complejo, editor
<DialogContent className="sm:max-w-[520px]">

// Muy grande: editor de flujo, lista con detalle
<DialogContent className="sm:max-w-[800px]">
```

---

## Estructura básica de un modal

```typescript
'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';

interface MiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MiModal({ open, onOpenChange }: MiModalProps) {
  const t = useTranslations('MiFeature');
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Llamar API o server action
      await saveMiDato(formData);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('modal_title')}</DialogTitle>
          <DialogDescription>{t('modal_description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('name_label')}</Label>
            <Input
              id="name"
              placeholder={t('name_placeholder')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel_btn')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('save_btn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Checklist: Errores comunes (Cuidado ⚠️)

### ❌ SelectTrigger sin w-full

**PROBLEMA:** El SelectTrigger usa `w-fit` por defecto. En un modal, esto hace que el trigger sea tan ancho como el placeholder/valor actual, y el dropdown se vea cortado.

**SOLUCIÓN:**
```typescript
// ❌ MAL
<SelectTrigger>
  <SelectValue placeholder="Selecciona..." />
</SelectTrigger>

// ✅ BIEN
<SelectTrigger className="w-full">
  <SelectValue placeholder="Selecciona..." />
</SelectTrigger>
```

### ❌ Dialog sin padding interno en el contenido

**PROBLEMA:** El contenido del modal se ve apretado o sin espacio.

**SOLUCIÓN:**
```typescript
// ✅ Agregar espacio y padding
<DialogContent className="sm:max-w-[480px]">
  <DialogHeader>...</DialogHeader>
  <div className="space-y-4 py-4">
    {/* Contenido con espacio vertical entre elementos */}
  </div>
  <DialogFooter>...</DialogFooter>
</DialogContent>
```

### ❌ Múltiples selects sin alineación

**PROBLEMA:** Selects en grid no se alinean si tienen labels de diferente largo.

**SOLUCIÓN:**
```typescript
// ✅ Grid con w-full en cada Select
<div className="grid grid-cols-2 gap-4">
  <div className="space-y-2">
    <Label>Campo 1</Label>
    <Select>
      <SelectTrigger className="w-full">
        {/* ... */}
      </SelectTrigger>
    </Select>
  </div>
  <div className="space-y-2">
    <Label>Campo 2</Label>
    <Select>
      <SelectTrigger className="w-full">
        {/* ... */}
      </SelectTrigger>
    </Select>
  </div>
</div>
```

---

## Tipo de modal: Confirmación destructiva

```typescript
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function DeleteConfirmDialog({ open, onOpenChange, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[360px]">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive">
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

---

## Tipo de modal: Formulario con validación (Zod)

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const formSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  email: z.string().email('Email inválido'),
});

type FormData = z.infer<typeof formSchema>;

export function MiModalValidado({ open, onOpenChange }) {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', email: '' },
  });

  const onSubmit = async (data: FormData) => {
    try {
      // Llamar API
      await saveDatos(data);
      onOpenChange(false);
      form.reset();
    } catch (error) {
      form.setError('root', { message: 'Error al guardar' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Juan Pérez" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="ejemplo@dominio.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.formState.errors.root && (
              <div className="text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Tipo de modal: Con tabs

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function MiModalConTabs({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Configuración avanzada</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="avanzado">Avanzado</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            {/* Contenido tab 1 */}
          </TabsContent>

          <TabsContent value="avanzado" className="space-y-4">
            {/* Contenido tab 2 */}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Checklist de calidad (antes de merge)

- [ ] **Tamaño:** Usa un tamaño estándar (`sm:max-w-[360px]`, `sm:max-w-[480px]`, etc.).
- [ ] **DialogHeader:** Tiene título + descripción opcional.
- [ ] **SelectTrigger:** Todos tienen `className="w-full"`.
- [ ] **Espaciado:** `space-y-4` entre elementos, padding en el content.
- [ ] **Loading state:** Botón principal muestra loader durante la acción.
- [ ] **Validación:** Si es formulario, usa Zod + react-hook-form.
- [ ] **Toasts:** Usa `toast.success()` / `toast.error()` de Sonner (no alertas del browser).
- [ ] **i18n:** Todas las strings en `messages/{es,en,pt}.json`.
- [ ] **Cerrar:** Modal se cierra después de acción exitosa (no deja colgado).
- [ ] **Mobile:** Se ve bien en pantallas pequeñas (no se sale del viewport).

---

## Ejemplo: Modal abierto desde un botón

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MiModal } from './MiModal';

export function MiComponentePrincipal() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsModalOpen(true)}>
        Abrir modal
      </Button>
      <MiModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
}
```

---

## Referencias internas

- `components/chat/ChatHeader.tsx` — Modal de "Disparar flujo" (líneas 412-471).
- `components/drafts/DraftEditorModal.tsx` — Modal complejo con múltiples selects y secciones.
- `components/ui/alert-dialog.tsx` — Para confirmaciones destructivas.
