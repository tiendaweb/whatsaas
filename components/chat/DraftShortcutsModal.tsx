'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { 
  FileText, 
  Loader2, 
  Sparkles, 
  ArrowLeft, 
  CheckCircle2, 
  Search, 
  Command, 
  ChevronRight, 
  Keyboard, 
  SendHorizontal 
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
    if (key) placeholderSet.add(key);
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

  useEffect(() => {
    if (!selectedDraft && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex, selectedDraft]);

  // FOCO AUTOMÁTICO PASO 2: Enfoca el primer input de variable al seleccionar borrador
  useEffect(() => {
    if (selectedDraft && placeholders.length > 0) {
      const timer = setTimeout(() => {
        const firstEmpty = placeholders.find(p => !(variables[p] ?? '').trim()) || placeholders[0];
        if (firstEmpty) {
          placeholderInputRefs.current[firstEmpty]?.focus();
        }
      }, 300); // Pequeño delay para esperar la animación de transición
      return () => clearTimeout(timer);
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
    onOpenChange(false);
  };

  const handleInferVariablesWithAi = async () => {
    if (!selectedDraft) return;
    setIsInferringVariables(true);
    try {
      const response = await fetch('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Detecta variables necesarias para personalizar este borrador.',
          mode: 'variables',
          baseContent: selectedDraft.content,
          draftType: 'dynamic',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Error con IA.');
      const aiPlaceholders = extractDraftPlaceholders(result.content ?? '');
      if (aiPlaceholders.length === 0) {
        toast.error('La IA no detectó variables útiles.');
        return;
      }
      setSelectedDraft({ ...selectedDraft, content: result.content });
      setVariables((prev) => {
        const next = { ...prev };
        aiPlaceholders.forEach((placeholder) => { if (!next[placeholder]) next[placeholder] = ''; });
        return next;
      });
      toast.success('Variables detectadas con IA.');
    } catch (error: any) {
      toast.error(error?.message || 'Error detectando variables.');
    } finally {
      setIsInferringVariables(false);
    }
  };

  const handleSelectDraft = (draft: DraftItem) => {
    const draftPlaceholders = extractDraftPlaceholders(draft.content);
    if (draft.draftType === 'static' && draftPlaceholders.length === 0) {
      if (!draft.content.trim()) {
        toast.error('El borrador está vacío.');
        return;
      }
      onInsertDraft(draft.content);
      onOpenChange(false);
      return;
    }
    setVariables({});
    setSelectedDraft(draft);
  };

  const handleStep1KeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredDrafts.length ? (prev + 1) % filteredDrafts.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredDrafts.length ? (prev - 1 + filteredDrafts.length) % filteredDrafts.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedDraft) handleSelectDraft(highlightedDraft);
    }
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedDraft && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        searchInputRef.current.focus();
      }
    }
  };

  const handleVariableKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!hasUnfilledPlaceholders) {
        handleInsert();
      } else {
        const nextEmpty = placeholders.find(p => !(variables[p] ?? '').trim());
        if (nextEmpty) placeholderInputRefs.current[nextEmpty]?.focus();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed left-1/2 top-1/2 h-[90vh] w-[calc(100vw-2rem)] max-h-[90vh] max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border p-0 flex flex-col bg-[#fafafa] dark:bg-[#09090b] overflow-hidden outline-none"
        onKeyDown={handleContainerKeyDown}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          .neon-shadow-input:focus-within {
            box-shadow: 0 0 0 2px rgb(255 255 255), 0 0 0 4px rgb(59 130 246 / 0.5), 0 0 20px rgb(59 130 246 / 0.15);
            border-color: rgb(59 130 246 / 0.5) !important;
          }
          .item-active-glow {
            box-shadow: 0 8px 30px -10px rgb(59 130 246 / 0.3);
            border-color: rgb(59 130 246 / 0.4) !important;
          }
          .custom-scrollbar::-webkit-scrollbar { width: 5px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 10px; }
          .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
        `}} />

        {/* =========================================
            PASO 1: NAVEGACIÓN DE BORRADORES
        ========================================= */}
        {!selectedDraft && (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            <header className="px-8 py-6 border-b bg-background/50 backdrop-blur-xl flex items-center justify-between z-10">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                  <Command className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Centro de Borradores</h2>
                  <p className="text-muted-foreground text-xs font-medium">Busca y selecciona un copy para insertar -  ↑↓ Navegar - Enter Seleccionar </p>
                </div>
              </div>
              
            </header>

            <main className="flex flex-1 overflow-hidden">
              <section className="w-full md:w-[480px] flex flex-col border-r bg-muted/5 relative">
                <div className="p-6">
                  <div className="relative group neon-shadow-input rounded-2xl transition-all duration-300">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      ref={searchInputRef}
                      autoFocus
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedIndex(0);
                      }}
                      onKeyDown={handleStep1KeyDown}
                      placeholder="Buscar por título o contenido..."
                      className="pl-11 h-14 bg-background border-zinc-200 dark:border-zinc-800 rounded-2xl transition-all text-base focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3 custom-scrollbar" ref={listRef}>
                  {filteredDrafts.length === 0 ? (
                    <div className="text-center py-20 opacity-30">
                      <FileText className="w-12 h-12 mx-auto mb-3 stroke-[1px]" />
                      <p className="text-sm">No hay resultados</p>
                    </div>
                  ) : (
                    filteredDrafts.map((draft, index) => {
                      const isActive = selectedIndex === index;
                      return (
                        <button
                          key={draft.id}
                          ref={(el) => { itemRefs.current[index] = el; }}
                          className={`w-full group text-left p-5 rounded-[22px] border transition-all duration-200 relative ${
                            isActive 
                              ? 'bg-background border-blue-500/50 item-active-glow ring-1 ring-blue-500/10' 
                              : 'bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => handleSelectDraft(draft)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 truncate">
                              <div className={`p-2.5 rounded-xl transition-all shrink-0 ${isActive ? 'bg-blue-600 text-white scale-110 shadow-md' : 'bg-muted text-muted-foreground'}`}>
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="truncate">
                                <h4 className={`font-bold text-sm truncate ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>
                                  {draft.title}
                                </h4>
                                <p className={`mt-0.5 text-xs truncate ${isActive ? 'text-foreground/60' : 'text-muted-foreground'}`}>
                                  {draft.content}
                                </p>
                              </div>
                            </div>
                            {isActive && <ChevronRight className="w-5 h-5 text-blue-500 shrink-0 ml-2 animate-in slide-in-from-left-2" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="hidden md:flex flex-1 bg-zinc-50 dark:bg-zinc-950/40 items-center justify-center p-12 relative overflow-hidden">
                {highlightedDraft ? (
                  <div className="w-full max-w-2xl animate-in fade-in zoom-in-95 duration-500">
                    <div className="bg-background rounded-[32px] border shadow-2xl overflow-hidden border-zinc-200/50 dark:border-zinc-800/50">
                      <div className="px-8 py-5 border-b bg-muted/20 flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Vista Previa Completa</span>
                        <div className="flex gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                          <div className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                        </div>
                      </div>
                      <div className="p-10">
                        <h3 className="text-2xl font-bold mb-6 tracking-tight">{highlightedDraft.title}</h3>
                        <div className="p-8 rounded-[24px] bg-muted/10 border border-dashed border-zinc-300 dark:border-zinc-700 text-xl leading-relaxed text-zinc-600 dark:text-zinc-400 italic font-serif">
                          "{highlightedDraft.content}"
                        </div>
                      </div>
                      <div className="p-8 bg-zinc-50 dark:bg-zinc-900/30 border-t flex justify-end">
                        <Button onClick={() => handleSelectDraft(highlightedDraft)} size="lg" className="h-14 rounded-2xl px-10 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 gap-3 text-base font-bold transition-all hover:scale-105 active:scale-95">
                          Seleccionar borrador <SendHorizontal className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center opacity-20">
                    <Command className="w-24 h-24 mx-auto mb-4" />
                    <p className="text-lg font-medium">Selecciona un borrador para visualizar</p>
                  </div>
                )}
              </section>
            </main>
          </div>
        )}

        {/* =========================================
            PASO 2: PERSONALIZACIÓN (VARIABLES)
        ========================================= */}
        {selectedDraft && (
          <div className="flex h-full flex-col bg-background animate-in slide-in-from-right-10 duration-500 ease-out">
            <header className="px-8 py-6 border-b flex items-center gap-6 bg-background/50 backdrop-blur-xl z-10">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => {
                  setSelectedDraft(null);
                  setVariables({});
                }} 
                className="w-12 h-12 rounded-2xl hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-90"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-amber-500 animate-pulse" />
                  Personalizar Mensaje
                </h2>
                <p className="text-muted-foreground text-sm font-medium">{selectedDraft.title}</p>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto custom-scrollbar">
              <div className=" mx-auto grid grid-cols-1 lg:grid-cols-1 gap-16 p-10 lg:p-16 items-start">
                
                {/* Panel de Inputs */}
                <div className="space-y-10">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Campos a Completar</h3>
                    {placeholders.length > 0 && (
                      <span className="text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-3 py-1.5 rounded-full border border-blue-100 dark:border-blue-800">
                        {Object.keys(variables).filter(k => variables[k]?.trim()).length} / {placeholders.length} LISTOS
                      </span>
                    )}
                  </div>

                  {placeholders.length > 0 ? (
                    <div className="space-y-6">
                      {placeholders.map((placeholder) => {
                        const isFilled = (variables[placeholder] ?? '').trim().length > 0;
                        return (
                          <div 
                            key={placeholder} 
                            className={`group neon-shadow-input p-5 rounded-[24px] border transition-all duration-300 ${
                              isFilled ? 'bg-green-500/[0.03] border-green-500/20 shadow-sm' : 'bg-muted/5'
                            }`}
                          >
                            <label className="text-[11px] font-black uppercase mb-3 block text-muted-foreground group-focus-within:text-blue-600 transition-colors flex items-center gap-2.5">
                              {isFilled ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <div className="w-3.5 h-3.5 rounded-full border border-dashed border-zinc-400" />}
                              {placeholder}
                            </label>
                            <Input
                              ref={(node) => { placeholderInputRefs.current[placeholder] = node; }}
                              value={variables[placeholder] ?? ''}
                              onChange={(e) => setVariables(prev => ({ ...prev, [placeholder]: e.target.value }))}
                              onKeyDown={handleVariableKeyDown}
                              placeholder={`Valor para ${placeholder.toLowerCase()}...`}
                              className="h-12 bg-background border-zinc-200 dark:border-zinc-800 rounded-xl transition-all focus-visible:ring-0 text-base"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-muted/10 rounded-[32px] p-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 space-y-4">
                      <FileText className="w-10 h-10 mx-auto text-zinc-300" />
                      <p className="text-muted-foreground font-medium">Este borrador no requiere variables.</p>
                      {selectedDraft.draftType === 'dynamic' && (
                        <Button variant="outline" onClick={handleInferVariablesWithAi} disabled={isInferringVariables} className="rounded-xl">
                          {isInferringVariables ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                          Detectar variables con IA
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Panel de Vista Previa Final */}
                <div className="lg:sticky lg:top-10 space-y-8">
                  <div className="flex items-center justify-between px-2">
                      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Resultado del Mensaje</h3>
                      <div className="flex gap-2">
                         <span className="w-2.5 h-2.5 rounded-full bg-red-400/30" />
                         <span className="w-2.5 h-2.5 rounded-full bg-amber-400/30" />
                         <span className="w-2.5 h-2.5 rounded-full bg-green-400/30" />
                      </div>
                  </div>
                  
                  <div className="bg-zinc-900 text-white rounded-[40px] p-10 shadow-3xl relative min-h-[380px] flex flex-col group overflow-hidden border border-white/5">
                     <div className="absolute -top-32 -right-32 w-80 h-80 bg-blue-500/10 blur-[120px] rounded-full" />
                     
                     <div className="relative z-10 flex-1">
                      <div className="flex items-center gap-2 mb-8 opacity-40">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Vista Previa</p>
                      </div>
                      
                      <p className="text-sm md:text-2xl leading-[1.6] font-medium tracking-tight text-zinc-100">
                        {selectedDraft.content.split(PLACEHOLDER_REGEX).map((part, i) => {
                          const isKey = placeholders.includes(part);
                          if (isKey) {
                            const val = (variables[part] ?? '').trim();
                            return (
                              <span 
                                key={i} 
                                className={`transition-all duration-300 mx-0.5 px-1 rounded-lg ${
                                  val 
                                    ? 'text-blue-400 font-bold decoration-blue-400/30 underline-offset-4 underline' 
                                    : 'text-zinc-600 bg-white/5 border border-white/5 italic'
                                }`}
                              >
                                {val || `[${part}]`}
                              </span>
                            );
                          }
                          return part;
                        })}
                      </p>
                     </div>

                     <div className="mt-12 pt-8 border-t border-white/10 flex items-center justify-end relative z-10 opacity-60">
                        <SendHorizontal className="w-5 h-5 text-blue-500" />
                     </div>
                  </div>
                  
                  <div className="space-y-4">
                     <Button
                        onClick={handleInsert}
                        disabled={selectedDraft.draftType === 'dynamic' && hasUnfilledPlaceholders}
                        className={`w-full h-16 rounded-[24px] text-lg font-black transition-all shadow-2xl ${
                          hasUnfilledPlaceholders && selectedDraft.draftType === 'dynamic'
                            ? 'bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50' 
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30 hover:scale-[1.02] active:scale-95'
                        }`}
                      >
                        {hasUnfilledPlaceholders && selectedDraft.draftType === 'dynamic' ? 'Faltan variables' : 'Insertar en el chat'}
                      </Button>
                      <p className="text-center text-[11px] text-muted-foreground font-mono uppercase tracking-widest opacity-60">
                        Truco: Presiona <kbd className="px-1.5 py-0.5 rounded border bg-muted">Enter</kbd> para insertar rápido
                      </p>
                  </div>
                </div>

              </div>
            </main>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
