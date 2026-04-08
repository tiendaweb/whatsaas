'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Trash2,
  Plus,
  Search,
  Calendar,
  Tag,
  ChevronRight,
  Copy,
  CheckCircle2,
  Circle,
  AlertCircle,
} from 'lucide-react';

type NoteStatus = 'todo' | 'in_progress' | 'done';

type TeamNote = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  status: NoteStatus;
  dueDate: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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

const MARKDOWN_PATTERNS = [
  { regex: /\*\*(.*?)\*\*/g, replacement: '<strong>$1</strong>' },
  { regex: /\*(.*?)\*/g, replacement: '<em>$1</em>' },
  { regex: /\n- /g, replacement: '\n• ' },
];

function renderMarkdown(text: string): string {
  let result = text;
  MARKDOWN_PATTERNS.forEach(({ regex, replacement }) => {
    result = result.replace(regex, replacement);
  });
  // Escape HTML but keep our formatted content
  return result
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : line))
    .join('\n');
}

export function NotesDashboard() {
  const { data, mutate } = useSWR<TeamNote[]>('/api/plugins/notes', fetcher);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [status, setStatus] = useState<NoteStatus>('todo');
  const [dueDate, setDueDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  const notes = data ?? [];
  const tags = Array.from(new Set(notes.flatMap((note) => note.tags))).sort();

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      const matchesSearch =
        searchQuery === '' ||
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSearch;
    });
  }, [notes, searchQuery]);

  const grouped = {
    todo: filtered.filter((note) => note.status === 'todo'),
    in_progress: filtered.filter((note) => note.status === 'in_progress'),
    done: filtered.filter((note) => note.status === 'done'),
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  async function createNote() {
    if (!title.trim()) {
      alert('El título es requerido');
      return;
    }
    const tags = tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);
    await fetch('/api/plugins/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, tags, status, dueDate: dueDate || null }),
    });
    setTitle('');
    setContent('');
    setTagsText('');
    setStatus('todo');
    setDueDate('');
    setShowForm(false);
    mutate();
  }

  async function moveNote(noteId: number, newStatus: NoteStatus) {
    await fetch(`/api/plugins/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    mutate();
  }

  async function deleteNote(noteId: number) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta nota?')) return;
    await fetch(`/api/plugins/notes/${noteId}`, { method: 'DELETE' });
    mutate();
  }

  const statuses: NoteStatus[] = ['todo', 'in_progress', 'done'];

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Notas del equipo</h1>
        <p className="text-muted-foreground">Organiza tareas, ideas y notas en un flujo visual</p>
      </div>

      {/* Search and Create */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar notas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Nueva nota
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4 shadow-sm">
          <div className="space-y-2">
            <label className="text-sm font-medium">Título</label>
            <Input
              placeholder="Título de la nota"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Contenido</label>
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => insertMarkdown('**', '**', 'Texto en negrita')}
                  className="text-xs"
                >
                  <strong>B</strong>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => insertMarkdown('*', '*', 'texto cursiva')}
                  className="text-xs"
                >
                  <em>I</em>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => insertMarkdown('- ', '', 'Elemento de lista')}
                  className="text-xs"
                >
                  •
                </Button>
              </div>
              <Textarea
                placeholder="Escribe tu nota aquí... Soporta **negrita** e *itálica*"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="font-mono text-sm resize-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tags (separadas por coma)</label>
              <Input
                placeholder="trabajo, urgente, cliente"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha de vencimiento</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado inicial</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as NoteStatus)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setTitle('');
                setContent('');
                setTagsText('');
                setDueDate('');
              }}
            >
              Cancelar
            </Button>
            <Button onClick={createNote}>Crear nota</Button>
          </div>
        </div>
      )}

      {/* Stats */}
      {filtered.length > 0 && (
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

      {/* Kanban Board */}
      <div className="grid gap-4 lg:grid-cols-3">
        {statuses.map((statusKey) => {
          const StatusIcon = STATUS_CONFIG[statusKey].icon;
          const config = STATUS_CONFIG[statusKey];
          const columnNotes = grouped[statusKey];

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
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Sin notas
                  </p>
                ) : (
                  columnNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      statusKey={statusKey}
                      onMove={moveNote}
                      onDelete={deleteNote}
                      isOverdue={isOverdue(note.dueDate)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NoteCard({
  note,
  statusKey,
  onMove,
  onDelete,
  isOverdue,
}: {
  note: TeamNote;
  statusKey: NoteStatus;
  onMove: (id: number, status: NoteStatus) => void;
  onDelete: (id: number) => void;
  isOverdue: boolean;
}) {
  const [showActions, setShowActions] = useState(false);
  const statuses: NoteStatus[] = ['todo', 'in_progress', 'done'];
  const nextStatus = statuses[(statuses.indexOf(statusKey) + 1) % statuses.length];

  return (
    <div
      className="rounded-lg border border-border/50 bg-background p-4 cursor-pointer hover:shadow-md transition-all group hover:border-primary/50"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Title */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm line-clamp-2 flex-1">{note.title}</h3>
        {showActions && (
          <button
            onClick={() => onDelete(note.id)}
            className="p-1 hover:bg-destructive/10 rounded text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Content Preview */}
      <p className="text-xs text-muted-foreground line-clamp-3 mb-3 leading-relaxed">
        {note.content || 'Sin contenido'}
      </p>

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {note.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5">
              <Tag className="h-2.5 w-2.5 mr-0.5" /> {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Due Date */}
      {note.dueDate && (
        <div className={`text-xs flex items-center gap-1.5 mb-3 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
          <Calendar className="h-3.5 w-3.5" />
          {new Date(note.dueDate).toLocaleDateString('es-ES', {
            month: 'short',
            day: 'numeric',
          })}
          {isOverdue && <span className="font-semibold">(Vencida)</span>}
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs h-8"
          onClick={() => onMove(note.id, nextStatus)}
        >
          Mover
          <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

// Helper function to insert markdown
function insertMarkdown(before: string, after: string, placeholder: string) {
  const textarea = document.querySelector('textarea') as HTMLTextAreaElement | null;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end) || placeholder;
  const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);

  textarea.value = newText;
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
}
