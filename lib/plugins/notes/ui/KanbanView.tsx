'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Tag, Trash2, Edit2, Circle, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { NoteEditor, NoteEditorData } from './NoteEditor';

type NoteStatus = 'todo' | 'in_progress' | 'done';

interface TeamNote {
  id: number;
  title: string;
  content: string;
  tags: string[];
  status: NoteStatus;
  dueDate: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface KanbanViewProps {
  notes: TeamNote[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, data: NoteEditorData) => Promise<void>;
  onMove: (id: number, newStatus: NoteStatus) => Promise<void>;
}

const STATUS_CONFIG = {
  todo: {
    label: 'Por hacer',
    icon: Circle,
    color: 'text-slate-500',
    bgColor: 'bg-slate-50 dark:bg-slate-900/20',
    borderColor: 'border-slate-200 dark:border-slate-800',
  },
  in_progress: {
    label: 'En progreso',
    icon: AlertCircle,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  done: {
    label: 'Completado',
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
};

export function KanbanView({ notes, onDelete, onUpdate, onMove }: KanbanViewProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const grouped = {
    todo: notes.filter((note) => note.status === 'todo'),
    in_progress: notes.filter((note) => note.status === 'in_progress'),
    done: notes.filter((note) => note.status === 'done'),
  };

  const editingNote = editingId ? notes.find((n) => n.id === editingId) : null;
  const statuses: NoteStatus[] = ['todo', 'in_progress', 'done'];

  async function handleUpdate(data: NoteEditorData) {
    if (editingId) {
      await onUpdate(editingId, data);
      setEditingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {notes.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {statuses.map((s) => (
            <div key={s} className="rounded-lg border border-border/50 p-3 bg-card">
              <p className="text-xs text-muted-foreground mb-1">
                {STATUS_CONFIG[s].label}
              </p>
              <p className="text-2xl font-bold">{grouped[s].length}</p>
            </div>
          ))}
        </div>
      )}

      {/* Kanban Columns */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {statuses.map((statusKey) => {
          const StatusIcon = STATUS_CONFIG[statusKey].icon;
          const config = STATUS_CONFIG[statusKey];
          const columnNotes = grouped[statusKey];
          const nextStatus = statuses[(statuses.indexOf(statusKey) + 1) % statuses.length];

          return (
            <div
              key={statusKey}
              className={`rounded-xl border ${config.borderColor} ${config.bgColor} p-4 min-h-[600px] flex flex-col`}
            >
              {/* Column Header */}
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/30">
                <StatusIcon className={`h-5 w-5 ${config.color}`} />
                <h2 className="font-semibold text-sm">{config.label}</h2>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {columnNotes.length}
                </Badge>
              </div>

              {/* Notes List */}
              <div className="space-y-3 flex-1 overflow-y-auto">
                {columnNotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Sin notas</p>
                ) : (
                  columnNotes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-lg border border-border/50 bg-background p-4 cursor-pointer hover:shadow-md transition-all hover:border-primary/50 group flex flex-col gap-2"
                    >
                      {/* Title */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm line-clamp-2 flex-1">{note.title}</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(note.id)}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Content Preview */}
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {note.content || 'Sin contenido'}
                      </p>

                      {/* Tags */}
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {note.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5">
                              <Tag className="h-2.5 w-2.5 mr-0.5" /> {tag}
                            </Badge>
                          ))}
                          {note.tags.length > 2 && (
                            <Badge variant="secondary" className="text-xs py-0 px-1.5">
                              +{note.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Due Date */}
                      {note.dueDate && (
                        <div
                          className={`text-xs flex items-center gap-1.5 ${
                            isOverdue(note.dueDate) ? 'text-destructive font-semibold' : 'text-muted-foreground'
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(note.dueDate).toLocaleDateString('es-ES', {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {isOverdue(note.dueDate) && ' (Vencida)'}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1 pt-2 border-t border-border/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditOpen(true);
                          }}
                          className="h-8 text-xs flex-1"
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onMove(note.id, nextStatus)}
                          className="h-8 text-xs px-2"
                          title={`Mover a ${STATUS_CONFIG[nextStatus].label}`}
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <NoteEditor
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={handleUpdate}
        initialData={
          editingNote
            ? {
                id: editingNote.id,
                title: editingNote.title,
                content: editingNote.content,
                tags: editingNote.tags,
                status: editingNote.status,
                dueDate: editingNote.dueDate ? editingNote.dueDate.split('T')[0] : '',
              }
            : undefined
        }
      />
    </div>
  );
}
