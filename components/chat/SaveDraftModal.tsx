'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Save,
  X,
  FolderOpen
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { DraftCategory } from '@/components/drafts/types';

type SaveDraftModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageContent: string;
  onSuccess?: (draftId: number) => void;
};

export function SaveDraftModal({
  open,
  onOpenChange,
  messageContent,
  onSuccess,
}: SaveDraftModalProps) {
  const t = useTranslations('Chat');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [categories, setCategories] = useState<DraftCategory[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setCategoryId('');
      return;
    }

    // Auto-suggest title from content (first ~6 words)
    if (messageContent) {
      const words = messageContent.trim().split(/\s+/).slice(0, 6).join(' ');
      setTitle(words.length > 4 ? words : '');
    }

    // Load categories
    const loadCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const response = await fetch('/api/drafts/categories');
        if (response.ok) {
          const data = await response.json();
          setCategories(data || []);
        }
      } catch (error) {
        console.error('Error loading categories:', error);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    loadCategories();
  }, [open, messageContent]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t('draft_title_required') || 'El nombre del borrador es requerido');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: messageContent,
        draftType: 'static',
        categoryId: categoryId ? parseInt(categoryId) : null,
        aiMetadata: null,
        assignedUserId: null,
        departmentId: null,
        contactId: null,
        tagIds: [],
      };

      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save draft');
      }

      const draft = await response.json();
      toast.success(t('draft_saved_success') || 'Borrador guardado exitosamente');
      onSuccess?.(draft.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving draft:', error);
      toast.error((error as Error).message || (t('draft_save_error') || 'No se pudo guardar el borrador'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{t('save_draft_title') || 'Guardar Borrador'}</DialogTitle>
          <DialogDescription>
            {t('save_draft_description') || 'Guarda este mensaje como un borrador reutilizable'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="draft-title">{t('draft_name') || 'Nombre del Borrador'}</Label>
            <Input
              id="draft-title"
              placeholder={t('draft_name_placeholder') || 'Ej: Presentación de servicios'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSaving}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="draft-category">
              {t('category') || 'Categoría'} ({t('optional') || 'Opcional'})
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={isLoadingCategories || isSaving}>
              <SelectTrigger id="draft-category">
                <SelectValue placeholder={t('select_category') || 'Seleccionar categoría'} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 max-h-[120px] overflow-y-auto">
            <p className="text-xs text-muted-foreground mb-2 font-medium">{t('preview') || 'Vista previa'}:</p>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words line-clamp-5">{messageContent}</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t('cancel') || 'Cancelar'}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('saving') || 'Guardando...'}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {t('save') || 'Guardar'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
