'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

type TeamEvent = {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  attendees: string[];
  notes: string;
  reminderAt: string | null;
  status: 'scheduled' | 'completed' | 'canceled';
};

type TeamNotification = { id: number; title: string; body: string; readAt: string | null };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function CalendarDashboard() {
  const { data: eventsData, mutate } = useSWR<TeamEvent[]>('/api/plugins/calendar/events', fetcher);
  const { data: notificationsData, mutate: mutateNotifications } = useSWR<TeamNotification[]>('/api/plugins/calendar/notifications', fetcher);

  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [attendees, setAttendees] = useState('');
  const [notes, setNotes] = useState('');
  const [view, setView] = useState<'month' | 'week'>('month');

  const events = eventsData ?? [];
  const notifications = notificationsData ?? [];
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const upcoming = useMemo(
    () => [...events].filter((event) => new Date(event.startsAt) >= new Date()).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 5),
    [events],
  );

  async function createEvent() {
    await fetch('/api/plugins/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        startsAt,
        endsAt,
        attendees: attendees.split(',').map((item) => item.trim()).filter(Boolean),
        notes,
      }),
    });
    setTitle('');
    setStartsAt('');
    setEndsAt('');
    setAttendees('');
    setNotes('');
    mutate();
    mutateNotifications();
  }

  async function updateEvent(id: number, status: TeamEvent['status']) {
    await fetch(`/api/plugins/calendar/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    mutate();
  }

  async function markAllRead() {
    await fetch('/api/plugins/calendar/notifications', { method: 'PATCH' });
    mutateNotifications();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Calendar</h2>
        <Badge variant="secondary">Notificaciones: {unreadCount}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex gap-2">
            <Button variant={view === 'month' ? 'default' : 'outline'} onClick={() => setView('month')}>Mensual</Button>
            <Button variant={view === 'week' ? 'default' : 'outline'} onClick={() => setView('week')}>Semanal</Button>
          </div>
          <p className="text-sm text-muted-foreground">Vista {view === 'month' ? 'mensual' : 'semanal'} simplificada.</p>
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{event.title}</p>
                <p className="text-muted-foreground">{new Date(event.startsAt).toLocaleString()} → {new Date(event.endsAt).toLocaleString()}</p>
                <p className="text-muted-foreground">Asistentes: {event.attendees.join(', ') || '—'}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateEvent(event.id, 'scheduled')}>Programado</Button>
                  <Button size="sm" variant="outline" onClick={() => updateEvent(event.id, 'completed')}>Completado</Button>
                  <Button size="sm" variant="outline" onClick={() => updateEvent(event.id, 'canceled')}>Cancelado</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold">Próximas reuniones</h3>
            {upcoming.map((event) => <p key={event.id} className="text-sm">• {event.title} ({new Date(event.startsAt).toLocaleDateString()})</p>)}
          </div>
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Notificaciones internas</h3>
              <Button size="sm" variant="outline" onClick={markAllRead}>Marcar leídas</Button>
            </div>
            {notifications.map((notification) => (
              <div key={notification.id} className="rounded border p-2 text-sm">
                <p className="font-medium">{notification.title}</p>
                <p className="text-muted-foreground">{notification.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border p-4">
        <h3 className="font-semibold">Nuevo evento</h3>
        <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <Input placeholder="asistentes separados por coma" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        <Textarea placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button onClick={createEvent}>Guardar evento</Button>
      </div>
    </div>
  );
}
