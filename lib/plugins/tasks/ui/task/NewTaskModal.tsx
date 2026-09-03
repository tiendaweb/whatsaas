'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAutosizeTextArea } from '@/lib/plugins/tasks/hooks';
import { TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';

export type NewTaskModalProps = {
  columnId: number;
  onClose: () => void;
  onCreate: (title: string, notes: string, dueDate: string) => Promise<void>;
};

export function NewTaskModal({ columnId: _columnId, onClose, onCreate }: NewTaskModalProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const notesRef = useAutosizeTextArea(notes);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onCreate(title.trim(), notes, dueDate);
    setSaving(false);
    onClose();
  };

  return (
    <TaskOsModal onClose={onClose} size="md" className="space-y-4 p-5">
      <TaskOsModalHeader title="Nueva tarea" onClose={onClose} />
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
        placeholder="Título de la tarea..."
        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
      />
      <textarea
        ref={notesRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas (opcional)..."
        className="w-full resize-none overflow-hidden rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="w-48 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
      />
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-sm text-white/60 transition-colors hover:text-white">
          Cancelar
        </button>
        <button
          onClick={() => void handleCreate()}
          disabled={saving || !title.trim()}
          className="flex items-center gap-2 rounded-xl border border-white/30 bg-white/20 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/30 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Crear
        </button>
      </div>
    </TaskOsModal>
  );
}