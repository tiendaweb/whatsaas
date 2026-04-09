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

interface ListViewProps {
  notes: TeamNote[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, data: NoteEditorData) => Promise<void>;
}

const STATUS_BADGE = {
  todo: 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300',
  in_progress: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  done: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300',
};

const STATUS_LABEL = {
  todo: 'Por hacer',
  in_progress: 'En progreso',
  done: 'Completado',
};

export function ListView({ notes, onDelete, onUpdate }: ListViewProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'status' | 'title'>('date');

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  let sortedNotes = [...notes];

  if (sortBy === 'date') {
    sortedNotes.sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bDate - aDate;
    });
  } else if (sortBy === 'status') {
    const statusOrder = { todo: 0, in_progress: 1, done: 2 };
    sortedNotes.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  } else if (sortBy === 'title') {
    sortedNotes.sort((a, b) => a.title.localeCompare(b.title));
  }

  const editingNote = editingId ? notes.find((n) => n.id === editingId) : null;

  async function handleUpdate(data: NoteEditorData) {
    if (editingId) {
      await onUpdate(editingId, data);
      setEditingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Ordenar por:</span>
        <div className="flex gap-1">
          {(['date', 'status', 'title'] as const).map((option) => (
            <Button
              key={option}
              variant={sortBy === option ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy(option)}
              className="text-xs"
            >
              {option === 'date' ? 'Fecha' : option === 'status' ? 'Estado' : 'Título'}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        {notes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">No hay notas. Crea una nueva para empezar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Título</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Etiquetas</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Vencimiento</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedNotes.map((note) => (
                  <tr key={note.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    {/* Title */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium line-clamp-1">{note.title}</span>
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {note.content || 'Sin contenido'}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge className={`${STATUS_BADGE[note.status]} text-xs`}>
                        {STATUS_LABEL[note.status]}
                      </Badge>
                    </td>

                    {/* Tags */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {note.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5">
                            <Tag className="h-2.5 w-2.5 mr-0.5" />
                            {tag}
                          </Badge>
                        ))}
                        {note.tags.length > 2 && (
                          <Badge variant="secondary" className="text-xs py-0 px-1.5">
                            +{note.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Due Date */}
                    <td className="px-4 py-3">
                      {note.dueDate ? (
                        <div
                          className={`text-xs flex items-center gap-1 ${
                            isOverdue(note.dueDate) ? 'text-destructive font-semibold' : ''
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(note.dueDate).toLocaleDateString('es-ES', {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {isOverdue(note.dueDate) && ' ⚠️'}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditOpen(true);
                          }}
                          className="h-8 w-8 p-0"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(note.id)}
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
