'use client';

import { useState, useMemo, useRef, useEffect, type KeyboardEvent } from 'react';
import { ZONA_NEGOCIO, aLocal, parsearLocal } from '@/lib/time/zona';
import useSWR from 'swr';
import { PROGRAMADOS_API, programadosFetcher } from './swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Clock,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Play,
  Pause,
  Search,
  X,
  CalendarDays,
  MessageSquare,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  User,
  Filter,
  Hash,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AappRenewalDashboard } from './AappRenewalDashboard';

// ─── Types ─────────────────────────────────────────────────────────────────

type ScheduledMessage = {
  id: number;
  teamId: number;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  instanceId: number | null;
  instanceName: string | null;
  targetNumbers: string[];
  scheduleType: 'once' | 'daily' | 'weekly';
  scheduledAt: string | null;
  hour: number | null;
  minute: number | null;
  weekdays: number[];
  actionType: 'message' | 'automation';
  message: string | null;
  mediaUrl: string | null;
  automationId: number | null;
  automationName: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  maxRuns: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type Instance = { id: number; instanceName: string };
type AutomationOption = { id: number; name: string };

type FormState = {
  id?: number;
  name: string;
  status: 'active' | 'paused';
  instanceId: string;
  targetNumbers: string[];
  scheduleType: 'once' | 'daily' | 'weekly';
  scheduledAt: string;
  hour: string;
  minute: string;
  weekdays: number[];
  actionType: 'message' | 'automation';
  message: string;
  mediaUrl: string;
  automationId: string;
  maxRuns: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const defaultForm = (): FormState => ({
  name: '',
  status: 'active',
  instanceId: '',
  targetNumbers: [],
  scheduleType: 'once',
  scheduledAt: '',
  hour: '9',
  minute: '0',
  weekdays: [],
  actionType: 'message',
  message: '',
  mediaUrl: '',
  automationId: '',
  maxRuns: '',
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

function formatSchedule(msg: ScheduledMessage): string {
  if (msg.scheduleType === 'once') {
    if (!msg.scheduledAt) return 'Una vez';
    return new Date(msg.scheduledAt).toLocaleString('es-ES', {
      timeZone: ZONA_NEGOCIO,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  const time = `${String(msg.hour ?? 9).padStart(2, '0')}:${String(msg.minute ?? 0).padStart(2, '0')}`;
  if (msg.scheduleType === 'daily') return `Diario ${time}`;
  if (msg.scheduleType === 'weekly') {
    const days = (msg.weekdays ?? []).map(d => WEEKDAY_LABELS[d]).join(', ');
    return `${days || 'Sin días'} ${time}`;
  }
  return '';
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const absDiff = Math.abs(diff);
  if (absDiff < 60_000) return 'Ahora';
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000);
    return diff < 0 ? `Hace ${mins}m` : `En ${mins}m`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000);
    return diff < 0 ? `Hace ${hrs}h` : `En ${hrs}h`;
  }
  return d.toLocaleString('es-ES', { timeZone: ZONA_NEGOCIO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: ScheduledMessage['status']) {
  switch (status) {
    case 'active':
      return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] h-5 px-1.5">Activo</Badge>;
    case 'paused':
      return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] h-5 px-1.5">Pausado</Badge>;
    case 'completed':
      return <Badge className="bg-slate-500/15 text-slate-500 border-slate-500/30 text-[10px] h-5 px-1.5">Completado</Badge>;
    case 'failed':
      return <Badge className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px] h-5 px-1.5">Fallido</Badge>;
  }
}

// ─── Types for RecipientPicker ───────────────────────────────────────────────

type ContactResult = { id: number; name: string; phone: string; jid: string; funnelStageId: number | null };
type FunnelStage   = { id: number; name: string; emoji: string | null };

// ─── RecipientPicker ─────────────────────────────────────────────────────────

function RecipientPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [tab, setTab]             = useState<'search' | 'stage' | 'manual'>('search');
  const [query, setQuery]         = useState('');
  const [stageId, setStageId]     = useState<string>('all');
  const [manualInput, setManualInput] = useState('');
  const [open, setOpen]           = useState(false);
  const dropRef                   = useRef<HTMLDivElement>(null);

  // Funnel stages for filter tab
  const { data: stages = [] } = useSWR<FunnelStage[]>('/api/funnel-stages', (url: string) => fetch(url).then(r => r.json()));

  // Contact search (debounced via SWR key)
  const searchKey = (tab === 'search' && (query.length >= 2))
    ? `/api/plugins/scheduled-messages/contacts?q=${encodeURIComponent(query)}`
    : (tab === 'stage' && stageId !== 'all')
    ? `/api/plugins/scheduled-messages/contacts?stageId=${stageId}`
    : null;

  const { data: results = [], isLoading } = useSWR<ContactResult[]>(searchKey, (url: string) => fetch(url).then(r => r.json()));

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const remove = (phone: string) => onChange(value.filter(v => v !== phone));

  const addPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (clean && !value.includes(clean)) onChange([...value, clean]);
  };

  const addContact = (c: ContactResult) => {
    if (!value.includes(c.phone)) onChange([...value, c.phone]);
  };

  const addAllFromStage = () => {
    const newPhones = results.map(r => r.phone).filter(p => !value.includes(p));
    if (newPhones.length) onChange([...value, ...newPhones]);
  };

  const handleManualKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addPhone(manualInput);
      setManualInput('');
    } else if (e.key === 'Backspace' && !manualInput && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      {/* Tags list */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(phone => (
            <span
              key={phone}
              className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded-full px-2.5 py-1 font-mono"
            >
              <Hash className="h-2.5 w-2.5 shrink-0" />
              {phone}
              <button type="button" onClick={() => remove(phone)} className="ml-0.5 hover:text-primary/60 transition-colors">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-muted-foreground hover:text-destructive transition-colors px-1"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Picker UI */}
      <div className="border border-input rounded-lg bg-background overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-border bg-muted/30">
          {([
            { key: 'search', label: 'Buscar contacto', icon: Search },
            { key: 'stage',  label: 'Por etapa',       icon: Filter },
            { key: 'manual', label: 'Manual',           icon: Hash   },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setOpen(key !== 'manual'); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-r border-border last:border-0 ${
                tab === key ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {/* Search tab */}
        {tab === 'search' && (
          <div className="relative" ref={dropRef}>
            <div className="flex items-center gap-2 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => query.length >= 2 && setOpen(true)}
                placeholder="Nombre o número del contacto..."
                className="flex-1 outline-none bg-transparent text-sm placeholder:text-muted-foreground"
              />
              {query && <button type="button" onClick={() => { setQuery(''); setOpen(false); }} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
            {open && query.length >= 2 && (
              <div className="border-t border-border max-h-48 overflow-y-auto">
                {isLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Buscando...</p>
                ) : results.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin resultados</p>
                ) : results.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { addContact(c); setOpen(false); setQuery(''); }}
                    disabled={value.includes(c.phone)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-3 w-3 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{c.phone}</p>
                    </div>
                    {value.includes(c.phone) && <span className="ml-auto text-[10px] text-muted-foreground">Agregado</span>}
                  </button>
                ))}
              </div>
            )}
            {query.length > 0 && query.length < 2 && (
              <p className="text-[11px] text-muted-foreground px-3 pb-2">Escribe al menos 2 caracteres</p>
            )}
          </div>
        )}

        {/* Stage filter tab */}
        {tab === 'stage' && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={stageId}
                onChange={e => setStageId(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
              >
                <option value="all">Seleccionar etapa del embudo...</option>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
                ))}
              </select>
            </div>
            {stageId !== 'all' && (
              <div className="max-h-48 overflow-y-auto">
                {isLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
                ) : results.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin contactos en esta etapa</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border">
                      <span className="text-[11px] text-muted-foreground">{results.length} contacto{results.length !== 1 ? 's' : ''}</span>
                      <button
                        type="button"
                        onClick={addAllFromStage}
                        className="text-[11px] text-primary hover:text-primary/70 font-medium transition-colors"
                      >
                        Agregar todos
                      </button>
                    </div>
                    {results.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => addContact(c)}
                        disabled={value.includes(c.phone)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-3 w-3 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{c.phone}</p>
                        </div>
                        {value.includes(c.phone)
                          ? <span className="text-[10px] text-muted-foreground shrink-0">✓</span>
                          : <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        }
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manual tab */}
        {tab === 'manual' && (
          <div className="px-3 py-2">
            <input
              autoFocus
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={handleManualKey}
              placeholder="Ej: 5491112345678 (con código de país) — Enter para agregar"
              className="w-full outline-none bg-transparent text-sm placeholder:text-muted-foreground"
            />
          </div>
        )}
      </div>

      {value.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Agrega destinatarios buscando contactos, filtrando por etapa del embudo o ingresando números manualmente.</p>
      )}
    </div>
  );
}

// ─── MessageForm Dialog ──────────────────────────────────────────────────────

function MessageFormDialog({
  open,
  form,
  setForm,
  instances,
  automations,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  form: FormState;
  setForm: (f: FormState) => void;
  instances: Instance[];
  automations: AutomationOption[];
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const isEditing = Boolean(form.id);

  function update<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm({ ...form, [key]: val });
  }

  function toggleWeekday(d: number) {
    const current = form.weekdays;
    if (current.includes(d)) {
      update('weekdays', current.filter(v => v !== d));
    } else {
      update('weekdays', [...current, d].sort());
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-rose-500" />
            {isEditing ? 'Editar mensaje programado' : 'Nuevo mensaje programado'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nombre</label>
            <Input
              placeholder="Ej. Recordatorio matutino"
              value={form.name}
              onChange={e => update('name', e.target.value)}
            />
          </div>

          {/* Instance */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Instancia de WhatsApp</label>
            <select
              value={form.instanceId}
              onChange={e => update('instanceId', e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Seleccionar instancia...</option>
              {instances.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.instanceName}</option>
              ))}
            </select>
          </div>

          {/* Target numbers */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Números destinatarios</label>
            <RecipientPicker
              value={form.targetNumbers}
              onChange={v => update('targetNumbers', v)}
            />
          </div>

          {/* Schedule type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tipo de programación</label>
            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5 w-fit">
              {(['once', 'daily', 'weekly'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('scheduleType', type)}
                  className={`h-8 px-3 rounded-md text-xs font-medium transition-all ${
                    form.scheduleType === type
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type === 'once' ? 'Una vez' : type === 'daily' ? 'Diario' : 'Semanal'}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule details */}
          {form.scheduleType === 'once' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fecha y hora</label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={e => update('scheduledAt', e.target.value)}
              />
            </div>
          )}

          {(form.scheduleType === 'daily' || form.scheduleType === 'weekly') && (
            <div className="space-y-3">
              {form.scheduleType === 'weekly' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Días de la semana</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleWeekday(idx)}
                        className={`h-8 w-10 rounded-md text-xs font-medium border transition-all ${
                          form.weekdays.includes(idx)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora</label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.hour}
                    onChange={e => update('hour', e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  >
                    {hours.map(h => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-muted-foreground font-medium">:</span>
                  <select
                    value={form.minute}
                    onChange={e => update('minute', e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  >
                    {minutes.map(m => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Max runs for recurring */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Máximo de envíos <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Ilimitado"
                  value={form.maxRuns}
                  onChange={e => update('maxRuns', e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
          )}

          {/* Action type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Acción</label>
            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5 w-fit">
              {(['message', 'automation'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('actionType', type)}
                  className={`h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                    form.actionType === type
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type === 'message' ? (
                    <><MessageSquare className="h-3 w-3" /> Mensaje</>
                  ) : (
                    <><Zap className="h-3 w-3" /> Automatización</>
                  )}
                </button>
              ))}
            </div>
          </div>

          {form.actionType === 'message' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mensaje</label>
              <textarea
                value={form.message}
                onChange={e => update('message', e.target.value)}
                placeholder="Escribe el mensaje que se enviará..."
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          )}

          {form.actionType === 'automation' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Automatización</label>
              <select
                value={form.automationId}
                onChange={e => update('automationId', e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Seleccionar automatización...</option>
                {automations.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear mensaje'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ hasMessages, onNew }: { hasMessages: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-14 w-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4">
        <Clock className="h-7 w-7 text-rose-500" />
      </div>
      <h3 className="text-base font-semibold mb-1">
        {hasMessages ? 'Sin resultados' : 'Sin mensajes programados'}
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        {hasMessages
          ? 'Prueba ajustando los filtros de búsqueda.'
          : 'Crea un mensaje programado para enviar textos automáticamente a tus contactos.'}
      </p>
      {!hasMessages && (
        <Button onClick={onNew} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Crear primer mensaje
        </Button>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

function GeneralScheduledMessagesDashboard() {
  // Clave y fetcher compartidos con el Command Center y con Tareas: SWR cachea
  // por clave, y dos fetchers con formas distintas sobre esta URL se pisan.
  const { data, mutate } = useSWR(PROGRAMADOS_API, programadosFetcher<ScheduledMessage>);
  const { data: instances } = useSWR<Instance[]>('/api/instance/list', fetcher);
  const { data: automationsData } = useSWR<AutomationOption[]>('/api/automation/templates', fetcher);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);

  const messages = data?.rows ?? [];
  const instanceList = instances ?? [];

  // Extract automations for dropdown (from templates endpoint)
  const automationList: AutomationOption[] = useMemo(() => {
    if (!automationsData) return [];
    if (Array.isArray(automationsData)) {
      return automationsData.map((a: any) => ({ id: a.id, name: a.name }));
    }
    return [];
  }, [automationsData]);

  const stats = useMemo(() => ({
    total: messages.length,
    active: messages.filter(m => m.status === 'active').length,
    paused: messages.filter(m => m.status === 'paused').length,
    completed: messages.filter(m => m.status === 'completed').length,
  }), [messages]);

  const filtered = useMemo(() => {
    let list = messages;
    if (statusFilter !== 'all') {
      list = list.filter(m => m.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.instanceName ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [messages, statusFilter, search]);

  function msgToForm(msg: ScheduledMessage): FormState {
    return {
      id: msg.id,
      name: msg.name,
      status: msg.status === 'active' || msg.status === 'paused' ? msg.status : 'active',
      instanceId: msg.instanceId != null ? String(msg.instanceId) : '',
      targetNumbers: msg.targetNumbers ?? [],
      scheduleType: msg.scheduleType,
      // En hora del negocio: `toISOString` mostraba la hora UTC (tres más) al editar.
      scheduledAt: msg.scheduledAt ? aLocal(new Date(msg.scheduledAt)) : '',
      hour: msg.hour != null ? String(msg.hour) : '9',
      minute: msg.minute != null ? String(msg.minute) : '0',
      weekdays: msg.weekdays ?? [],
      actionType: msg.actionType,
      message: msg.message ?? '',
      mediaUrl: msg.mediaUrl ?? '',
      automationId: msg.automationId != null ? String(msg.automationId) : '',
      maxRuns: msg.maxRuns != null ? String(msg.maxRuns) : '',
    };
  }

  function handleNew() {
    setForm(defaultForm());
    setFormOpen(true);
  }

  function handleEdit(msg: ScheduledMessage) {
    setForm(msgToForm(msg));
    setFormOpen(true);
  }

  async function handleDelete(msg: ScheduledMessage) {
    if (!confirm(`¿Eliminar "${msg.name}"?`)) return;
    await fetch(`/api/plugins/scheduled-messages/${msg.id}`, { method: 'DELETE' });
    mutate();
  }

  async function handleToggle(msg: ScheduledMessage) {
    await fetch(`/api/plugins/scheduled-messages/${msg.id}/toggle`, { method: 'POST' });
    mutate();
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        status: form.status,
        instanceId: form.instanceId ? parseInt(form.instanceId, 10) : null,
        targetNumbers: form.targetNumbers,
        scheduleType: form.scheduleType,
        // La hora escrita es la del negocio (Argentina), no la del navegador.
        scheduledAt: form.scheduleType === 'once' && form.scheduledAt ? (parsearLocal(form.scheduledAt)?.toISOString() ?? null) : null,
        hour: (form.scheduleType === 'daily' || form.scheduleType === 'weekly') ? parseInt(form.hour, 10) : null,
        minute: (form.scheduleType === 'daily' || form.scheduleType === 'weekly') ? parseInt(form.minute, 10) : null,
        weekdays: form.scheduleType === 'weekly' ? form.weekdays : [],
        actionType: form.actionType,
        message: form.actionType === 'message' ? form.message || null : null,
        mediaUrl: form.mediaUrl || null,
        automationId: form.actionType === 'automation' && form.automationId ? parseInt(form.automationId, 10) : null,
        maxRuns: (form.scheduleType !== 'once' && form.maxRuns) ? parseInt(form.maxRuns, 10) : null,
      };

      if (form.id) {
        await fetch(`/api/plugins/scheduled-messages/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/plugins/scheduled-messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      await mutate();
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const STATUS_TABS = [
    { value: 'all' as const, label: 'Todos' },
    { value: 'active' as const, label: 'Activos' },
    { value: 'paused' as const, label: 'Pausados' },
    { value: 'completed' as const, label: 'Completados' },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Clock className="h-5 w-5 text-rose-500" />
              Mensajes Programados
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Envía mensajes de forma automática a tus contactos en momentos específicos
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-8 h-9 w-48 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button size="sm" onClick={handleNew} className="h-9 gap-1.5 px-3 text-sm">
              <Plus className="h-3.5 w-3.5" />
              Nuevo mensaje
            </Button>
          </div>
        </div>

        {/* Stats */}
        {messages.length > 0 && (
          <div className="flex items-center gap-5 mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-xs font-semibold text-muted-foreground">{stats.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Play className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Activos</span>
              <span className="text-xs font-semibold text-emerald-500">{stats.active}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Pause className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-muted-foreground">Pausados</span>
              <span className="text-xs font-semibold text-amber-500">{stats.paused}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-muted-foreground">Completados</span>
              <span className="text-xs font-semibold text-slate-400">{stats.completed}</span>
            </div>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="border-b border-border bg-background px-6 py-2 flex items-center gap-2">
        <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`h-7 px-3 rounded-md text-xs font-medium transition-all ${
                statusFilter === tab.value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <EmptyState hasMessages={messages.length > 0} onNew={handleNew} />
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr_0.8fr_auto] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Nombre</span>
              <span>Destino</span>
              <span>Programación</span>
              <span>Acción</span>
              <span>Próximo envío</span>
              <span>Estado</span>
              <span />
            </div>

            {/* Rows */}
            {filtered.map((msg, idx) => (
              <div
                key={msg.id}
                className={`grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr_0.8fr_auto] gap-4 px-4 py-3 items-center text-sm transition-colors hover:bg-muted/30 ${
                  idx < filtered.length - 1 ? 'border-b border-border/50' : ''
                }`}
              >
                {/* Name */}
                <div className="min-w-0">
                  <p className="font-medium truncate">{msg.name}</p>
                  {msg.runCount > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      <RefreshCw className="h-2.5 w-2.5 inline mr-0.5" />
                      {msg.runCount} {msg.runCount === 1 ? 'envío' : 'envíos'}
                      {msg.maxRuns ? ` / ${msg.maxRuns}` : ''}
                    </p>
                  )}
                </div>

                {/* Target */}
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    {msg.instanceName ?? 'Sin instancia'}
                  </p>
                  <p className="text-xs font-medium mt-0.5">
                    {msg.targetNumbers?.length ?? 0} número{(msg.targetNumbers?.length ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Schedule */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3 shrink-0" />
                    <span className="truncate">{formatSchedule(msg)}</span>
                  </div>
                </div>

                {/* Action type */}
                <div>
                  {msg.actionType === 'message' ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      <span className="truncate">{msg.message ? msg.message.slice(0, 30) + (msg.message.length > 30 ? '…' : '') : 'Mensaje'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Zap className="h-3 w-3" />
                      <span className="truncate">{msg.automationName ?? 'Automatización'}</span>
                    </div>
                  )}
                </div>

                {/* Next run */}
                <div className="text-xs">
                  {msg.status === 'completed' ? (
                    <span className="text-muted-foreground">Completado</span>
                  ) : msg.status === 'paused' ? (
                    <span className="text-muted-foreground">Pausado</span>
                  ) : (
                    <span className={msg.nextRunAt ? 'text-foreground' : 'text-muted-foreground'}>
                      {formatRelativeDate(msg.nextRunAt)}
                    </span>
                  )}
                  {msg.lastRunAt && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Último: {formatRelativeDate(msg.lastRunAt)}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <div>
                  {statusBadge(msg.status)}
                  {msg.status === 'failed' && msg.lastError && (
                    <p
                      className="text-[10px] text-red-500 mt-1 max-w-[220px] line-clamp-3"
                      title={msg.lastError}
                    >
                      {msg.lastError}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => handleEdit(msg)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Editar
                    </DropdownMenuItem>
                    {(msg.status === 'active' || msg.status === 'paused') && (
                      <DropdownMenuItem onClick={() => handleToggle(msg)}>
                        {msg.status === 'active' ? (
                          <><Pause className="mr-2 h-3.5 w-3.5" /> Pausar</>
                        ) : (
                          <><Play className="mr-2 h-3.5 w-3.5" /> Activar</>
                        )}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleDelete(msg)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form dialog */}
      <MessageFormDialog
        open={formOpen}
        form={form}
        setForm={setForm}
        instances={instanceList}
        automations={automationList}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}

export function ScheduledMessagesDashboard() {
  const t = useTranslations('ScheduledMessagesAapp');
  return (
    <Tabs defaultValue="general" className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b bg-card/30 px-4 pt-3 sm:px-6">
        <TabsList className="h-9">
          <TabsTrigger value="general" className="px-4 text-xs sm:text-sm">{t('tab_general')}</TabsTrigger>
          <TabsTrigger value="aapp" className="px-4 text-xs sm:text-sm">{t('tab_aapp')}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="general" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <GeneralScheduledMessagesDashboard />
      </TabsContent>
      <TabsContent value="aapp" className="mt-0 min-h-0 flex-1 overflow-hidden">
        <AappRenewalDashboard />
      </TabsContent>
    </Tabs>
  );
}
