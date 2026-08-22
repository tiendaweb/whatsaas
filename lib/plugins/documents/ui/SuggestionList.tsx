'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { cn } from '@/lib/utils';

export type SuggestionItem = {
  key: string;
  label: string;
  hint?: string;
  run?: (editor: Editor) => void;
  payload?: unknown;
  create?: string;
};

type Props = {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
};

export const SuggestionList = forwardRef<unknown, Props>(function SuggestionList({ items, command }, ref) {
  const [active, setActive] = useState(0);

  useEffect(() => setActive(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (!items.length) return false;

      if (event.key === 'ArrowUp') {
        setActive((index) => (index + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setActive((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        command(items[active]);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="w-72 rounded-lg border bg-popover p-3 text-sm text-muted-foreground shadow-lg">
        Sin resultados
      </div>
    );
  }

  return (
    <div className="max-h-72 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          onMouseEnter={() => setActive(index)}
          onMouseDown={(event) => {
            // mousedown, no click: si el editor pierde el foco antes, se cierra el menú.
            event.preventDefault();
            command(item);
          }}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition',
            index === active ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/60',
          )}
        >
          <span className="truncate">{item.label}</span>
          {item.hint ? <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span> : null}
        </button>
      ))}
    </div>
  );
});
