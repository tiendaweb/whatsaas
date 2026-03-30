'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

type NoteStatus = 'todo' | 'in_progress' | 'done';

type TeamNote = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  status: NoteStatus;
  dueDate: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function NotesDashboard() {
  const { data, mutate } = useSWR<TeamNote[]>('/api/plugins/notes', fetcher);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [status, setStatus] = useState<NoteStatus>('todo');
  const [dueDate, setDueDate] = useState('');
  const [filterTag, setFilterTag] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | NoteStatus>('all');

  const notes = data ?? [];
  const tags = Array.from(new Set(notes.flatMap((note) => note.tags))).sort();

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      if (filterTag !== 'all' && !note.tags.includes(filterTag)) return false;
      if (filterStatus !== 'all' && note.status !== filterStatus) return false;
      return true;
    });
  }, [notes, filterStatus, filterTag]);

  const grouped = {
    todo: filtered.filter((note) => note.status === 'todo'),
    in_progress: filtered.filter((note) => note.status === 'in_progress'),
    done: filtered.filter((note) => note.status === 'done'),
  };

  async function createNote() {
    const tags = tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);
    await fetch('/api/plugins/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, tags, status, dueDate: dueDate || null }),
    });
    setTitle('');
    setContent('');
    setTagsText('');
    setDueDate('');
    mutate();
  }

  async function moveNote(noteId: number, status: NoteStatus) {
    await fetch(`/api/plugins/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    mutate();
  }

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-semibold">Team Notes</h2>

      <div className="grid gap-4 rounded-lg border p-4">
        <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <RichTextEditor value={content} onChange={setContent} />
        <Input placeholder="tags separadas por coma" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        <div className="grid gap-3 md:grid-cols-3">
          <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as NoteStatus)}>
            <option value="todo">Por hacer</option>
            <option value="in_progress">En progreso</option>
            <option value="done">Hecho</option>
          </select>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Button onClick={createNote}>Guardar nota</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <select className="rounded-md border px-3 py-2 text-sm" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
          <option value="all">Todos los tags</option>
          {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | NoteStatus)}>
          <option value="all">Todos los estados</option>
          <option value="todo">Por hacer</option>
          <option value="in_progress">En progreso</option>
          <option value="done">Hecho</option>
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(['todo', 'in_progress', 'done'] as const).map((column) => (
          <div key={column} className="rounded-lg border p-3">
            <h3 className="mb-3 font-medium capitalize">{column.replace('_', ' ')}</h3>
            <div className="space-y-3">
              {grouped[column].map((note) => (
                <div key={note.id} className="space-y-2 rounded-md border p-3 text-sm">
                  <p className="font-semibold">{note.title}</p>
                  <p className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: note.content }} />
                  <div className="flex flex-wrap gap-1">{note.tags.map((tag) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => moveNote(note.id, 'todo')}>Todo</Button>
                    <Button size="sm" variant="outline" onClick={() => moveNote(note.id, 'in_progress')}>Doing</Button>
                    <Button size="sm" variant="outline" onClick={() => moveNote(note.id, 'done')}>Done</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => document.execCommand('bold')}>Negrita</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => document.execCommand('italic')}>Itálica</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => document.execCommand('insertUnorderedList')}>Lista</Button>
      </div>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={5} placeholder="Contenido (HTML básico permitido)" />
    </div>
  );
}
