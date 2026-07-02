'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Send, Trash2, X } from 'lucide-react';
import type { TaskComment, TaskItem } from '@/lib/plugins/tasks/client/types';
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
  const [saving, setSaving] = useState(false);
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
