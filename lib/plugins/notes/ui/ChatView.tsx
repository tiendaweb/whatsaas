'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Tag, Trash2, Edit2, ChevronDown } from 'lucide-react';
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

interface ChatViewProps {
  notes: TeamNote[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, data: NoteEditorData) => Promise<void>;
}

export function ChatView({ notes, onDelete, onUpdate }: ChatViewProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const sortedNotes = [...notes].sort((a, b) => {
    const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bDate - aDate;
  });

  const editingNote = editingId ? notes.find((n) => n.id === editingId) : null;

  async function handleUpdate(data: NoteEditorData) {
    if (editingId) {
      await onUpdate(editingId, data);
      setEditingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {sortedNotes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">No hay notas. Crea una nueva para empezar</p>
        </div>
      ) : (
        sortedNotes.map((note) => (
          <div
            key={note.id}
            className="rounded-lg border border-border/50 bg-card p-4 hover:border-border transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-base break-words">{note.title}</h3>
                  <Badge
                    variant="outline"
                    className="text-xs whitespace-nowrap"
                  >
                    {note.status === 'todo' ? 'Por hacer' : note.status === 'in_progress' ? 'En progreso' : 'Completado'}
                  </Badge>
                </div>

                {expandedId === note.id ? (
                  <div className="mb-3">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {note.content || 'Sin contenido'}
                      </p>
                    </div>

                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {note.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            <Tag className="h-2.5 w-2.5 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {note.dueDate && (
                      <div
                        className={`text-xs flex items-center gap-1.5 mt-3 ${
                          isOverdue(note.dueDate) ? 'text-destructive font-semibold' : 'text-muted-foreground'
                        }`}
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(note.dueDate).toLocaleDateString('es-ES', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {isOverdue(note.dueDate) && ' (Vencida)'}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {note.content || 'Sin contenido'}
                  </p>
                )}
              </div>

              <div className="flex gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
                  className="h-8 w-8 p-0"
                  title={expandedId === note.id ? 'Minimizar' : 'Expandir'}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === note.id ? 'rotate-180' : ''}`} />
                </Button>
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
            </div>
          </div>
        ))
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
