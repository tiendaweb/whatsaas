'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Sparkles, ArrowLeft, Search, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DraftContentPreview } from '@/components/drafts/DraftContentPreview';
import { extractPlaceholders, renderDraftContent } from '@/lib/drafts/utils';
import { cn } from '@/lib/utils';
import type { DraftItem } from '@/components/drafts/types';

type DraftShortcutsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: DraftItem[];
  initialQuery?: string;
  onInsertDraft: (message: string) => void;
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
  const [isInferring, setIsInferring] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      setVariables({});
      setSelectedDraft(null);
    } else {
      setQuery(initialQuery.trim());
      setSelectedIndex(0);
    }
  }, [open, initialQuery]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter(d => d.title.toLowerCase().includes(q));
  }, [drafts, query]);

  const current = filtered[selectedIndex] || null;

  const placeholders = useMemo(() => {
    return selectedDraft ? extractPlaceholders(selectedDraft.content) : [];
  }, [selectedDraft]);

  const hasMissing = placeholders.some(p => !(variables[p] || '').trim());

  const handleSelect = (draft: DraftItem) => {
    const ph = extractPlaceholders(draft.content);
    if (draft.draftType === 'static' && ph.length === 0) {
      if (draft.content.trim()) {
        onInsertDraft(draft.content);
        onOpenChange(false);
      }
      return;
    }
    setVariables({});
    setSelectedDraft(draft);
  };

  // Keyboard navigation (list)
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (!filtered.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % filtered.length);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (current) handleSelect(current);
    }
    if (e.key === 'Escape' && !selectedDraft) {
      onOpenChange(false);
    }
  };

  const handleInsert = () => {
    if (!selectedDraft) return;
    if (selectedDraft.draftType === 'dynamic' && hasMissing) {
      toast.error('Completa todas las variables');
      return;
    }
    const rendered = renderDraftContent(selectedDraft.content, variables);
    if (!rendered.trim()) {
      toast.error('El mensaje está vacío');
      return;
    }
    onInsertDraft(rendered);
    onOpenChange(false);
  };

  // AI variables detection (kept)
  const inferWithAI = async () => {
    if (!selectedDraft) return;
    setIsInferring(true);
    try {
      const res = await fetch('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Detecta las variables útiles para este mensaje',
          mode: 'variables',
          baseContent: selectedDraft.content,
          draftType: 'dynamic',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const newPh = extractPlaceholders(data.content || '');
      setSelectedDraft({ ...selectedDraft, content: data.content || selectedDraft.content });
      const nextVars: Record<string, string> = {};
      newPh.forEach(p => { nextVars[p] = variables[p] || ''; });
      setVariables(nextVars);
      toast.success('Variables inferidas');
    } catch (e: any) {
      toast.error(e.message || 'Error con IA');
    } finally {
      setIsInferring(false);
    }
  };

  // Clean ultra minimalist modern modal — OS feel, excellent on mobile
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 rounded-3xl border max-w-[620px] w-[calc(100vw-16px)] max-h-[88dvh] flex flex-col bg-background shadow-2xl"
        onKeyDown={onListKeyDown}
      >
        <DialogTitle className="sr-only">Borradores</DialogTitle>
        <DialogDescription className="sr-only">
          Busca, completa variables e inserta un borrador en la conversación.
        </DialogDescription>
        {/* Header */}
        <div className="flex items-center px-4 pt-3 pb-2 border-b">
          <div className="flex items-center gap-2 text-sm font-semibold px-2">
            <FileText className="h-4 w-4" /> Borradores
          </div>
          <div className="ml-auto text-[10px] text-muted-foreground px-2 font-mono tracking-widest">##</div>
        </div>

        {/* Search — prominent & minimal */}
        {!selectedDraft && (
          <div className="p-4 pb-2">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                placeholder="Buscar mensajes guardados..."
                className="pl-11 h-12 bg-muted/40 border-0 rounded-3xl text-[15px] focus-visible:ring-1"
              />
            </div>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {!selectedDraft ? (
            // LIST
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                  <FileText className="h-8 w-8 mb-3 opacity-30" />
                  <p className="text-sm">No se encontraron borradores</p>
                </div>
              ) : (
                filtered.map((draft, idx) => {
                  const isSel = idx === selectedIndex;
                  const phCount = extractPlaceholders(draft.content).length;
                  return (
                    <button
                      key={draft.id}
                      onClick={() => handleSelect(draft)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "w-full text-left px-4 py-[13px] flex gap-3 rounded-3xl transition active:bg-accent/60",
                        isSel ? "bg-accent" : "hover:bg-muted/70"
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        <div className={cn("h-8 w-8 rounded-2xl flex items-center justify-center", isSel ? "bg-primary text-primary-foreground" : "bg-muted")}>
                          <FileText className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 pr-1">
                        <div className="font-medium truncate text-[15px] tracking-[-0.1px]">{draft.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5 pr-6">{draft.content}</div>
                        {phCount > 0 && (
                          <div className="inline-block mt-1 text-[10px] px-2 py-px rounded-full bg-primary/10 text-primary font-medium">+{phCount} vars</div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            // VARIABLE STEP — beautiful stacked modern UI
            <div className="flex flex-col flex-1 p-5 gap-5 overflow-y-auto">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="rounded-2xl shrink-0" onClick={() => { setSelectedDraft(null); setVariables({}); }}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <div className="font-semibold tracking-tight text-lg leading-none">{selectedDraft.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">Completa las variables si las hay</div>
                </div>
              </div>

              {/* Variables inputs */}
              {placeholders.length > 0 ? (
                <div className="space-y-4">
                  {placeholders.map((ph, idx) => (
                    <div key={idx}>
                      <div className="text-xs font-medium text-muted-foreground mb-1.5 pl-1">{ph}</div>
                      <Input
                        value={variables[ph] || ''}
                        onChange={e => setVariables({ ...variables, [ph]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !hasMissing) handleInsert();
                        }}
                        className="rounded-3xl h-12 bg-background"
                        placeholder="Escribe el valor..."
                        autoFocus={idx === 0}
                      />
                    </div>
                  ))}

                  <div className="pt-2">
                    <Button variant="outline" size="sm" onClick={inferWithAI} disabled={isInferring} className="rounded-2xl">
                      {isInferring ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
                      Detectar con IA
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Este borrador no tiene variables.</div>
              )}

              {/* Preview */}
              <div className="mt-auto pt-3 border-t">
                <div className="text-xs uppercase tracking-[1px] text-muted-foreground mb-2 px-1">Vista previa</div>
                <DraftContentPreview
                  content={selectedDraft.content}
                  variables={variables}
                  onVariablesChange={setVariables}
                  variant="bubble"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="p-4 border-t bg-background flex gap-2">
          {selectedDraft ? (
            <>
              <Button variant="ghost" className="flex-1 rounded-2xl" onClick={() => { setSelectedDraft(null); setVariables({}); }}>Volver</Button>
              <Button
                className="flex-1 rounded-2xl"
                disabled={selectedDraft.draftType === 'dynamic' && hasMissing}
                onClick={handleInsert}
              >
                <Send className="h-4 w-4 mr-2" /> Insertar
              </Button>
            </>
          ) : (
            <div className="flex-1 text-xs text-center text-muted-foreground pt-1">↑↓ para navegar • Enter para seleccionar</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
