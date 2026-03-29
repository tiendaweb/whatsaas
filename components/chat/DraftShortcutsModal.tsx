'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { DraftItem } from '@/components/drafts/types';

type DraftShortcutsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: DraftItem[];
  initialQuery?: string;
  onInsertDraft: (message: string) => void;
};

const PLACEHOLDER_REGEX = /\{\{([\w\-. ]+)\}\}|\[\[([\w\-. ]+)\]\]/g;

const extractDraftPlaceholders = (content: string): string[] => {
  const placeholderSet = new Set<string>();

  for (const match of content.matchAll(PLACEHOLDER_REGEX)) {
    const key = (match[1] ?? match[2] ?? '').trim();
    if (key) {
      placeholderSet.add(key);
    }
  }

  return Array.from(placeholderSet);
};

export function DraftShortcutsModal({
  open,
  onOpenChange,
  drafts,
  initialQuery = '',
  onInsertDraft,
}: DraftShortcutsModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [selectedDraft, setSelectedDraft] = useState<DraftItem | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  const filteredDrafts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return drafts;

    return drafts.filter((draft) => draft.title.toLowerCase().includes(normalized));
  }, [drafts, query]);

  const highlightedDraft = filteredDrafts[selectedIndex] ?? null;

  const placeholders = useMemo(() => {
    if (!selectedDraft) return [];
    return extractDraftPlaceholders(selectedDraft.content);
  }, [selectedDraft]);

  const hasUnfilledPlaceholders = useMemo(
    () => placeholders.some((placeholder) => !(variables[placeholder] ?? '').trim()),
    [placeholders, variables],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      if (!isFormModalOpen) {
        setVariables({});
        setSelectedDraft(null);
      }
      return;
    }

    setQuery(initialQuery.trim());
  }, [initialQuery, isFormModalOpen, open]);

  useEffect(() => {
    if (selectedIndex >= filteredDrafts.length) {
      setSelectedIndex(0);
    }
  }, [filteredDrafts, selectedIndex]);

  useEffect(() => {
    setVariables({});
  }, [selectedDraft?.id]);

  const handleInsert = () => {
    if (!selectedDraft) return;

    if (placeholders.length > 0 && hasUnfilledPlaceholders) {
      toast.error('Completá todas las variables antes de insertar.');
      return;
    }

    const rendered = selectedDraft.content.replace(PLACEHOLDER_REGEX, (_, keyA: string, keyB: string) => {
      const key = (keyA ?? keyB ?? '').trim();
      return variables[key] ?? '';
    });

    if (!rendered.trim()) {
      toast.error('El borrador no puede insertarse vacío.');
      return;
    }

    onInsertDraft(rendered);
    setIsFormModalOpen(false);
    setSelectedDraft(null);
    setVariables({});
  };

  const handleSelectDraft = (draft: DraftItem) => {
    const draftPlaceholders = extractDraftPlaceholders(draft.content);

    if (draftPlaceholders.length === 0) {
      if (!draft.content.trim()) {
        toast.error('El borrador no puede insertarse vacío.');
        return;
      }

      onInsertDraft(draft.content);
      setIsFormModalOpen(false);
      setSelectedDraft(null);
      setVariables({});
      onOpenChange(false);
      return;
    }

    setSelectedDraft(draft);
    setVariables({});
    setIsFormModalOpen(true);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="fixed inset-0 h-[100dvh] w-screen max-h-none max-w-none translate-x-0 translate-y-0 gap-0 rounded-none p-0"
          onKeyDown={(event) => {
            if (!open) return;

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (filteredDrafts.length === 0) return;
              setSelectedIndex((prev) => (prev + 1) % filteredDrafts.length);
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (filteredDrafts.length === 0) return;
              setSelectedIndex((prev) => (prev - 1 + filteredDrafts.length) % filteredDrafts.length);
            }

            if (event.key === 'Enter') {
              if ((event.target as HTMLElement).tagName.toLowerCase() === 'input') return;
              event.preventDefault();
              if (highlightedDraft) {
                handleSelectDraft(highlightedDraft);
              }
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              onOpenChange(false);
            }
          }}
        >
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Paso 1: Elegí borrador</DialogTitle>
            <DialogDescription>Atajos: ↑/↓ para navegar, Enter para seleccionar y Esc para cerrar.</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[420px_1fr]">
            <div className="flex min-h-0 flex-col gap-3 border-r p-4">
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Escribí para filtrar por título"
              />

              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
                <div className="p-2">
                  {filteredDrafts.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">Escribí para filtrar por título.</p>
                  ) : (
                    filteredDrafts.map((draft, index) => {
                      const isActive = selectedIndex === index;
                      return (
                        <button
                          key={draft.id}
                          type="button"
                          className={`mb-2 w-full rounded-xl border px-3 py-2 text-left transition-colors last:mb-0 ${
                            isActive
                              ? 'border-zinc-300 bg-zinc-800/10 dark:border-zinc-700 dark:bg-zinc-800/15'
                              : 'border-transparent hover:bg-muted/50 hover:border-border'
                          }`}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => handleSelectDraft(draft)}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <p className="truncate text-sm font-medium text-foreground">{draft.title}</p>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{draft.content}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="hidden items-center justify-center p-6 md:flex">
              <p className="text-sm text-muted-foreground">Seleccioná un borrador para continuar al paso de variables.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isFormModalOpen}
        onOpenChange={(nextOpen) => {
          setIsFormModalOpen(nextOpen);
          if (!nextOpen) {
            setSelectedDraft(null);
            setVariables({});
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Paso 2: Completar variables</DialogTitle>
            <DialogDescription>
              {selectedDraft?.title ? `${selectedDraft.title}. ` : ''}Si no hay variables, podés insertar directamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-1">
            {placeholders.length > 0 ? (
              <div className="space-y-3">
                {placeholders.map((placeholder) => (
                  <div key={placeholder} className="space-y-1">
                    <p className="text-sm font-medium">{placeholder}</p>
                    <Input
                      value={variables[placeholder] ?? ''}
                      onChange={(event) =>
                        setVariables((prev) => ({
                          ...prev,
                          [placeholder]: event.target.value,
                        }))
                      }
                      placeholder={`Valor para ${placeholder}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Este borrador no tiene variables dinámicas.</p>
            )}

            {selectedDraft && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Vista previa</p>
                <p className="whitespace-pre-wrap text-sm">
                  {selectedDraft.content.replace(PLACEHOLDER_REGEX, (_, keyA: string, keyB: string) => {
                    const key = (keyA ?? keyB ?? '').trim();
                    return variables[key] ?? '';
                  })}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsFormModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleInsert} disabled={!selectedDraft || hasUnfilledPlaceholders}>
              Insertar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
