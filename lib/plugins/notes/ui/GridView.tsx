'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Tag, Trash2, Edit2 } from 'lucide-react';
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

interface GridViewProps {
  notes: TeamNote[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, data: NoteEditorData) => Promise<void>;
}

const STATUS_COLORS = {
  todo: 'border-l-4 border-l-slate-500',
  in_progress: 'border-l-4 border-l-amber-500',
  done: 'border-l-4 border-l-emerald-500',
};

export function GridView({ notes, onDelete, onUpdate }: GridViewProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const editingNote = editingId ? notes.find((n) => n.id === editingId) : null;

  async function handleUpdate(data: NoteEditorData) {
    if (editingId) {
      await onUpdate(editingId, data);
      setEditingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">No hay notas. Crea una nueva para empezar</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`rounded-lg border border-border/50 bg-card p-4 flex flex-col gap-3 hover:shadow-md transition-all ${STATUS_COLORS[note.status]}`}
            >
              {/* Header */}
              <div className="flex-1">
                <h3 className="font-semibold text-sm line-clamp-2 mb-2">{note.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                  {note.content || 'Sin contenido'}
                </p>
              </div>

              {/* Tags */}
              {note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {note.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5">
                      <Tag className="h-2 w-2 mr-0.5" />
                      {tag}
                    </Badge>
                  ))}
                  {note.tags.length > 3 && (
                    <Badge variant="secondary" className="text-xs py-0 px-1.5">
                      +{note.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}

              {/* Due Date */}
              {note.dueDate && (
                <div
                  className={`text-xs flex items-center gap-1 ${
                    isOverdue(note.dueDate) ? 'text-destructive font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  <Calendar className="h-3 w-3" />
                  {new Date(note.dueDate).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                  {isOverdue(note.dueDate) && ' ⚠️'}
                </div>
              )}

              {/* Status badge */}
              <Badge
                variant="outline"
                className="w-fit text-xs"
              >
                {note.status === 'todo' ? 'Por hacer' : note.status === 'in_progress' ? 'En progreso' : 'Completado'}
              </Badge>

              {/* Actions */}
              <div className="flex gap-1 pt-2 border-t border-border/30">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(note.id);
                    setEditOpen(true);
                  }}
                  className="h-8 flex-1 text-xs"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(note.id)}
                  className="h-8 px-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

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
