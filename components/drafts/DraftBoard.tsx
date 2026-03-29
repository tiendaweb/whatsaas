'use client';

import { Draggable, Droppable } from '@hello-pangea/dnd';
import { ExternalLink, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DraftItem } from './types';

type Props = {
  droppableId: string;
  columnName: string;
  drafts: DraftItem[];
  selectedDraftId: number | null;
  onSelectDraft: (draftId: number) => void;
  onOpenDetail: (draft: DraftItem) => void;
};

export function DraftBoard({
  droppableId,
  columnName,
  drafts,
  selectedDraftId,
  onSelectDraft,
  onOpenDetail,
}: Props) {
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
                const selected = selectedDraftId === draft.id;
                return (
                  <Draggable key={draft.id} draggableId={`draft-${draft.id}`} index={index}>
                    {(draggableProvided, draggableSnapshot) => (
                      <article
                        ref={draggableProvided.innerRef}
                        {...draggableProvided.draggableProps}
                        className={cn(
                          'rounded-lg border p-3 space-y-2 transition',
                          selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
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

                          <button type="button" className="w-full text-left" onClick={() => onSelectDraft(draft.id)}>
                            <h4 className="text-sm font-semibold truncate">{draft.title}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{draft.content}</p>
                          </button>
                        </div>

                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => onOpenDetail(draft)}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Abrir detalle
                          </Button>
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
