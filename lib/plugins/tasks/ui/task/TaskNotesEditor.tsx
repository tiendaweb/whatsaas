'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAutosizeTextArea } from '@/lib/plugins/tasks/hooks';
import { TaskOsMarkdown } from '@/lib/plugins/tasks/ui/shared/TaskOsMarkdown';
import { cn } from '@/lib/utils';

export type TaskNotesEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

function useDoubleActivate(onActivate: () => void) {
  const lastTap = useRef(0);

  return {
    onDoubleClick: (e: React.MouseEvent) => {
      e.preventDefault();
      onActivate();
    },
    onTouchEnd: () => {
      const now = Date.now();
      if (now - lastTap.current < 400) onActivate();
      lastTap.current = now;
    },
  };
}

export function TaskNotesEditor({ value, onChange }: TaskNotesEditorProps) {
  const [editing, setEditing] = useState(false);
  const notesRef = useAutosizeTextArea(value);
  const activate = useDoubleActivate(() => setEditing(true));

  useEffect(() => {
    if (!editing) return;
    const node = notesRef.current;
    node?.focus();
    const len = node?.value.length ?? 0;
    node?.setSelectionRange(len, len);
  }, [editing, notesRef]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[#8b8b96]">Descripción</span>
        {!editing && (
          <span className="flex items-center gap-1 text-[10px] text-[#5c5c66]">
            <Pencil className="h-3 w-3" />
            Doble clic para editar
          </span>
        )}
        {editing && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-[#2e2e36] bg-[#222228] px-2 py-0.5 text-[10px] text-[#a8a8b3] hover:text-white"
          >
            Listo
          </button>
        )}
      </div>

      {editing ? (
        <div className="min-h-[220px] rounded-lg border border-[#3b82f6]/40 bg-[#1c1c1f] p-3 ring-1 ring-[#3b82f6]/20">
          <textarea
            ref={notesRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
              }
            }}
            placeholder={'Markdown: **negrita**, listas, enlaces...'}
            className="min-h-[200px] w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-[#e4e4ea] outline-none placeholder:text-[#5c5c66]"
          />
        </div>
      ) : (
        <div
          {...activate}
          className={cn(
            'min-h-[220px] cursor-text rounded-lg border border-[#2a2a30] bg-[#1a1a1e] p-4 transition-colors',
            'hover:border-[#3a3a44] hover:bg-[#1c1c20]',
          )}
        >
          <TaskOsMarkdown
            content={value}
            emptyLabel="Sin descripción. Haz doble clic para escribir."
          />
        </div>
      )}
    </section>
  );
}