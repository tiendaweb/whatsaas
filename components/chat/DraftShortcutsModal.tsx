'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Sparkles, ArrowLeft, CheckCircle2 } from 'lucide-react';
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
  const [isInferringVariables, setIsInferringVariables] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
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

  // Reiniciar estado al abrir/cerrar
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      setVariables({});
      setSelectedDraft(null);
      return;
    }
    setQuery(initialQuery.trim());
    setSelectedIndex(0);
  }, [initialQuery, open]);

  // Mantener el elemento activo a la vista
  useEffect(() => {
    if (!selectedDraft && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex, selectedDraft]);

  // Auto-enfocar el primer input del paso 2 al entrar
  useEffect(() => {
    if (selectedDraft && placeholders.length > 0) {
      setTimeout(() => {
        const firstEmpty = placeholders.find(p => !(variables[p] ?? '').trim()) || placeholders[0];
        if (firstEmpty) {
          placeholderInputRefs.current[firstEmpty]?.focus();
        }
      }, 50);
    }
  }, [selectedDraft, placeholders]);

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
    setSelectedDraft(null);
    setVariables({});
    onOpenChange(false); // Cierra todo al finalizar
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

    // Si es estático y sin variables, lo inserta directamente
    if (draft.draftType === 'static' && draftPlaceholders.length === 0) {
      if (!draft.content.trim()) {
        toast.error('El borrador no puede insertarse vacío.');
        return;
      }
      onInsertDraft(draft.content);
      setSelectedDraft(null);
      setVariables({});
      onOpenChange(false);
      return;
    }

    // Si tiene variables o es dinámico, pasa al Paso 2
    setSelectedDraft(draft);
    setVariables({});
  };

  // Gestión de teclado unificada para Paso 1
  const handleStep1KeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredDrafts.length ? (prev + 1) % filteredDrafts.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredDrafts.length ? (prev - 1 + filteredDrafts.length) % filteredDrafts.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedDraft) {
        handleSelectDraft(highlightedDraft);
      }
    }
  };

  // Capturar teclas fuera del input para el buscador
  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedDraft && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      // Si presiona una letra/número normal, le damos foco al buscador para que continúe la escritura
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        searchInputRef.current.focus();
      }
    }
  };

  // Gestión de teclado unificada para Paso 2
  const handleVariableKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!hasUnfilledPlaceholders) {
        handleInsert();
      } else {
        const nextEmpty = placeholders.find(p => !(variables[p] ?? '').trim());
        if (nextEmpty && placeholderInputRefs.current[nextEmpty]) {
          placeholderInputRefs.current[nextEmpty]?.focus();
        }
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[100dvh] w-[100vw] max-w-none !rounded-none !border-0 p-0 flex flex-col bg-background sm:!rounded-none"
        onKeyDown={handleContainerKeyDown}
      >
        {/* =========================================
            PASO 1: LISTADO Y BÚSQUEDA
        ========================================= */}
        {!selectedDraft && (
          <div className="flex h-full flex-col">
            <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4">
              <DialogTitle>Paso 1: Elegí borrador</DialogTitle>
              <DialogDescription>
                Atajos: ↑/↓ para navegar, Enter para seleccionar, escribí para buscar.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
              {/* Columna Izquierda: Buscador y Lista */}
              <div className="w-full md:w-[450px] flex flex-col min-h-0 border-r bg-muted/10">
                <div className="p-4 border-b bg-background">
                  <Input
                    ref={searchInputRef}
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSelectedIndex(0); // Resetea selección al buscar
                    }}
                    onKeyDown={handleStep1KeyDown}
                    placeholder="Escribí para filtrar por título..."
                    className="focus-visible:border-zinc-700 focus-visible:ring-zinc-700"
                  />
                </div>

                <div className="flex-1 overflow-y-auto p-3" ref={listRef}>
                  {filteredDrafts.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">No hay borradores que coincidan.</p>
                  ) : (
                    filteredDrafts.map((draft, index) => {
                      const isActive = selectedIndex === index;
                      return (
                        <button
                          key={draft.id}
                          ref={(el) => { itemRefs.current[index] = el; }}
                          type="button"
                          className={`mb-2 w-full rounded-xl border px-4 py-3 text-left transition-all outline-none last:mb-0 ${
                            isActive
                              ? 'border-zinc-300 bg-background shadow-sm dark:border-zinc-700'
                              : 'border-transparent hover:bg-black/5 hover:border-border dark:hover:bg-white/5'
                          }`}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => handleSelectDraft(draft)}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                            <p className="truncate text-sm font-medium text-foreground">{draft.title}</p>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{draft.content}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Columna Derecha: Vista Previa */}
              <div className="hidden md:flex flex-1 flex-col items-center justify-center p-8 bg-background">
                {highlightedDraft ? (
                  <div className="w-full max-w-2xl flex flex-col h-full justify-center animate-in fade-in duration-200">
                    <p className="mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Vista previa del borrador
                    </p>
                    <div className="rounded-2xl border bg-muted/10 p-6 shadow-sm">
                      <h3 className="mb-4 text-xl font-semibold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        {highlightedDraft.title}
                      </h3>
                      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/80">
                        {highlightedDraft.content}
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                      <Button onClick={() => handleSelectDraft(highlightedDraft)} size="lg" className="w-full sm:w-auto">
                        Seleccionar y continuar (Enter)
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <FileText className="h-12 w-12 mb-4 opacity-20" />
                    <p>Seleccioná un borrador para ver su contenido.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            PASO 2: FORMULARIO DE VARIABLES
        ========================================= */}
        {selectedDraft && (
          <div className="flex h-full flex-col bg-background animate-in slide-in-from-right-4 duration-300">
            <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4 flex flex-row items-center gap-4 space-y-0">
              <Button variant="outline" size="icon" onClick={() => setSelectedDraft(null)} className="rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex flex-col">
                <DialogTitle>Paso 2: Completar variables</DialogTitle>
                <DialogDescription>
                  {selectedDraft.title}
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-8">
              <div className="max-w-3xl mx-auto space-y-8">
                
                {/* Zona de Inputs */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Variables necesarias</h3>
                  {placeholders.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                      {placeholders.map((placeholder) => (
                        <div key={placeholder} className="space-y-1.5 p-4 rounded-xl border bg-muted/10">
                          <p className="text-sm font-medium flex items-center gap-2">
                            {variables[placeholder]?.trim() ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <span className="h-4 w-4 rounded-full border border-dashed border-muted-foreground" />
                            )}
                            {placeholder}
                          </p>
                          <Input
                            ref={(node) => {
                              placeholderInputRefs.current[placeholder] = node;
                            }}
                            value={variables[placeholder] ?? ''}
                            onChange={(e) =>
                              setVariables((prev) => ({ ...prev, [placeholder]: e.target.value }))
                            }
                            onKeyDown={handleVariableKeyDown}
                            placeholder={`Escribe el valor y presiona Enter...`}
                            className="bg-background focus-visible:border-zinc-700 focus-visible:ring-zinc-700"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-xl border bg-muted/30 p-6 text-center">
                      <p className="text-muted-foreground">Este borrador no tiene variables detectadas.</p>
                      {selectedDraft.draftType === 'dynamic' && (
                        <Button type="button" variant="outline" onClick={handleInferVariablesWithAi} disabled={isInferringVariables}>
                          {isInferringVariables ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4 text-primary" />
                          )}
                          Dejar que IA proponga variables
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Vista previa en vivo */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Resultado final</h3>
                  <div className="rounded-xl border bg-muted/10 p-6 shadow-sm min-h-[150px]">
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                      {selectedDraft.content.replace(PLACEHOLDER_REGEX, (_, keyA: string, keyB: string) => {
                        const key = (keyA ?? keyB ?? '').trim();
                        const val = variables[key]?.trim();
                        return val ? val : `[${key}]`; // Deja un indicador visual si no está lleno
                      })}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            <div className="sticky bottom-0 border-t bg-background px-6 py-4">
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <p className="text-sm text-muted-foreground hidden sm:block">
                  {hasUnfilledPlaceholders ? 'Completa todas las variables para continuar' : 'Todo listo para insertar'}
                </p>
                <div className="flex w-full sm:w-auto gap-3">
                  <Button variant="ghost" onClick={() => setSelectedDraft(null)} className="flex-1 sm:flex-none">
                    Atrás
                  </Button>
                  <Button
                    onClick={handleInsert}
                    disabled={selectedDraft.draftType === 'dynamic' && hasUnfilledPlaceholders}
                    className="flex-1 sm:flex-none px-8"
                  >
                    Insertar ahora
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
