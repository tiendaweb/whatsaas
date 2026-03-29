'use client';

import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { ExternalLink, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DraftCategory, DraftItem } from './types';

type DraftBoardColumn = DraftCategory & {
  drafts: DraftItem[];
};

type Props = {
  columns: DraftBoardColumn[];
  categories: DraftCategory[];
  selectedDraftId: number | null;
  onSelectDraft: (draftId: number) => void;
  onOpenDetail: (draft: DraftItem) => void;
  onRenameCategory: (category: DraftCategory) => void;
  onDeleteCategory: (category: DraftCategory) => void;
  onMoveDraft: (draft: DraftItem, categoryId: number | null) => void;
  onReorderCategories: (categories: DraftCategory[]) => void;
};

export function DraftBoard({
  columns,
  categories,
  selectedDraftId,
  onSelectDraft,
  onOpenDetail,
  onRenameCategory,
  onDeleteCategory,
  onMoveDraft,
  onReorderCategories,
}: Props) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;

    const next = [...columns];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);

    onReorderCategories(
      next
        .filter((column) => column.id > 0)
        .map((column, index) => ({
          id: column.id,
          name: column.name,
          color: column.color,
          position: index,
        })),
    );
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="draft-board-columns" direction="horizontal" type="COLUMN">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {columns.map((column, index) => (
              <Draggable key={column.id} draggableId={`category-${column.id}`} index={index} isDragDisabled={column.id < 0}>
                {(draggableProvided) => (
                  <section
                    ref={draggableProvided.innerRef}
                    {...draggableProvided.draggableProps}
                    className="rounded-xl border bg-card min-h-[200px] flex flex-col"
                  >
                    <header className="px-3 py-2 border-b flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-1.5">
                        {column.id > 0 && (
                          <button
                            type="button"
                            {...draggableProvided.dragHandleProps}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Reordenar ${column.name}`}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                        )}
                        <h3 className="font-semibold text-sm truncate">{column.name}</h3>
                      </div>

                      {column.id > 0 && (
                        <div className="flex items-center">
                          <Button size="icon" variant="ghost" onClick={() => onRenameCategory(column)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => onDeleteCategory(column)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </header>

                    <div className="p-3 space-y-3 flex-1">
                      {column.drafts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin borradores en esta categoría.</p>
                      ) : (
                        column.drafts.map((draft) => {
                          const selected = selectedDraftId === draft.id;
                          return (
                            <article
                              key={draft.id}
                              className={`rounded-lg border p-3 space-y-2 transition ${
                                selected ? 'border-primary bg-primary/5' : 'border-border bg-background'
                              }`}
                            >
                              <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => onSelectDraft(draft.id)}
                              >
                                <h4 className="text-sm font-semibold truncate">{draft.title}</h4>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{draft.content}</p>
                              </button>

                              <div className="flex items-center gap-2">
                                <select
                                  value={String(draft.categoryId ?? 'none')}
                                  className="h-8 rounded-md border bg-background px-2 text-xs"
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    onMoveDraft(draft, value === 'none' ? null : Number(value));
                                  }}
                                >
                                  <option value="none">Sin categoría</option>
                                  {categories.map((category) => (
                                    <option key={category.id} value={String(category.id)}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>

                                <Button size="sm" onClick={() => onOpenDetail(draft)}>
                                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                  Abrir detalle
                                </Button>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
