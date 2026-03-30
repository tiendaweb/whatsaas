'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  const [isInferringVariables, setIsInferringVariables] = useState(false);
  const placeholderInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

    if (selectedDraft.draftType === 'dynamic' && placeholders.length > 0 && hasUnfilledPlaceholders) {
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

  const handleInferVariablesWithAi = async () => {
    if (!selectedDraft) return;

    setIsInferringVariables(true);
    try {
      const response = await fetch('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Detecta variables necesarias para personalizar este borrador y devuelve placeholders [[variable]] claros.',
          mode: 'variables',
          baseContent: selectedDraft.content,
          draftType: 'dynamic',
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'No se pudieron inferir variables con IA.');
      }

      const aiPlaceholders = extractDraftPlaceholders(result.content ?? '');
      if (aiPlaceholders.length === 0) {
        toast.error('La IA no detectó variables útiles.');
        return;
      }

      setSelectedDraft({ ...selectedDraft, content: result.content });
      setVariables((prev) => {
        const next = { ...prev };
        aiPlaceholders.forEach((placeholder) => {
          if (!next[placeholder]) next[placeholder] = '';
        });
        return next;
      });

      toast.success('Variables detectadas con IA.');
    } catch (error: any) {
      console.error('draft.shortcuts.ai.variables.error', error);
      toast.error(error?.message || 'Error detectando variables con IA.');
    } finally {
      setIsInferringVariables(false);
    }
  };

  const handleSelectDraft = (draft: DraftItem) => {
    const draftPlaceholders = extractDraftPlaceholders(draft.content);

    if (draft.draftType === 'static' && draftPlaceholders.length === 0) {
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
          className="h-[100dvh] w-[100vw] max-h-[100dvh] max-w-none overflow-hidden gap-0 rounded-none p-0 flex flex-col"
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

            if (event.key === 'Enter' && !event.shiftKey) {
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
          <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4">
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
                className="focus-visible:border-zinc-700 focus-visible:ring-zinc-700"
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
            <div className="hidden min-h-0 items-center justify-center p-6 md:flex">
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
        <DialogContent
          className="h-[100dvh] w-[100vw] max-h-[100dvh] max-w-none overflow-hidden p-0 flex flex-col rounded-none"
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            if (!selectedDraft) return;

            event.preventDefault();
            if (!hasUnfilledPlaceholders) {
              handleInsert();
              return;
            }

            const firstEmptyPlaceholder = placeholders.find((placeholder) => !(variables[placeholder] ?? '').trim());
            if (!firstEmptyPlaceholder) return;
            placeholderInputRefs.current[firstEmptyPlaceholder]?.focus();
          }}
        >
          <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4">
            <DialogTitle>Paso 2: Completar variables</DialogTitle>
            <DialogDescription>
              {selectedDraft?.title ? `${selectedDraft.title}. ` : ''}
              {selectedDraft?.draftType === 'dynamic'
                ? 'Borrador dinámico: debes completar variables o pedir ayuda a IA.'
                : 'Borrador estático con variables opcionales.'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {placeholders.length > 0 ? (
              <div className="space-y-3">
                {placeholders.map((placeholder) => (
                  <div key={placeholder} className="space-y-1">
                    <p className="text-sm font-medium">{placeholder}</p>
                    <Input
                      ref={(node) => {
                        placeholderInputRefs.current[placeholder] = node;
                      }}
                      value={variables[placeholder] ?? ''}
                      onChange={(event) =>
                        setVariables((prev) => ({
                          ...prev,
                          [placeholder]: event.target.value,
                        }))
                      }
                      placeholder={`Valor para ${placeholder}`}
                      className="focus-visible:border-zinc-700 focus-visible:ring-zinc-700"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <p className="text-sm text-muted-foreground">Este borrador no tiene variables detectadas.</p>
                {selectedDraft?.draftType === 'dynamic' && (
                  <Button type="button" variant="outline" onClick={handleInferVariablesWithAi} disabled={isInferringVariables}>
                    {isInferringVariables ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Dejar que IA proponga variables
                  </Button>
                )}
              </div>
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

          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setIsFormModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleInsert}
              disabled={!selectedDraft || (selectedDraft?.draftType === 'dynamic' && hasUnfilledPlaceholders)}
            >
              Insertar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
