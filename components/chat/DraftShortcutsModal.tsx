'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import type { DraftItem } from '@/components/drafts/types';

type DraftShortcutsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: DraftItem[];
  initialQuery?: string;
  onInsertDraft: (message: string) => void;
};

const PLACEHOLDER_REGEX = /\[\[([\w\-. ]+)\]\]/g;

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
    const set = new Set<string>();
    for (const match of selectedDraft.content.matchAll(PLACEHOLDER_REGEX)) {
      const key = match[1]?.trim();
      if (key) set.add(key);
    }
    return Array.from(set);
  }, [selectedDraft]);

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
    const rendered = selectedDraft.content.replace(PLACEHOLDER_REGEX, (_, rawKey: string) => {
      const key = rawKey.trim();
      return variables[key] ?? '';
    });

    onInsertDraft(rendered);
    setIsFormModalOpen(false);
  };

  const handleSelectDraft = (draft: DraftItem) => {
    setSelectedDraft(draft);
    setVariables({});
    setIsFormModalOpen(true);
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed inset-0 w-screen h-[100dvh] max-w-none max-h-none translate-x-0 translate-y-0 rounded-none p-0 gap-0"
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
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Borradores</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[420px_1fr] min-h-0 flex-1 overflow-hidden">
          <div className="p-4 border-r flex flex-col gap-3 min-h-0">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar borrador por nombre..."
            />

            <div className="rounded-md border overflow-y-auto min-h-0 flex-1">
              <div className="p-2">
                {filteredDrafts.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2 py-3">No se encontraron borradores.</p>
                ) : (
                  filteredDrafts.map((draft, index) => {
                    const isActive = selectedIndex === index;
                    return (
                      <button
                        key={draft.id}
                        type="button"
                        className={`w-full text-left rounded-md px-3 py-2 border mb-2 last:mb-0 transition ${
                          isActive
                            ? 'border-primary bg-primary/10'
                            : 'border-transparent hover:border-border hover:bg-muted/50'
                        }`}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => handleSelectDraft(draft)}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-medium truncate">{draft.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{draft.content}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <div className="hidden md:flex p-6 overflow-y-auto items-center justify-center">
            <p className="text-sm text-muted-foreground">Selecciona un borrador para abrir el formulario dinámico.</p>
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
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{selectedDraft?.title ?? 'Borrador'}</DialogTitle>
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
              <p className="text-xs font-semibold text-muted-foreground mb-1">Vista previa</p>
              <p className="text-sm whitespace-pre-wrap">
                {selectedDraft.content.replace(PLACEHOLDER_REGEX, (_, rawKey: string) => {
                  const key = rawKey.trim();
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
          <Button onClick={handleInsert} disabled={!selectedDraft}>
            Insertar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
