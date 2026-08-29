'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  BadgeDollarSign,
  Bot,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock,
  CreditCard,
  FileSignature,
  FileStack,
  FileText,
  Files,
  Globe,
  GripVertical,
  LayoutGrid,
  LayoutTemplate,
  LifeBuoy,
  Loader2,
  Megaphone,
  MessageCircle,
  NotebookText,
  Package,
  PanelsTopLeft,
  PieChart,
  Plug,
  Plus,
  Receipt,
  Server,
  ShoppingCart,
  Store,
  UserCheck,
  UserCog,
  Users,
  X,
  Zap,
  type LucideIcon, Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const ICON_MAP: Record<string, LucideIcon> = {
  BadgeDollarSign,
  Bot,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock,
  CreditCard,
  FileSignature,
  FileStack,
  FileText,
  Target,
  Files,
  Globe,
  LayoutGrid,
  LayoutTemplate,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  NotebookText,
  Package,
  PanelsTopLeft,
  PieChart,
  Receipt,
  Server,
  ShoppingCart,
  Store,
  UserCheck,
  UserCog,
  Users,
  Zap,
};

type MenuItem = {
  key: string;
  href: string;
  label: string;
  icon: string;
  description: string;
  source: 'core' | 'plugin';
};

type MenuConfigResponse = {
  mainNav: MenuItem[];
  apps: MenuItem[];
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Plug;
}

export default function MenuEditorPage() {
  const { data, isLoading, error, mutate } = useSWR<MenuConfigResponse>('/api/menu/config', fetcher);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<MenuItem[] | null>(null);

  const mainNav = localOrder ?? data?.mainNav ?? [];
  const apps = data?.apps ?? [];

  const mainNavKeys = useMemo(() => new Set(mainNav.map((item) => item.key)), [mainNav]);

  async function persistOrder(items: MenuItem[]) {
    try {
      const response = await fetch('/api/menu/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedKeys: items.map((item) => item.key) }),
      });
      if (!response.ok) throw new Error('No se pudo guardar el orden.');
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el orden.');
      await mutate();
    } finally {
      setLocalOrder(null);
    }
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const items = Array.from(mainNav);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setLocalOrder(items);
    void persistOrder(items);
  }

  async function removeFromMenu(item: MenuItem) {
    if (pendingKey) return;
    setPendingKey(item.key);
    try {
      const response = await fetch('/api/menu/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey: item.key, pinned: false }),
      });
      if (!response.ok) throw new Error('No se pudo quitar del menú.');
      toast.success(`"${item.label}" se movió a Apps.`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo quitar del menú.');
    } finally {
      setPendingKey(null);
    }
  }

  async function addToMenu(item: MenuItem) {
    if (pendingKey) return;
    setPendingKey(item.key);
    try {
      const response = await fetch('/api/menu/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey: item.key, pinned: true }),
      });
      if (!response.ok) throw new Error('No se pudo agregar al menú.');
      toast.success(`"${item.label}" se agregó al menú principal.`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo agregar al menú.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Editor de Menú</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reordená el menú principal y movés apps entre el menú y el listado de Apps. Los cambios se guardan al instante para todo el equipo.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">No se pudo cargar el menú. Recargá la página.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Menú principal</CardTitle>
            <CardDescription>Arrastrá para reordenar. Quitá un ítem para moverlo al listado de Apps.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : mainNav.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No hay ítems en el menú principal.</p>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="main-nav">
                  {(droppableProvided) => (
                    <div
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                      className="space-y-1.5"
                    >
                      {mainNav.map((item, index) => {
                        const Icon = resolveIcon(item.icon);
                        return (
                          <Draggable key={item.key} draggableId={`menu-item-${item.key}`} index={index}>
                            {(draggableProvided, snapshot) => (
                              <div
                                ref={draggableProvided.innerRef}
                                {...draggableProvided.draggableProps}
                                className={`flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-2 ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                              >
                                <button
                                  type="button"
                                  {...draggableProvided.dragHandleProps}
                                  className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing shrink-0"
                                  aria-label="Reordenar"
                                >
                                  <GripVertical className="size-4" />
                                </button>
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                                  <Icon className="size-4" />
                                </div>
                                <span className="flex-1 text-sm font-medium truncate">{item.label}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                                  disabled={pendingKey === item.key}
                                  onClick={() => removeFromMenu(item)}
                                  aria-label={`Quitar ${item.label} del menú`}
                                >
                                  {pendingKey === item.key ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                                </Button>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {droppableProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apps disponibles</CardTitle>
            <CardDescription>Agregá cualquiera de estas apps al menú principal.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : apps.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No hay apps disponibles para agregar.</p>
            ) : (
              <div className="space-y-1.5">
                {apps.filter((item) => !mainNavKeys.has(item.key)).map((item) => {
                  const Icon = resolveIcon(item.icon);
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-2"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                        <Icon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-primary"
                        disabled={pendingKey === item.key}
                        onClick={() => addToMenu(item)}
                        aria-label={`Agregar ${item.label} al menú`}
                      >
                        {pendingKey === item.key ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
