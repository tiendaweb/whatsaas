'use client';

import { Droppable } from '@hello-pangea/dnd';
import { Pencil, Trash2, Plus, Search } from 'lucide-react';
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
  onAddCategory?: () => void; // Añadido para el botón "+"
};

export function DraftCategorySidebar({
  items,
  activeDroppableId,
  query,
  onQueryChange,
  onSelect,
  onRenameCategory,
  onDeleteCategory,
  onAddCategory,
}: Props) {
  return (
    <aside className="w-full md:w-85 border-r bg-background flex flex-col min-h-0 h-full">
      {/* HEADER: Siguiendo la estructura de la imagen */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold text-xl">🤖</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onAddCategory} className="rounded-full bg-secondary/50">
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            value={query} 
            onChange={(event) => onQueryChange(event.target.value)} 
            placeholder="Buscar empresa..." 
            className="pl-9 bg-secondary/30 border-none rounded-xl"
          />
        </div>
      </div>

      {/* LISTA DE CATEGORÍAS (Estilo Chats) */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {items.map((item) => {
          const isActive = item.droppableId === activeDroppableId;
          const initials = item.name.substring(0, 2).toUpperCase();

          return (
            <Droppable key={item.droppableId} droppableId={item.droppableId} type="DRAFT">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'group relative rounded-xl transition-all duration-200 cursor-pointer',
                    isActive ? 'bg-primary/10' : 'hover:bg-secondary/50',
                    snapshot.isDraggingOver && 'bg-primary/20 ring-1 ring-primary'
                  )}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Avatar circular similar a la UI de la imagen */}
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"
                    )}>
                      {initials}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelect(item.droppableId)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex justify-between items-start">
                        <p className={cn(
                          "text-sm font-bold truncate",
                          isActive ? "text-primary" : "text-foreground"
                        )}>
                          {item.name}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.draftCount} plantillas disponibles
                      </p>
                    </button>

                    {/* Acciones rápidas que aparecen al hacer hover */}
                    {!item.fixed && (
                      <div className="hidden group-hover:flex items-center gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={(e) => { e.stopPropagation(); onRenameCategory(item); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); onDeleteCategory(item); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
