'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Plus, LayoutGrid, LayoutList,
  Calendar, MessageSquare, Kanban, X,
  StickyNote, Clock, CheckCircle2, AlertTriangle,
} from 'lucide-react';
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
  eventId?: number | null;
  commitments?: { text: string; assigneeUserId?: number; dueDate?: string; taskItemId?: number; taskStatus?: string; taskCompletedAt?: string | null }[];
  createdAt?: string;
  updatedAt?: string;
};

type TeamMemberRow = { userId: number; user: { name: string | null; email: string } };

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Error al cargar notas (${response.status})`);
  return response.json();
};

const VIEW_CONFIG: Record<ViewType, { label: string; icon: React.ElementType }> = {
  kanban: { label: 'Kanban', icon: Kanban },
  grid:   { label: 'Tarjetas', icon: LayoutGrid },
  list:   { label: 'Lista', icon: LayoutList },
  chat:   { label: 'Timeline', icon: MessageSquare },
  calendar: { label: 'Calendario', icon: Calendar },
};

export function NotesDashboard() {
  const { data, mutate } = useSWR<TeamNote[]>('/api/plugins/notes', fetcher);
  const { data: membersData } = useSWR<TeamMemberRow[]>('/api/team/members', fetcher);
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [defaultEventId, setDefaultEventId] = useState<number | null>(null);

  const notes = data ?? [];
  const teamMembers = (membersData ?? []).map((m) => ({ userId: m.userId, label: m.user.name || m.user.email }));

  useEffect(() => {
    const eventIdParam = new URLSearchParams(window.location.search).get('eventId');
    if (eventIdParam) {
      setDefaultEventId(Number(eventIdParam));
      setCreateOpen(true);
    }
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    return {
      total:       notes.length,
      todo:        notes.filter(n => n.status === 'todo').length,
      in_progress: notes.filter(n => n.status === 'in_progress').length,
      done:        notes.filter(n => n.status === 'done').length,
      overdue:     notes.filter(n => n.dueDate && new Date(n.dueDate) < now && n.status !== 'done').length,
    };
  }, [notes]);

  const filtered = useMemo(() => {
    if (!searchQuery) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [notes, searchQuery]);

  async function createNote(noteData: NoteEditorData) {
    await fetch('/api/plugins/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: noteData.title,
        content: noteData.content,
        tags: noteData.tags,
        pinned: noteData.pinned,
        status: noteData.status,
        dueDate: noteData.dueDate || null,
        eventId: noteData.eventId ?? null,
        commitments: noteData.commitments ?? [],
      }),
    });
    setDefaultEventId(null);
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
        pinned: noteData.pinned,
        status: noteData.status,
        dueDate: noteData.dueDate || null,
        eventId: noteData.eventId ?? null,
        commitments: noteData.commitments ?? [],
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
    if (!confirm('¿Eliminar esta nota?')) return;
    await fetch(`/api/plugins/notes/${noteId}`, { method: 'DELETE' });
    mutate();
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Tareas</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Organiza ideas, pendientes y seguimientos del equipo
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 w-48 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* View selector */}
            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
              {(Object.entries(VIEW_CONFIG) as [ViewType, typeof VIEW_CONFIG[ViewType]][]).map(([view, cfg]) => {
                const Icon = cfg.icon;
                const active = currentView === view;
                return (
                  <button
                    key={view}
                    onClick={() => setCurrentView(view)}
                    title={cfg.label}
                    className={`h-7 w-7 rounded-md flex items-center justify-center transition-all text-xs ${
                      active
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>

            {/* Create */}
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="h-9 gap-1.5 px-3 text-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva nota
            </Button>
          </div>
        </div>

        {/* Stats row */}
        {notes.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
            <StatChip icon={StickyNote} label="Total" value={stats.total} color="text-muted-foreground" />
            <StatChip icon={Clock} label="Pendientes" value={stats.todo} color="text-blue-500" />
            <StatChip icon={AlertTriangle} label="En progreso" value={stats.in_progress} color="text-amber-500" />
            <StatChip icon={CheckCircle2} label="Completados" value={stats.done} color="text-emerald-500" />
            {stats.overdue > 0 && (
              <StatChip icon={AlertTriangle} label="Vencidas" value={stats.overdue} color="text-destructive" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {currentView === 'kanban'   && <KanbanView   notes={filtered} onDelete={deleteNote} onUpdate={updateNote} onMove={moveNote} />}
        {currentView === 'grid'     && <GridView     notes={filtered} onDelete={deleteNote} onUpdate={updateNote} />}
        {currentView === 'list'     && <ListView     notes={filtered} onDelete={deleteNote} onUpdate={updateNote} />}
        {currentView === 'chat'     && <ChatView     notes={filtered} onDelete={deleteNote} onUpdate={updateNote} />}
        {currentView === 'calendar' && <CalendarView notes={filtered} onDelete={deleteNote} onUpdate={updateNote} />}
      </div>

      <NoteEditor
        open={createOpen}
        onOpenChange={(open) => { setCreateOpen(open); if (!open) setDefaultEventId(null); }}
        onSave={createNote}
        defaultEventId={defaultEventId}
        teamMembers={teamMembers}
      />
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}
