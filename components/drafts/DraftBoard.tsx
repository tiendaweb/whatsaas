'use client';

import { useMemo, useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { ChevronDown, ChevronUp, Edit3, GripVertical, Send, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DraftContentPreview } from './DraftContentPreview';
import type { DraftItem } from './types';

type Props = {
  droppableId: string;
  columnName: string;
  drafts: DraftItem[];
  onEditDraft: (draft: DraftItem) => void;
  onNewMessage?: () => void;
};

export function DraftBoard({ droppableId, columnName, drafts, onEditDraft, onNewMessage }: Props) {
  const [expandedDraftId, setExpandedDraftId] = useState<number | null>(null);

  const draftLineEstimate = useMemo(() => {
    return new Map(
      drafts.map((draft) => [
        draft.id,
        draft.content.split('\n').reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 90)), 0),
      ]),
    );
  }, [drafts]);

  return (
    <Droppable droppableId={droppableId} type="DRAFT">
      {(provided, snapshot) => (
        <section
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            'flex-1 flex flex-col min-h-0 bg-[#f0f2f5]/50 dark:bg-background', // Fondo grisáceo suave tipo chat
            snapshot.isDraggingOver && 'bg-primary/5',
          )}
        >
          {/* HEADER DEL PANEL CENTRAL */}
          <header className="h-[72px] px-6 border-b bg-background flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                {columnName.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-base leading-none">{columnName}</h3>
                <p className="text-xs text-muted-foreground mt-1">{drafts.length} plantillas disponibles</p>
              </div>
            </div>
            
            <Button 
              onClick={onNewMessage}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Mensaje
            </Button>
          </header>

          {/* ÁREA DE MENSAJES (FEED) */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
            {drafts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 opacity-50">
                <Send className="h-12 w-12" />
                <p className="text-sm">No hay borradores en esta categoría.</p>
              </div>
            ) : (
              drafts.map((draft, index) => {
                const expanded = expandedDraftId === draft.id;
                const showExpandAction = (draftLineEstimate.get(draft.id) ?? 0) > 2;

                return (
                  <Draggable key={draft.id} draggableId={`draft-${draft.id}`} index={index}>
                    {(draggableProvided, draggableSnapshot) => (
                      <article
                        ref={draggableProvided.innerRef}
                        {...draggableProvided.draggableProps}
                        className={cn(
                          'max-w-3xl mx-auto w-full transition-all duration-200',
                          draggableSnapshot.isDragging && 'scale-105 z-50'
                        )}
                      >
                        <div className={cn(
                          'relative bg-background rounded-2xl shadow-sm border-l-4 transition-all',
                          expanded ? 'border-primary shadow-md' : 'border-transparent',
                          draggableSnapshot.isDragging && 'shadow-xl'
                        )}>
                          
                          {/* Botón de arrastre lateral (Grip) */}
                          <div 
                            {...draggableProvided.dragHandleProps}
                            className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 cursor-grab active:cursor-grabbing text-muted-foreground"
                          >
                            <GripVertical className="h-5 w-5" />
                          </div>

                          <div className="p-5 space-y-4">
                            {/* Cabecera del mensaje */}
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <h4 className="text-[13px] font-bold text-primary uppercase tracking-wider">
                                  {draft.title}
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {draft.tags.map((tag) => (
                                    <Badge key={tag.id} variant="secondary" className="text-[10px] px-2 py-0">
                                      {tag.name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-8 w-8 p-0"
                                  onClick={() => onEditDraft(draft)}
                                >
                                  <Edit3 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                {showExpandAction && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => setExpandedDraftId((prev) => (prev === draft.id ? null : draft.id))}
                                  >
                                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Vista previa y variables */}
                            <div className="bg-secondary/10 rounded-xl p-1">
                               <DraftContentPreview
                                content={draft.content}
                                clampLines={expanded ? undefined : 2}
                                showVariableInputs={draft.draftType === 'dynamic'}
                              />
                            </div>
                          </div>
                        </div>
                      </article>
                    )}
                  </Draggable>
                );
              })
            )}
            {provided.placeholder}
          </div>
        </section>
      )}
    </Droppable>
  );
}
