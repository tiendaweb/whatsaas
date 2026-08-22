'use client';

import { useState } from 'react';
import {
  Circle, AlertCircle, CheckCircle2,
  Calendar, Pin, Tag, Trash2, Pencil,
  ArrowUpDown, Plus,
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

interface ListViewProps {
  notes: TeamNote[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, data: NoteEditorData) => Promise<void>;
}

const STATUS_CONFIG: Record<NoteStatus, {
  label: string;
  icon: React.ElementType;
  pill: string;
}> = {
  todo: {
    label: 'Pendiente',
    icon: Circle,
    pill: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  },
  in_progress: {
    label: 'En progreso',
    icon: AlertCircle,
    pill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  },
  done: {
    label: 'Completado',
    icon: CheckCircle2,
    pill: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
  },
};

const SORT_OPTIONS = [
  { value: 'date' as const, label: 'Fecha' },
  { value: 'status' as const, label: 'Estado' },
  { value: 'title' as const, label: 'Título' },
];

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function ListView({ notes, onDelete, onUpdate }: ListViewProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'status' | 'title'>('date');

  const sorted = [...notes].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.updatedAt || b.createdAt || 0).getTime() -
             new Date(a.updatedAt || a.createdAt || 0).getTime();
    }
    if (sortBy === 'status') {
      const order = { todo: 0, in_progress: 1, done: 2 };
      return order[a.status] - order[b.status];
    }
    return a.title.localeCompare(b.title);
  });

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
    <div className="space-y-3">
      {/* Sort toolbar */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Ordenar:</span>
        <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                sortBy === opt.value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{notes.length} nota{notes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {sorted.map((note, i) => {
          const cfg = STATUS_CONFIG[note.status];
          const Icon = cfg.icon;
          const overdue = isOverdue(note.dueDate);
          const isLast = i === sorted.length - 1;

          return (
            <div
              key={note.id}
              className={`group flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors ${!isLast ? 'border-b border-border/50' : ''}`}
            >
              {/* Status icon */}
              <Icon className={`h-4 w-4 shrink-0 ${
                note.status === 'todo' ? 'text-blue-500' :
                note.status === 'in_progress' ? 'text-amber-500' :
                'text-emerald-500'
              }`} />

              {/* Title + content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {note.pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
                  <span className={`text-sm font-medium truncate ${note.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                    {note.title}
                  </span>
                </div>
                {note.content && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{note.content}</p>
                )}
              </div>

              {/* Tags */}
              <div className="hidden sm:flex items-center gap-1 shrink-0">
                {note.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                    <Tag className="h-2 w-2" /> {tag}
                  </span>
                ))}
                {note.tags.length > 2 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">+{note.tags.length - 2}</span>
                )}
              </div>

              {/* Due date */}
              <div className="hidden md:flex items-center shrink-0 w-24">
                {note.dueDate ? (
                  <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                    <Calendar className="h-3 w-3" />
                    {new Date(note.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>

              {/* Status pill */}
              <div className="shrink-0">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.pill}`}>
                  <Icon className="h-2.5 w-2.5" />
                  {cfg.label}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => { setEditingId(note.id); setEditOpen(true); }}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(note.id)}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
