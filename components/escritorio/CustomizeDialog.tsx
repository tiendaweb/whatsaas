'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DEFAULT_VISIBLE_WIDGETS,
  HEADER_POSITIONS,
  WIDGET_CATEGORY,
  type DesktopLayout,
  type DesktopWidgetId,
  type HeaderPosition,
} from '@/lib/desktop/types';
import { cn } from '@/lib/utils';

type Category = 'metrics' | 'charts' | 'lists' | 'activity';
const CATEGORIES: Category[] = ['metrics', 'charts', 'lists', 'activity'];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: DesktopLayout;
  onChange: (layout: DesktopLayout) => void;
  labels: {
    title: string;
    hint: string;
    headerPosition: string;
    positions: Record<HeaderPosition, string>;
    categories: Record<Category, string>;
    widget: (id: string) => { name: string; hint: string };
  };
};

export function CustomizeDialog({ open, onOpenChange, layout, onChange, labels }: Props) {
  // Sólo se ofrecen los widgets del rediseño. Los anteriores siguen soportados
  // en el layout guardado, pero listarlos acá mezclaría dos generaciones de
  // pantalla en el mismo diálogo.
  const manageable = useMemo(
    () => layout.order.filter((id) => (DEFAULT_VISIBLE_WIDGETS as readonly string[]).includes(id)),
    [layout.order],
  );

  const byCategory = useMemo(() => {
    const map = new Map<Category, DesktopWidgetId[]>();
    for (const category of CATEGORIES) map.set(category, []);
    for (const id of manageable) {
      const category = WIDGET_CATEGORY[id] as Category | undefined;
      if (category) map.get(category)?.push(id);
    }
    return map;
  }, [manageable]);

  function toggle(id: DesktopWidgetId) {
    const hidden = layout.hidden.includes(id)
      ? layout.hidden.filter((item) => item !== id)
      : [...layout.hidden, id];
    onChange({ ...layout, hidden, pinned: layout.pinned.filter((item) => !hidden.includes(item)) });
  }

  function move(id: DesktopWidgetId, direction: -1 | 1) {
    const order = [...layout.order];
    const from = order.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    onChange({ ...layout, order });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.hint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">{labels.headerPosition}</p>
          <div className="flex gap-2">
            {HEADER_POSITIONS.map((position) => (
              <Button
                key={position}
                type="button"
                size="sm"
                variant={layout.headerPosition === position ? 'default' : 'outline'}
                onClick={() => onChange({ ...layout, headerPosition: position })}
              >
                {labels.positions[position]}
              </Button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="metrics" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            {CATEGORIES.map((category) => (
              <TabsTrigger key={category} value={category} className="text-xs">
                {labels.categories[category]} ({byCategory.get(category)?.length ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>

          {CATEGORIES.map((category) => (
            <TabsContent key={category} value={category} className="space-y-2 pt-2">
              {(byCategory.get(category) ?? []).map((id) => {
                const copy = labels.widget(id);
                const isHidden = layout.hidden.includes(id);
                return (
                  <div
                    key={id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border border-border/40 p-3',
                      isHidden && 'opacity-60',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{copy.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{copy.hint}</p>
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(id, -1)}>
                      <ChevronUp className="h-4 w-4" />
                      <span className="sr-only">Subir</span>
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(id, 1)}>
                      <ChevronDown className="h-4 w-4" />
                      <span className="sr-only">Bajar</span>
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggle(id)}>
                      {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="sr-only">{isHidden ? 'Mostrar' : 'Ocultar'}</span>
                    </Button>
                  </div>
                );
              })}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
