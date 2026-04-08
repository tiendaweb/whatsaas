'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Calendar,
  Clock,
  Users,
  Bell,
  Check,
  AlertCircle,
  Trash2,
} from 'lucide-react';

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
type TeamMember = {
  id: number;
  user: {
    id: number;
    name: string | null;
    email: string;
  };
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const EVENT_COLORS = {
  scheduled: { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900' },
  completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900' },
  canceled: { bg: 'bg-slate-500/10', text: 'text-slate-700 dark:text-slate-400', badge: 'bg-slate-100 dark:bg-slate-900' },
};

export function CalendarDashboard() {
  const { data: eventsData, mutate } = useSWR<TeamEvent[]>('/api/plugins/calendar/events', fetcher);
  const { data: notificationsData, mutate: mutateNotifications } = useSWR<TeamNotification[]>('/api/plugins/calendar/notifications', fetcher);
  const { data: teamMembersData } = useSWR<TeamMember[]>('/api/team/members', fetcher);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const teamMembers = teamMembersData ?? [];

  const events = eventsData ?? [];
  const notifications = notificationsData ?? [];
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const upcoming = useMemo(
    () => [...events]
      .filter((event) => new Date(event.startsAt) >= new Date() && event.status !== 'canceled')
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
      .slice(0, 5),
    [events],
  );

  const calendarDays = generateCalendarDays(currentDate);
  const weekDays = generateWeekDays(currentDate);

  async function createEvent() {
    if (!title.trim() || !startsAt) {
      alert('Título y fecha de inicio son requeridos');
      return;
    }
    await fetch('/api/plugins/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        startsAt,
        endsAt: endsAt || startsAt,
        attendees: selectedAttendees,
        notes,
      }),
    });
    setTitle('');
    setStartsAt('');
    setEndsAt('');
    setSelectedAttendees([]);
    setNotes('');
    setShowForm(false);
    mutate();
    mutateNotifications();
  }

  async function updateEventStatus(id: number, status: TeamEvent['status']) {
    await fetch(`/api/plugins/calendar/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    mutate();
  }

  async function deleteEvent(id: number) {
    if (!confirm('¿Estás seguro?')) return;
    await fetch(`/api/plugins/calendar/events/${id}`, { method: 'DELETE' });
    mutate();
  }

  async function markAllRead() {
    await fetch('/api/plugins/calendar/notifications', { method: 'PATCH' });
    mutateNotifications();
  }

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.startsAt);
      return eventDate.getFullYear() === date.getFullYear() &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getDate() === date.getDate();
    });
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendario del equipo</h1>
          <p className="text-muted-foreground">Administra eventos y reuniones</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nuevo evento
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Crear evento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Título</label>
              <Input
                placeholder="Título del evento"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha y hora de inicio</label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha y hora de fin</label>
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Asistentes del equipo</label>
              <div className="rounded-lg border border-border/50 p-3 space-y-2 max-h-40 overflow-auto">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay usuarios vinculados al equipo.</p>
                ) : (
                  teamMembers.map((member) => {
                    const attendeeValue = member.user.email;
                    const label = member.user.name?.trim() || member.user.email;
                    const checked = selectedAttendees.includes(attendeeValue);
                    return (
                      <label key={member.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedAttendees((prev) => [...prev, attendeeValue]);
                              return;
                            }
                            setSelectedAttendees((prev) => prev.filter((item) => item !== attendeeValue));
                          }}
                        />
                        <span>{label}</span>
                        {label !== member.user.email ? (
                          <span className="text-muted-foreground">({member.user.email})</span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notas</label>
              <Textarea
                placeholder="Notas adicionales..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                className="min-h-[170px]"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button onClick={createEvent}>Crear evento</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Calendar */}
        <div className="space-y-4">
          {/* View Toggle & Navigation */}
          <div className="flex items-center justify-between bg-card rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-2">
              <Button
                variant={view === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('month')}
              >
                Mes
              </Button>
              <Button
                variant={view === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('week')}
              >
                Semana
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newDate = new Date(currentDate);
                    if (view === 'month') {
                      newDate.setMonth(newDate.getMonth() - 1);
                    } else {
                      newDate.setDate(newDate.getDate() - 7);
                    }
                    setCurrentDate(newDate);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentDate(new Date())}
                  className="px-3"
                >
                  Hoy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newDate = new Date(currentDate);
                    if (view === 'month') {
                      newDate.setMonth(newDate.getMonth() + 1);
                    } else {
                      newDate.setDate(newDate.getDate() + 7);
                    }
                    setCurrentDate(newDate);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Calendar View */}
          <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
            {view === 'month' ? (
              <MonthCalendarView
                days={calendarDays}
                currentDate={currentDate}
                events={events}
                getEventsForDate={getEventsForDate}
                onDateClick={(date) => {
                  setSelectedDate(date);
                  setStartsAt(date.toISOString().slice(0, 16));
                  setShowForm(true);
                }}
              />
            ) : (
              <WeekCalendarView
                days={weekDays}
                events={events}
                onEventUpdate={updateEventStatus}
                onEventDelete={deleteEvent}
              />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Notifications */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Notificaciones</h3>
              </div>
              <Badge variant="secondary">{unreadCount}</Badge>
            </div>

            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin notificaciones</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {notifications.slice(0, 10).map((notification) => (
                  <div
                    key={notification.id}
                    className={`rounded-lg p-2 text-xs space-y-1 ${
                      notification.readAt ? 'bg-muted/30' : 'bg-primary/5 border border-primary/20'
                    }`}
                  >
                    <p className="font-medium line-clamp-1">{notification.title}</p>
                    <p className="text-muted-foreground line-clamp-2">{notification.body}</p>
                  </div>
                ))}
              </div>
            )}

            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={markAllRead}
              >
                Marcar como leídas
              </Button>
            )}
          </div>

          {/* Upcoming Events */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Próximos eventos
            </h3>

            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin eventos próximos</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-border/50 p-2.5 bg-background/50 space-y-1 text-xs hover:bg-background transition-colors"
                  >
                    <p className="font-medium line-clamp-2">{event.title}</p>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(event.startsAt).toLocaleString('es-ES', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {event.attendees.length > 0 && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {event.attendees.length} asistentes
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components

function MonthCalendarView({
  days,
  currentDate,
  events,
  getEventsForDate,
  onDateClick,
}: {
  days: (Date | null)[];
  currentDate: Date;
  events: TeamEvent[];
  getEventsForDate: (date: Date) => TeamEvent[];
  onDateClick: (date: Date) => void;
}) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-px mb-2">
        {DAYS.map((day) => (
          <div key={day} className="text-center font-semibold text-xs p-2 text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-border/30 p-px">
        {days.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="aspect-square bg-muted/50" />;
          }

          const dayEvents = getEventsForDate(day);
          const isToday = new Date().toDateString() === day.toDateString();
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDateClick(day)}
              className={`aspect-square p-1 cursor-pointer transition-all hover:bg-primary/5 ${
                isCurrentMonth ? 'bg-background' : 'bg-muted/20'
              } ${isToday ? 'border-2 border-primary' : 'border border-border/30'}`}
            >
              <div className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => {
                  const colors = EVENT_COLORS[event.status];
                  return (
                    <div
                      key={event.id}
                      className={`text-[10px] px-1 py-0.5 rounded truncate ${colors.bg} ${colors.text}`}
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{dayEvents.length - 3} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekCalendarView({
  days,
  events,
  onEventUpdate,
  onEventDelete,
}: {
  days: Date[];
  events: TeamEvent[];
  onEventUpdate: (id: number, status: TeamEvent['status']) => void;
  onEventDelete: (id: number) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto p-4">
      <div className="grid gap-px bg-border/30" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
        {/* Hours header */}
        <div className="bg-muted/50 p-2 text-xs font-semibold text-muted-foreground text-center">Hora</div>

        {/* Day headers */}
        {days.map((day) => (
          <div key={day.toISOString()} className="bg-muted/50 p-2 text-xs font-semibold text-center">
            <div>{DAYS[day.getDay()]}</div>
            <div className="text-muted-foreground">{day.getDate()}</div>
          </div>
        ))}

        {/* Time slots */}
        {hours.map((hour) => (
          <div key={`hour-${hour}`}>
            <div className="bg-background p-2 text-xs text-muted-foreground text-center border-b border-border/30">
              {`${hour}:00`}
            </div>
          </div>
        ))}

        {/* Events in week view */}
        {hours.map((hour) =>
          days.map((day) => {
            const dayEvents = events.filter((event) => {
              const eventDate = new Date(event.startsAt);
              const eventHour = eventDate.getHours();
              return (
                eventDate.toDateString() === day.toDateString() &&
                eventHour === hour
              );
            });

            return (
              <div key={`${day.toISOString()}-${hour}`} className="bg-background border-b border-r border-border/30 p-1 min-h-16 relative">
                {dayEvents.map((event) => {
                  const colors = EVENT_COLORS[event.status];
                  return (
                    <div
                      key={event.id}
                      className={`text-xs rounded p-1 mb-0.5 ${colors.bg} ${colors.text} hover:shadow-md transition-shadow cursor-pointer`}
                      title={event.title}
                    >
                      <p className="font-semibold line-clamp-1">{event.title}</p>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Helper functions

function generateCalendarDays(date: Date): (Date | null)[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const days: (Date | null)[] = [];
  const current = new Date(startDate);

  while (days.length < 42) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function generateWeekDays(date: Date): Date[] {
  const current = new Date(date);
  const dayOfWeek = current.getDay();
  const diff = current.getDate() - dayOfWeek;
  current.setDate(diff);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(current);
    day.setDate(day.getDate() + i);
    return day;
  });
}
