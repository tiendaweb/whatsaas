'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, LayoutGrid, LayoutList, Calendar, MessageSquare, Grid3x3 } from 'lucide-react';
import { NoteEditor, NoteEditorData } from './NoteEditor';
import { KanbanView } from './KanbanView';
import { GridView } from './GridView';
import { ListView } from './ListView';
import { ChatView } from './ChatView';
import { CalendarView } from './CalendarView';

type NoteStatus = 'todo' | 'in_progress' | 'done';
type ViewType = 'kanban' | 'grid' | 'list' | 'chat' | 'calendar';

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

const VIEW_CONFIG = {
  kanban: { label: 'Kanban', icon: LayoutGrid },
  grid: { label: 'Grid', icon: Grid3x3 },
  list: { label: 'Lista', icon: LayoutList },
  chat: { label: 'Chat', icon: MessageSquare },
  calendar: { label: 'Calendario', icon: Calendar },
};

export function NotesDashboard() {
  const { data, mutate } = useSWR<TeamNote[]>('/api/plugins/notes', fetcher);
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const notes = data ?? [];

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

  async function createNote(noteData: NoteEditorData) {
    const tags = noteData.tags;
    await fetch('/api/plugins/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: noteData.title,
        content: noteData.content,
        tags,
        status: noteData.status,
        dueDate: noteData.dueDate || null,
      }),
    });
    mutate();
  }

  async function updateNote(noteId: number, noteData: NoteEditorData) {
    await fetch(`/api/plugins/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: noteData.title,
        content: noteData.content,
        tags: noteData.tags,
        status: noteData.status,
        dueDate: noteData.dueDate || null,
      }),
    });
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

  return (
    <div className="space-y-6 p-6 w-full">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Notas del equipo</h1>
        <p className="text-muted-foreground">Organiza tareas, ideas y notas en el formato que prefieras</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar notas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* View Selector */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {(Object.entries(VIEW_CONFIG) as [ViewType, (typeof VIEW_CONFIG)[ViewType]][]).map(
            ([view, config]) => {
              const Icon = config.icon;
              return (
                <Button
                  key={view}
                  variant={currentView === view ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCurrentView(view)}
                  title={config.label}
                  className="h-8 w-8 p-0"
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            }
          )}
        </div>

        {/* Create Button */}
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nueva nota
        </Button>
      </div>

      {/* Views */}
      <div>
        {currentView === 'kanban' && (
          <KanbanView notes={filtered} onDelete={deleteNote} onUpdate={updateNote} onMove={moveNote} />
        )}
        {currentView === 'grid' && <GridView notes={filtered} onDelete={deleteNote} onUpdate={updateNote} />}
        {currentView === 'list' && <ListView notes={filtered} onDelete={deleteNote} onUpdate={updateNote} />}
        {currentView === 'chat' && <ChatView notes={filtered} onDelete={deleteNote} onUpdate={updateNote} />}
        {currentView === 'calendar' && <CalendarView notes={filtered} onDelete={deleteNote} onUpdate={updateNote} />}
      </div>

      {/* Create Note Dialog */}
      <NoteEditor open={createOpen} onOpenChange={setCreateOpen} onSave={createNote} />
    </div>
  );
}
