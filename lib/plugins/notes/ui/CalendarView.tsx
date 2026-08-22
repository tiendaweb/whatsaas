'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, ChevronLeft, ChevronRight, Tag, Edit2, Trash2 } from 'lucide-react';
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

interface CalendarViewProps {
  notes: TeamNote[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, data: NoteEditorData) => Promise<void>;
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function CalendarView({ notes, onDelete, onUpdate }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const notesbyDate: Record<string, TeamNote[]> = {};
  notes.forEach((note) => {
    if (note.dueDate) {
      const dateStr = note.dueDate.split('T')[0];
      if (!notesbyDate[dateStr]) {
        notesbyDate[dateStr] = [];
      }
      notesbyDate[dateStr].push(note);
    }
  });

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    return dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  const editingNote = editingId ? notes.find((n) => n.id === editingId) : null;
  const selectedNotes = selectedDate ? notesbyDate[selectedDate] || [] : [];

  async function handleUpdate(data: NoteEditorData) {
    if (editingId) {
      await onUpdate(editingId, data);
      setEditingId(null);
    }
  }

  // Generate calendar days
  const days: (number | null)[] = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Calendar */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">
              {MONTHS[month]} {year}
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date(year, month - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
              >
                Hoy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date(year, month + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Weekdays Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayNotes = notesbyDate[dateStr] || [];
              const hasNotes = dayNotes.length > 0;
              const isCurrentDay = isToday(dateStr);
              const hasOverdue = dayNotes.some((n) => isOverdue(n.dueDate));

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(selectedDate === dateStr ? null : dateStr)}
                  className={`aspect-square rounded-lg border-2 p-1 text-sm font-semibold transition-colors ${
                    selectedDate === dateStr
                      ? 'border-primary bg-primary/10'
                      : isCurrentDay
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : hasNotes
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-border hover:border-primary/50'
                  } ${hasOverdue ? 'text-destructive' : ''}`}
                >
                  <div className="h-full flex flex-col justify-between">
                    <span>{day}</span>
                    {hasNotes && (
                      <div className="flex gap-0.5 justify-center flex-wrap">
                        {dayNotes.slice(0, 3).map((note, i) => (
                          <div
                            key={i}
                            className={`h-1.5 w-1.5 rounded-full ${
                              note.status === 'done'
                                ? 'bg-emerald-500'
                                : note.status === 'in_progress'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-500'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-border/30 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Leyenda:</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-slate-500" />
                <span>Por hacer</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span>En progreso</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Completado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span>Hoy</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Selected Date Notes */}
        <div className="rounded-lg border border-border bg-card p-4 h-fit">
          <h3 className="font-semibold mb-4">
            {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }) : 'Selecciona un día'}
          </h3>

          {selectedNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {selectedDate ? 'Sin notas para este día' : ''}
            </p>
          ) : (
            <div className="space-y-3">
              {selectedNotes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border/50 bg-background p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm line-clamp-2 flex-1">{note.title}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(note.id)}
                      className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {note.content || 'Sin contenido'}
                  </p>

                  {note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {note.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5">
                          <Tag className="h-2 w-2 mr-0.5" /> {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Badge
                    className="text-xs w-fit"
                    variant={note.status === 'done' ? 'default' : 'outline'}
                  >
                    {note.status === 'todo' ? 'Por hacer' : note.status === 'in_progress' ? 'En progreso' : 'Completado'}
                  </Badge>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingId(note.id);
                      setEditOpen(true);
                    }}
                    className="w-full h-8 text-xs"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
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
                pinned: editingNote.pinned,
                status: editingNote.status,
                dueDate: editingNote.dueDate ? editingNote.dueDate.split('T')[0] : '',
                eventId: editingNote.eventId ?? null,
                commitments: editingNote.commitments ?? [],
              }
            : undefined
        }
      />
    </div>
  );
}
