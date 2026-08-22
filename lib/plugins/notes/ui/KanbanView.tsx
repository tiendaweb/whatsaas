'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Circle, AlertCircle, CheckCircle2,
  Calendar, Pin, Tag, Trash2, Pencil,
  ArrowRight, Plus,
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

interface KanbanViewProps {
  notes: TeamNote[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, data: NoteEditorData) => Promise<void>;
  onMove: (id: number, newStatus: NoteStatus) => Promise<void>;
}

const COLUMNS: {
  key: NoteStatus;
  label: string;
  icon: React.ElementType;
  accent: string;
  headerBg: string;
  cardAccent: string;
  emptyText: string;
  next: NoteStatus;
  nextLabel: string;
}[] = [
  {
    key: 'todo',
    label: 'Pendiente',
    icon: Circle,
    accent: 'text-blue-500',
    headerBg: 'from-blue-500/8 to-transparent border-blue-200/60 dark:border-blue-900/60',
    cardAccent: 'border-l-blue-400',
    emptyText: 'Sin tareas pendientes',
    next: 'in_progress',
    nextLabel: 'Iniciar',
  },
  {
    key: 'in_progress',
    label: 'En progreso',
    icon: AlertCircle,
    accent: 'text-amber-500',
    headerBg: 'from-amber-500/8 to-transparent border-amber-200/60 dark:border-amber-900/60',
    cardAccent: 'border-l-amber-400',
    emptyText: 'Nada en progreso',
    next: 'done',
    nextLabel: 'Completar',
  },
  {
    key: 'done',
    label: 'Completado',
    icon: CheckCircle2,
    accent: 'text-emerald-500',
    headerBg: 'from-emerald-500/8 to-transparent border-emerald-200/60 dark:border-emerald-900/60',
    cardAccent: 'border-l-emerald-400',
    emptyText: 'Aún no hay completados',
    next: 'todo',
    nextLabel: 'Reabrir',
  },
];

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function KanbanView({ notes, onDelete, onUpdate, onMove }: KanbanViewProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const grouped = {
    todo:        notes.filter(n => n.status === 'todo'),
    in_progress: notes.filter(n => n.status === 'in_progress'),
    done:        notes.filter(n => n.status === 'done'),
  };

  const editingNote = editingId ? notes.find(n => n.id === editingId) : null;

  async function handleUpdate(data: NoteEditorData) {
    if (editingId) { await onUpdate(editingId, data); setEditingId(null); }
  }

  if (notes.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 h-full">
      {COLUMNS.map(col => {
        const Icon = col.icon;
        const colNotes = grouped[col.key];
        return (
          <div key={col.key} className="flex flex-col min-h-[500px]">
            {/* Column header */}
            <div className={`rounded-t-xl border bg-gradient-to-b ${col.headerBg} px-4 py-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${col.accent}`} />
                <span className="text-sm font-semibold">{col.label}</span>
              </div>
              <Badge
                variant="secondary"
                className={`text-xs font-semibold min-w-[22px] justify-center ${
                  colNotes.length > 0 ? 'bg-background/80' : 'opacity-50'
                }`}
              >
                {colNotes.length}
              </Badge>
            </div>

            {/* Cards */}
            <div className="flex-1 border-x border-b border-border/60 rounded-b-xl bg-muted/20 dark:bg-muted/5 p-3 space-y-2.5 overflow-y-auto">
              {colNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                  <Icon className={`h-8 w-8 opacity-20 ${col.accent}`} />
                  <p className="text-xs text-muted-foreground">{col.emptyText}</p>
                </div>
              ) : (
                colNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    col={col}
                    onEdit={() => { setEditingId(note.id); setEditOpen(true); }}
                    onDelete={() => onDelete(note.id)}
                    onMove={() => onMove(note.id, col.next)}
                  />
                ))
              )}
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

function NoteCard({
  note, col, onEdit, onDelete, onMove,
}: {
  note: TeamNote;
  col: typeof COLUMNS[number];
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  const overdue = isOverdue(note.dueDate);
  return (
    <div
      className={`group relative bg-card rounded-lg border border-l-4 ${col.cardAccent} border-border/60 p-3.5 flex flex-col gap-2 hover:shadow-md hover:border-border transition-all duration-200`}
    >
      {/* Pin */}
      {note.pinned && (
        <Pin className="absolute top-2.5 right-2.5 h-3 w-3 text-amber-500 opacity-70" />
      )}

      {/* Title */}
      <p className="text-sm font-semibold leading-snug line-clamp-2 pr-4">{note.title}</p>

      {/* Content preview */}
      {note.content && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{note.content}</p>
      )}

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.tags.slice(0, 3).map(tag => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
              <Tag className="h-2 w-2" /> {tag}
            </span>
          ))}
          {note.tags.length > 3 && (
            <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
              +{note.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Due date */}
      {note.dueDate && (
        <div className={`flex items-center gap-1 text-[10px] font-medium ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
          <Calendar className="h-3 w-3" />
          {new Date(note.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          {overdue && <span className="text-destructive">· Vencida</span>}
        </div>
      )}

      {/* Actions — appear on hover */}
      <div className="flex items-center gap-1 pt-1.5 border-t border-border/40 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Pencil className="h-3 w-3" /> Editar
        </button>
        <button
          onClick={onMove}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={`Mover a ${col.nextLabel}`}
        >
          <ArrowRight className="h-3 w-3" /> {col.nextLabel}
        </button>
        <button
          onClick={onDelete}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
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
