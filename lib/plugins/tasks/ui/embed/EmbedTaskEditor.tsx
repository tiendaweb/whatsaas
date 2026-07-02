'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CheckSquare, Circle, Loader2, Plus, Send, Square, Trash2, X } from 'lucide-react';
import type { ChecklistItemWithSource, TaskComment, TaskItem } from '@/lib/plugins/tasks/client/types';
import { nanoid } from '@/lib/plugins/tasks/client/utils';
import {
  taskOsBtn,
  taskOsBtnActive,
  taskOsInput,
  taskOsMuted,
  taskOsPanel,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';
import type { EmbedApi } from './embed-api';

function toDateInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export type EmbedTaskEditorProps = {
  task: TaskItem;
  api: EmbedApi;
  onChanged: () => void;
  onClose: () => void;
};

export function EmbedTaskEditor({ task, api, onChanged, onClose }: EmbedTaskEditorProps) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [dueDate, setDueDate] = useState(toDateInput(task.dueDate));
  const [done, setDone] = useState(task.status === 'done');
  const [checklist, setChecklist] = useState<ChecklistItemWithSource[]>(task.checklist ?? []);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [saving, setSaving] = useState(false);
  const checklistInputRef = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .listComments(task.id)
      .then((rows) => active && setComments(rows))
      .catch(() => active && setComments([]))
      .finally(() => active && setLoadingComments(false));
    return () => {
      active = false;
    };
  }, [api, task.id]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patchTask(task.id, {
        title: title.trim() || task.title,
        notes,
        checklist,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        status: done ? 'done' : 'open',
      });
      onChanged();
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    setSaving(true);
    try {
      await api.deleteTask(task.id);
      onChanged();
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const submitComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    try {
      const created = await api.addComment(task.id, text);
      setComments((prev) => [...prev, created]);
      setNewComment('');
      onChanged();
    } catch {
      /* ignore */
    }
  };

  // Persist checklist immediately (like comments); keep the task's done toggle in sync
  // with the server (which auto-completes when every item is checked).
  const persistChecklist = async (next: ChecklistItemWithSource[]) => {
    setChecklist(next);
    try {
      const updated = await api.patchTask(task.id, { checklist: next });
      if (updated?.status) setDone(updated.status === 'done');
      onChanged();
    } catch {
      /* ignore */
    }
  };

  const addChecklistItem = () => {
    const text = newChecklistText.trim();
    if (!text) return;
    void persistChecklist([...checklist, { id: nanoid(), text, completed: false }]);
    setNewChecklistText('');
    window.requestAnimationFrame(() => checklistInputRef.current?.focus());
  };
  const toggleChecklistItem = (id: string) =>
    void persistChecklist(checklist.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c)));
  const updateChecklistText = (id: string, text: string) =>
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, text } : c)));
  const commitChecklistText = () => void persistChecklist(checklist);
  const removeChecklistItem = (id: string) => void persistChecklist(checklist.filter((c) => c.id !== id));

  const checklistDone = checklist.filter((c) => c.completed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={cn('flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border p-5 shadow-2xl', taskOsPanel)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setDone((v) => !v)}
            className={cn('mt-0.5 shrink-0', done ? 'text-emerald-400' : taskOsMuted)}
            title={done ? 'Marcar como abierta' : 'Marcar como terminada'}
          >
            {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={cn('min-w-0 flex-1 bg-transparent text-base font-semibold outline-none', taskOsText)}
          />
          <button type="button" onClick={onClose} className={cn('flex h-8 w-8 items-center justify-center', taskOsBtn)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <span className={cn('text-xs font-medium', taskOsMuted)}>Notas</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className={cn('w-full resize-none px-3 py-2 text-sm', taskOsInput)}
            />
          </div>

          <div className="space-y-1.5">
            <span className={cn('text-xs font-medium', taskOsMuted)}>Fecha límite</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={cn('px-3 py-2 text-sm', taskOsInput)}
            />
          </div>

          <div className="space-y-2 border-t border-[#2a2a30] pt-3">
            <span className={cn('text-xs font-medium', taskOsMuted)}>
              Checklist {checklist.length > 0 && <span className="ml-1">{checklistDone}/{checklist.length}</span>}
            </span>
            <div className="space-y-1.5">
              {checklist.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleChecklistItem(c.id)}
                    className={cn('shrink-0', c.completed ? 'text-emerald-400' : taskOsMuted)}
                  >
                    {c.completed ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  <input
                    value={c.text}
                    onChange={(e) => updateChecklistText(c.id, e.target.value)}
                    onBlur={commitChecklistText}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    className={cn(
                      'min-w-0 flex-1 bg-transparent text-sm outline-none',
                      c.completed ? 'text-[#8b8b96] line-through' : taskOsText,
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(c.id)}
                    className={cn('shrink-0 text-[#5c5c66] hover:text-red-300')}
                    title="Quitar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {checklist.length === 0 && <p className={cn('text-xs', taskOsMuted)}>Sin elementos.</p>}
            </div>
            <div className="flex gap-2">
              <input
                ref={checklistInputRef}
                value={newChecklistText}
                onChange={(e) => setNewChecklistText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder="Nuevo elemento..."
                className={cn('min-w-0 flex-1 px-3 py-2 text-sm', taskOsInput)}
              />
              <button
                type="button"
                onClick={addChecklistItem}
                className={cn('flex h-9 w-9 shrink-0 items-center justify-center', taskOsBtn)}
                title="Agregar elemento"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#2a2a30] pt-3">
            <span className={cn('text-xs font-medium', taskOsMuted)}>Comentarios</span>
            {loadingComments ? (
              <Loader2 className={cn('h-4 w-4 animate-spin', taskOsMuted)} />
            ) : (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[#2a2a30] bg-[#141416] px-3 py-2">
                    <p className={cn('whitespace-pre-wrap text-sm', taskOsText)}>{c.text}</p>
                    <p className={cn('mt-1 text-[10px]', taskOsMuted)}>{new Date(c.createdAt).toLocaleString()}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className={cn('text-xs', taskOsMuted)}>Sin comentarios.</p>}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitComment();
                  }
                }}
                placeholder="Escribe un comentario..."
                className={cn('min-w-0 flex-1 px-3 py-2 text-sm', taskOsInput)}
              />
              <button
                type="button"
                onClick={() => void submitComment()}
                className={cn('flex h-9 w-9 shrink-0 items-center justify-center', taskOsBtn)}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-[#2a2a30] pt-3">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={saving}
            className={cn('flex items-center gap-2 px-3 py-2 text-xs text-red-300 hover:text-red-200 disabled:opacity-50', taskOsBtn)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={cn('flex items-center gap-2 px-4 py-2 text-xs font-medium disabled:opacity-50', taskOsBtnActive)}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
