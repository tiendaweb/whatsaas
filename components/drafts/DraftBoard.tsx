'use client';

import { useMemo, useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { ChevronDown, ChevronUp, Edit3, GripVertical } from 'lucide-react';
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
};

export function DraftBoard({ droppableId, columnName, drafts, onEditDraft }: Props) {
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
            'rounded-xl border bg-card min-h-[320px] flex flex-col transition-colors',
            snapshot.isDraggingOver && 'border-primary bg-primary/5 ring-1 ring-primary/40',
          )}
        >
          <header className="px-3 py-2 border-b flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm truncate">{columnName}</h3>
            <span className="text-xs text-muted-foreground">{drafts.length} borradores</span>
          </header>

          <div className="p-3 space-y-3 flex-1">
            {drafts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Arrastra borradores aquí.</p>
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
                          'rounded-lg border p-3 space-y-3 transition',
                          expanded ? 'border-primary bg-primary/5' : 'border-border bg-background',
                          draggableSnapshot.isDragging && 'shadow-md ring-1 ring-primary/40',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            {...draggableProvided.dragHandleProps}
                            className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
                            aria-label={`Mover borrador ${draft.title}`}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>

                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="text-sm font-semibold truncate">{draft.title}</h4>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {draft.category?.name && <Badge variant="secondary">{draft.category.name}</Badge>}
                                  {draft.tags.map((tag) => (
                                    <Badge key={tag.id} variant="outline">
                                      {tag.name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                {showExpandAction && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpandedDraftId((prev) => (prev === draft.id ? null : draft.id))}
                                  >
                                    {expanded ? (
                                      <>
                                        <ChevronUp className="h-4 w-4 mr-1" /> Colapsar
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-4 w-4 mr-1" /> Expandir
                                      </>
                                    )}
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => onEditDraft(draft)}>
                                  <Edit3 className="h-3.5 w-3.5 mr-1" /> Editar
                                </Button>
                              </div>
                            </div>

                            <DraftContentPreview content={draft.content} clampLines={expanded ? undefined : 2} />
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
