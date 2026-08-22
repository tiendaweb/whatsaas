'use client';

import { useState } from 'react';
import {
  Circle, AlertCircle, CheckCircle2,
  Calendar, Pin, Tag, Trash2, Pencil, Plus,
} from 'lucide-react';
import { NoteEditor, NoteEditorData } from './NoteEditor';

type NoteStatus = 'todo' | 'in_progress' | 'done';

interface TeamNote {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  status: NoteStatus;
  dueDate: string | null;
  eventId?: number | null;
  commitments?: { text: string; assigneeUserId?: number; dueDate?: string; taskItemId?: number }[];
  createdAt?: string;
  updatedAt?: string;
}

interface GridViewProps {
  notes: TeamNote[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, data: NoteEditorData) => Promise<void>;
}

const STATUS_CONFIG: Record<NoteStatus, {
  label: string;
  icon: React.ElementType;
  accent: string;
  dot: string;
  topBorder: string;
  tagBg: string;
}> = {
  todo: {
    label: 'Pendiente',
    icon: Circle,
    accent: 'text-blue-500',
    dot: 'bg-blue-500',
    topBorder: 'border-t-blue-400',
    tagBg: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300',
  },
  in_progress: {
    label: 'En progreso',
    icon: AlertCircle,
    accent: 'text-amber-500',
    dot: 'bg-amber-500',
    topBorder: 'border-t-amber-400',
    tagBg: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
  },
  done: {
    label: 'Completado',
    icon: CheckCircle2,
    accent: 'text-emerald-500',
    dot: 'bg-emerald-500',
    topBorder: 'border-t-emerald-400',
    tagBg: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
  },
};

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function GridView({ notes, onDelete, onUpdate }: GridViewProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const editingNote = editingId ? notes.find(n => n.id === editingId) : null;

  async function handleUpdate(data: NoteEditorData) {
    if (editingId) { await onUpdate(editingId, data); setEditingId(null); }
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
          <Plus className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Sin notas aún</p>
          <p className="text-xs text-muted-foreground mt-1">Crea tu primera nota con el botón "Nueva nota"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
      {notes.map(note => {
        const cfg = STATUS_CONFIG[note.status];
        const Icon = cfg.icon;
        const overdue = isOverdue(note.dueDate);

        return (
          <div
            key={note.id}
            className={`group break-inside-avoid rounded-xl border border-t-4 ${cfg.topBorder} border-border/60 bg-card p-4 flex flex-col gap-3 hover:shadow-lg transition-all duration-200`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-snug flex-1">{note.title}</h3>
              <div className="flex items-center gap-1 shrink-0">
                {note.pinned && <Pin className="h-3 w-3 text-amber-500" />}
              </div>
            </div>

            {/* Content */}
            {note.content && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{note.content}</p>
            )}

            {/* Tags */}
            {note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {note.tags.slice(0, 4).map(tag => (
                  <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                    <Tag className="h-2 w-2" /> {tag}
                  </span>
                ))}
                {note.tags.length > 4 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                    +{note.tags.length - 4}
                  </span>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              {/* Status */}
              <div className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                <span className={`text-[10px] font-medium ${cfg.accent}`}>{cfg.label}</span>
              </div>

              {/* Due date */}
              {note.dueDate && (
                <div className={`flex items-center gap-1 text-[10px] ${overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                  <Calendar className="h-2.5 w-2.5" />
                  {new Date(note.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity -mt-1">
              <button
                onClick={() => { setEditingId(note.id); setEditOpen(true); }}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="h-3 w-3" /> Editar
              </button>
              <button
                onClick={() => onDelete(note.id)}
                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}

      <NoteEditor
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={handleUpdate}
        initialData={editingNote ? {
          id: editingNote.id,
          title: editingNote.title,
          content: editingNote.content,
          tags: editingNote.tags,
          pinned: editingNote.pinned,
          status: editingNote.status,
          dueDate: editingNote.dueDate ? editingNote.dueDate.split('T')[0] : '',
          eventId: editingNote.eventId ?? null,
          commitments: editingNote.commitments ?? [],
        } : undefined}
      />
    </div>
  );
}
