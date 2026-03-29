'use client';

import { Droppable } from '@hello-pangea/dnd';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DraftCategory } from './types';

type DraftCategorySidebarItem = DraftCategory & {
  draftCount: number;
  droppableId: string;
  fixed?: boolean;
};

type Props = {
  items: DraftCategorySidebarItem[];
  activeDroppableId: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (droppableId: string) => void;
  onRenameCategory: (category: DraftCategory) => void;
  onDeleteCategory: (category: DraftCategory) => void;
};

export function DraftCategorySidebar({
  items,
  activeDroppableId,
  query,
  onQueryChange,
  onSelect,
  onRenameCategory,
  onDeleteCategory,
}: Props) {
  return (
    <aside className="w-full md:w-80 border-r bg-background/70 flex flex-col min-h-0">
      <div className="p-3 border-b">
        <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar borrador..." />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.map((item) => {
          const isActive = item.droppableId === activeDroppableId;
          return (
            <Droppable key={item.droppableId} droppableId={item.droppableId} type="DRAFT">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'rounded-lg border p-2 transition',
                    isActive ? 'border-primary bg-primary/10' : 'border-border bg-card/70',
                    snapshot.isDraggingOver && 'border-primary ring-1 ring-primary/60 bg-primary/10',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(item.droppableId)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.draftCount} borradores</p>
                    </button>

                    {!item.fixed && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => onRenameCategory(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onDeleteCategory(item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </aside>
  );
}
