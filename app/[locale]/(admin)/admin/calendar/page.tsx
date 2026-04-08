'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertCircle,
  TrendingUp,
  Clock,
  Users,
  Trash2,
  Filter,
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
  createdBy?: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const EVENT_COLORS = {
  scheduled: { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900' },
  completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900' },
  canceled: { bg: 'bg-slate-500/10', text: 'text-slate-700 dark:text-slate-400', badge: 'bg-slate-100 dark:bg-slate-900' },
};

export default function AdminCalendarPage() {
  const { data: eventsData, mutate } = useSWR<TeamEvent[]>('/api/plugins/calendar/events', fetcher);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'scheduled' | 'completed' | 'canceled'>('all');
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);

  const events = eventsData ?? [];
  const calendarDays = generateCalendarDays(currentDate);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesSearch =
        searchQuery === '' ||
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.notes.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'all' || event.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [events, searchQuery, filterStatus]);

  const stats = useMemo(() => {
    const total = events.length;
    const scheduled = events.filter((e) => e.status === 'scheduled').length;
    const completed = events.filter((e) => e.status === 'completed').length;
    const canceled = events.filter((e) => e.status === 'canceled').length;
    const thisMonth = events.filter((e) => {
      const eventDate = new Date(e.startsAt);
      return eventDate.getMonth() === currentDate.getMonth() &&
             eventDate.getFullYear() === currentDate.getFullYear();
    }).length;
    const overdue = events.filter((e) => {
      const eventDate = new Date(e.startsAt);
      return eventDate < new Date() && e.status === 'scheduled';
    }).length;

    return { total, scheduled, completed, canceled, thisMonth, overdue };
  }, [events, currentDate]);

  async function deleteEvent(id: number) {
    if (!confirm('¿Estás seguro de que deseas eliminar este evento?')) return;
    await fetch(`/api/plugins/calendar/events/${id}`, { method: 'DELETE' });
    mutate();
  }

  const getEventsForDate = (date: Date) => {
    return filteredEvents.filter((event) => {
      const eventDate = new Date(event.startsAt);
      return eventDate.getFullYear() === date.getFullYear() &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getDate() === date.getDate();
    });
  };

  const getEventDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Administración de Calendario</h1>
        <p className="text-muted-foreground">Monitorea y gestiona todos los eventos del equipo</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} icon={Calendar} color="text-blue-500" />
        <StatCard label="Programados" value={stats.scheduled} icon={Calendar} color="text-blue-500" />
        <StatCard label="Completados" value={stats.completed} icon={Calendar} color="text-emerald-500" />
        <StatCard label="Cancelados" value={stats.canceled} icon={Calendar} color="text-slate-500" />
        <StatCard label="Este mes" value={stats.thisMonth} icon={TrendingUp} color="text-primary" />
        <StatCard
          label="Vencidos"
          value={stats.overdue}
          icon={AlertCircle}
          color="text-destructive"
          highlight={stats.overdue > 0}
        />
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Calendar */}
        <div className="space-y-4">
          {/* Navigation */}
          <div className="flex items-center justify-between bg-card rounded-lg border border-border/50 p-4">
            <h2 className="text-lg font-semibold">
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(newDate.getMonth() - 1);
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
                  newDate.setMonth(newDate.getMonth() + 1);
                  setCurrentDate(newDate);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
            <div className="p-4">
              <div className="grid grid-cols-7 gap-px mb-2">
                {DAYS.map((day) => (
                  <div key={day} className="text-center font-semibold text-xs p-2 text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px bg-border/30 p-px">
                {calendarDays.map((day, idx) => {
                  if (!day) {
                    return <div key={`empty-${idx}`} className="aspect-square bg-muted/50" />;
                  }

                  const dayEvents = getEventsForDate(day);
                  const isToday = new Date().toDateString() === day.toDateString();
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();

                  return (
                    <div
                      key={day.toISOString()}
                      className={`aspect-square p-2 cursor-default transition-all ${
                        isCurrentMonth ? 'bg-background' : 'bg-muted/20'
                      } ${isToday ? 'border-2 border-primary' : 'border border-border/30'}`}
                    >
                      <div
                        className={`text-xs font-semibold mb-1 ${
                          isToday ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5 overflow-hidden">
                        {dayEvents.slice(0, 2).map((event) => {
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
                        {dayEvents.length > 2 && (
                          <div className="text-[10px] text-muted-foreground px-1">
                            +{dayEvents.length - 2}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Filters */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4">
            <div>
              <label className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Filter className="h-4 w-4" />
                Filtros
              </label>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Buscar evento</label>
                  <Input
                    placeholder="Título o notas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Estado</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="scheduled">Programados</option>
                    <option value="completed">Completados</option>
                    <option value="canceled">Cancelados</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Events List */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Eventos ({filteredEvents.length})</h3>

            <div className="max-h-[600px] overflow-y-auto space-y-2">
              {filteredEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Sin eventos que coincidan con los filtros
                </p>
              ) : (
                filteredEvents.map((event) => {
                  const colors = EVENT_COLORS[event.status];
                  const isExpanded = expandedEvent === event.id;

                  return (
                    <div
                      key={event.id}
                      className="rounded-lg border border-border/50 bg-background/50 overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                        className="w-full p-3 text-left hover:bg-background transition-colors flex items-start justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm line-clamp-1">{event.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(event.startsAt).toLocaleString('es-ES', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <Badge variant="outline" className={`ml-2 shrink-0 ${colors.badge}`}>
                          {event.status}
                        </Badge>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border/50 p-3 space-y-2 text-xs bg-muted/20">
                          {event.attendees.length > 0 && (
                            <div className="flex items-start gap-2">
                              <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-muted-foreground mb-1">Asistentes</p>
                                <p className="line-clamp-2">{event.attendees.join(', ')}</p>
                              </div>
                            </div>
                          )}

                          {event.notes && (
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground">Notas:</span>
                              <p className="line-clamp-2">{event.notes}</p>
                            </div>
                          )}

                          <div className="text-muted-foreground">
                            Duración: {getEventDuration(event.startsAt, event.endsAt)}
                          </div>

                          <button
                            onClick={() => deleteEvent(event.id)}
                            className="flex items-center gap-1.5 text-destructive hover:text-destructive/80 transition-colors mt-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 space-y-2 ${
        highlight ? 'bg-destructive/5 border-destructive/50' : 'border-border/50 bg-card'
      }`}
    >
      <div className={`flex items-center gap-2 text-sm ${color}`}>
        {typeof Icon === 'function' ? <Icon className="h-4 w-4" /> : Icon}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

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
