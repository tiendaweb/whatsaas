'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  MessageSquareText,
  Pencil,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Store,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type RuleKey = 'before_30' | 'before_14' | 'before_3' | 'expired';
type RecipientSource = 'account' | 'website' | 'store';
type CandidateStatus = 'pending' | 'approved' | 'sending' | 'sent' | 'rejected' | 'failed' | 'cancelled';
type Config = {
  enabled: boolean;
  instanceId: number | null;
  recipientSource: RecipientSource;
  sendHour: number;
  sendMinute: number;
  timezone: string;
  templates: Record<RuleKey, string>;
  enabledRuleKeys: RuleKey[];
};
type Candidate = {
  id: number;
  customerName: string | null;
  planName: string;
  ruleKey: RuleKey;
  expirationDate: string;
  dueDate: string;
  sendAt: string | null;
  status: CandidateStatus;
  requestedRecipientSource: RecipientSource;
  resolvedRecipientSource: RecipientSource | null;
  recipientPhone: string | null;
  usedAccountFallback: boolean;
  message: string;
  error: string | null;
};
type State = {
  config: Config;
  candidates: Candidate[];
  connection: { connected: boolean; status: string; lastSyncedAt: string | null; lastSyncStatus: string | null; lastSyncError: string | null };
};
type Instance = { id: number; instanceName: string };
type RecipientOption = {
  key: string;
  source: RecipientSource;
  phone: string;
  storeId: number | null;
  title: string | null;
  url: string | null;
};
type RecipientOptionsResponse = {
  candidateId: number;
  selectedOptionKey: string | null;
  options: RecipientOption[];
};

async function fetcher(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

const RULES: RuleKey[] = ['before_30', 'before_14', 'before_3', 'expired'];
const STATUSES: CandidateStatus[] = ['pending', 'approved', 'sending', 'sent', 'rejected', 'failed', 'cancelled'];

function formatDate(value: string, locale: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value: string | null, locale: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function calendarDateKey(value: string | null, timeZone: string) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return `${date.toISOString().slice(0, 7)}-01`;
}

function monthDays(month: string) {
  const first = new Date(`${month}T12:00:00Z`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(gridStart.getUTCDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function calendarStatusClass(status: CandidateStatus) {
  if (status === 'failed') return 'border-l-destructive bg-destructive/5';
  if (status === 'approved' || status === 'sending') return 'border-l-primary bg-primary/10';
  if (status === 'sent') return 'border-l-primary/60 bg-primary/5';
  return 'border-l-muted-foreground bg-muted/50';
}

function AappRenewalCalendar({
  candidates,
  month,
  setMonth,
  timeZone,
  locale,
  onSelect,
  onAction,
  actingIds,
}: {
  candidates: Candidate[];
  month: string;
  setMonth: (month: string) => void;
  timeZone: string;
  locale: string;
  onSelect: (candidate: Candidate) => void;
  onAction: (candidate: Candidate, action: 'approve' | 'reject') => void;
  actingIds: number[];
}) {
  const t = useTranslations('ScheduledMessagesAapp');
  const days = useMemo(() => monthDays(month), [month]);
  const today = calendarDateKey(new Date().toISOString(), timeZone);
  const monthPrefix = month.slice(0, 7);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const key = calendarDateKey(candidate.sendAt, timeZone) ?? candidate.dueDate;
      const items = map.get(key) ?? [];
      items.push(candidate);
      map.set(key, items);
    }
    for (const items of map.values()) items.sort((a, b) => (a.sendAt ?? '').localeCompare(b.sendAt ?? ''));
    return map;
  }, [candidates, timeZone]);
  const monthCount = candidates.filter((candidate) => (calendarDateKey(candidate.sendAt, timeZone) ?? candidate.dueDate).startsWith(monthPrefix)).length;
  const firstMonday = new Date('2026-07-20T12:00:00Z');
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstMonday);
    date.setUTCDate(date.getUTCDate() + index);
    return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date);
  });
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}T12:00:00Z`));
  const goToday = () => {
    const key = calendarDateKey(new Date().toISOString(), timeZone)!;
    setMonth(`${key.slice(0, 7)}-01`);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold capitalize tracking-tight">{monthLabel}</h3>
          <p className="text-xs text-muted-foreground">{t('calendar_month_count', { count: monthCount })} · {timeZone}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goToday}>{t('calendar_today')}</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('calendar_previous')}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('calendar_next')}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {weekdayLabels.map((label) => <div key={label} className="border-r px-2 py-2 text-xs font-medium capitalize text-muted-foreground last:border-r-0">{label}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const items = eventsByDay.get(day) ?? [];
              const inMonth = day.startsWith(monthPrefix);
              return (
                <div key={day} className={`min-h-32 border-b border-r p-1.5 last:border-r-0 ${inMonth ? 'bg-background' : 'bg-muted/20 text-muted-foreground'}`}>
                  <div className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums ${day === today ? 'bg-primary font-semibold text-primary-foreground' : ''}`}>{Number(day.slice(-2))}</div>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((candidate) => (
                      <div key={candidate.id} className={`overflow-hidden rounded-sm border border-l-2 ${calendarStatusClass(candidate.status)}`}>
                        <button type="button" onClick={() => onSelect(candidate)} className="w-full px-1.5 py-1 text-left transition-colors hover:bg-muted">
                          <span className="block truncate text-[11px] font-medium">{candidate.customerName || t('unnamed_customer')}</span>
                          <span className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground"><span className="truncate">{t(`rule_${candidate.ruleKey}`)}</span><span className="shrink-0 tabular-nums">{candidate.sendAt ? new Date(candidate.sendAt).toLocaleTimeString(locale, { timeZone, hour: '2-digit', minute: '2-digit' }) : ''}</span></span>
                        </button>
                        {candidate.status === 'pending' && (
                          <div className="grid grid-cols-2 border-t bg-background/70">
                            <button type="button" onClick={() => onAction(candidate, 'approve')} disabled={actingIds.includes(candidate.id)} className="flex h-6 items-center justify-center gap-1 border-r px-1 text-[9px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50" aria-label={`${t('approve')}: ${candidate.customerName || t('unnamed_customer')}`}>
                              {actingIds.includes(candidate.id) ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}{t('approve')}
                            </button>
                            <button type="button" onClick={() => onAction(candidate, 'reject')} disabled={actingIds.includes(candidate.id)} className="flex h-6 items-center justify-center gap-1 px-1 text-[9px] font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50" aria-label={`${t('reject')}: ${candidate.customerName || t('unnamed_customer')}`}>
                              <X className="h-2.5 w-2.5" />{t('reject')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {items.length > 3 && <p className="px-1 text-[10px] font-medium text-muted-foreground">{t('calendar_more', { count: items.length - 3 })}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AappRenewalDashboard() {
  const t = useTranslations('ScheduledMessagesAapp');
  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const locale = typeof navigator === 'undefined' ? 'es' : navigator.language;
  const key = `/api/plugins/scheduled-messages/aapp-space?timezone=${encodeURIComponent(browserTimezone)}`;
  const { data, error, isLoading, mutate } = useSWR<State>(key, fetcher);
  const { data: instances = [] } = useSWR<Instance[]>('/api/instance/list', fetcher);
  const [draft, setDraft] = useState<Config | null>(null);
  const [busy, setBusy] = useState<'save' | 'refresh' | 'action' | null>(null);
  const [actingIds, setActingIds] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | CandidateStatus>('pending');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [month, setMonth] = useState(() => {
    const today = calendarDateKey(new Date().toISOString(), browserTimezone)!;
    return `${today.slice(0, 7)}-01`;
  });
  const [calendarInitialized, setCalendarInitialized] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [previewing, setPreviewing] = useState<Candidate | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editRecipientKey, setEditRecipientKey] = useState('');
  const { data: recipientData, isLoading: recipientOptionsLoading } = useSWR<RecipientOptionsResponse>(
    editing ? `/api/plugins/scheduled-messages/aapp-space/candidates/${editing.id}` : null,
    fetcher,
  );

  useEffect(() => {
    if (data?.config) setDraft(data.config);
  }, [data?.config]);

  const candidates = data?.candidates ?? [];
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((item) => [item, candidates.filter((candidate) => candidate.status === item).length])) as Record<CandidateStatus, number>, [candidates]);
  const visible = useMemo(() => candidates.filter((candidate) => {
    if (status !== 'all' && candidate.status !== status) return false;
    const query = search.trim().toLowerCase();
    return !query || `${candidate.customerName ?? ''} ${candidate.planName} ${candidate.recipientPhone ?? ''}`.toLowerCase().includes(query);
  }), [candidates, search, status]);
  const visiblePendingIds = visible
    .filter((candidate) => candidate.status === 'pending' && Boolean(candidate.recipientPhone))
    .map((candidate) => candidate.id);

  useEffect(() => {
    if (!editing || recipientData?.candidateId !== editing.id) return;
    setEditRecipientKey(recipientData.selectedOptionKey ?? recipientData.options[0]?.key ?? '');
  }, [editing, recipientData]);

  useEffect(() => {
    if (calendarInitialized || !draft || candidates.length === 0) return;
    const today = calendarDateKey(new Date().toISOString(), draft.timezone)!;
    const dates = candidates.map((candidate) => calendarDateKey(candidate.sendAt, draft.timezone) ?? candidate.dueDate).sort();
    const nearest = dates.find((date) => date >= today) ?? dates.at(-1);
    if (nearest) setMonth(`${nearest.slice(0, 7)}-01`);
    setCalendarInitialized(true);
  }, [calendarInitialized, candidates, draft]);

  async function saveConfig() {
    if (!draft) return;
    if (draft.enabled && !draft.instanceId) return toast.error(t('instance_required'));
    setBusy('save');
    try {
      const response = await fetch('/api/plugins/scheduled-messages/aapp-space', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : t('save_error'));
      toast.success(t('saved'));
      await mutate();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : t('save_error'));
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy('refresh');
    try {
      const response = await fetch('/api/plugins/scheduled-messages/aapp-space/refresh', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('refresh_error'));
      toast.success(t('refreshed', { customers: body.sync.customers, notices: body.queue.created }));
      await mutate();
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : t('refresh_error'));
    } finally {
      setBusy(null);
    }
  }

  async function action(ids: number[], nextAction: 'approve' | 'reject' | 'revoke' | 'reopen' | 'retry') {
    if (!ids.length) return;
    const optimisticStatus: Record<typeof nextAction, CandidateStatus> = {
      approve: 'approved',
      reject: 'rejected',
      revoke: 'pending',
      reopen: 'pending',
      retry: 'approved',
    };
    let result: { changed?: number; skipped?: number } = {};
    setBusy('action');
    setActingIds(ids);
    try {
      const affected = new Set(ids);
      await mutate(async () => {
        const url = ids.length === 1
          ? `/api/plugins/scheduled-messages/aapp-space/candidates/${ids[0]}`
          : '/api/plugins/scheduled-messages/aapp-space/bulk';
        const response = await fetch(url, {
          method: ids.length === 1 ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ids.length === 1 ? { action: nextAction } : { ids, action: nextAction }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || t('action_error'));
        result = body;
        return fetcher(key);
      }, {
        optimisticData: (current) => {
          const currentState = current ?? data!;
          return {
            ...currentState,
            candidates: currentState.candidates.map((candidate) => affected.has(candidate.id)
              ? { ...candidate, status: optimisticStatus[nextAction], error: nextAction === 'retry' ? null : candidate.error }
              : candidate),
          };
        },
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      });
      if ((result.skipped ?? 0) > 0) toast.warning(t('action_skipped', { count: result.skipped ?? 0 }));
      if ((result.changed ?? 0) > 0) toast.success(t('action_done', { count: result.changed ?? ids.length }));
      setSelected([]);
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : t('action_error'));
    } finally {
      setActingIds([]);
      setBusy(null);
    }
  }

  async function saveCandidate() {
    if (!editing || !editMessage.trim()) return;
    setBusy('action');
    try {
      const response = await fetch(`/api/plugins/scheduled-messages/aapp-space/candidates/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: editMessage.trim(),
          ...(editRecipientKey ? { recipientOptionKey: editRecipientKey } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('save_error'));
      toast.success(t('notice_saved'));
      setEditing(null);
      await mutate();
    } catch (candidateError) {
      toast.error(candidateError instanceof Error ? candidateError.message : t('save_error'));
    } finally {
      setBusy(null);
    }
  }

  function openEdit(candidate: Candidate) {
    setEditing(candidate);
    setEditMessage(candidate.message);
    setEditRecipientKey('');
  }

  if (isLoading || !draft) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="sr-only">{t('loading')}</span></div>;
  }
  if (error) {
    return <div className="p-6"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>{t('load_error_title')}</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert></div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /><h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1></div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refresh} disabled={busy !== null || !data?.connection.connected}>
              <RefreshCw className={`mr-2 h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />{t('sync_button')}
            </Button>
            <Button onClick={saveConfig} disabled={busy !== null}>
              {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}{t('save_button')}
            </Button>
          </div>
        </div>

        {!data?.connection.connected && (
          <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>{t('not_connected_title')}</AlertTitle><AlertDescription>{t('not_connected_description')}</AlertDescription></Alert>
        )}
        {data?.connection.lastSyncError && (
          <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>{t('sync_warning')}</AlertTitle><AlertDescription>{data.connection.lastSyncError}</AlertDescription></Alert>
        )}

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4">
              <div><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" />{t('settings_title')}</CardTitle><CardDescription>{t('settings_description')}</CardDescription></div>
              <div className="flex items-center gap-2"><span className="text-sm font-medium">{draft.enabled ? t('enabled') : t('disabled')}</span><Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} /></div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5 text-sm"><span className="font-medium">{t('instance')}</span><Select value={draft.instanceId ? String(draft.instanceId) : 'none'} onValueChange={(value) => setDraft({ ...draft, instanceId: value === 'none' ? null : Number(value) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('select_instance')}</SelectItem>{instances.map((instance) => <SelectItem key={instance.id} value={String(instance.id)}>{instance.instanceName}</SelectItem>)}</SelectContent></Select></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">{t('default_recipient')}</span><Select value={draft.recipientSource} onValueChange={(value: RecipientSource) => setDraft({ ...draft, recipientSource: value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="account">{t('source_account')}</SelectItem><SelectItem value="website">{t('source_website')}</SelectItem><SelectItem value="store">{t('source_store')}</SelectItem></SelectContent></Select></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">{t('send_time')}</span><Input type="time" value={`${String(draft.sendHour).padStart(2, '0')}:${String(draft.sendMinute).padStart(2, '0')}`} onChange={(event) => { if (!event.target.value) return; const [hour, minute] = event.target.value.split(':').map(Number); setDraft({ ...draft, sendHour: hour, sendMinute: minute }); }} /></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">{t('timezone')}</span><Input value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} placeholder={browserTimezone} /></label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquareText className="h-4 w-4" />{t('templates_title')}</CardTitle><CardDescription>{t('templates_description')}</CardDescription></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            {RULES.map((rule) => (
              <div key={rule} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{t(`rule_${rule}`)}</p><p className="text-xs text-muted-foreground">{t(`rule_${rule}_help`)}</p></div><Checkbox checked={draft.enabledRuleKeys.includes(rule)} onCheckedChange={(checked) => setDraft({ ...draft, enabledRuleKeys: checked ? [...new Set([...draft.enabledRuleKeys, rule])] : draft.enabledRuleKeys.filter((key) => key !== rule) })} /></div>
                <Textarea value={draft.templates[rule]} onChange={(event) => setDraft({ ...draft, templates: { ...draft.templates, [rule]: event.target.value } })} rows={4} disabled={!draft.enabledRuleKeys.includes(rule)} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground lg:col-span-2">{t('variables_help', { nombre: '{nombre}', plan: '{plan}', fecha_vencimiento: '{fecha_vencimiento}' })}</p>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="h-4 w-4" />{t('queue_title')}</h2><p className="text-sm text-muted-foreground">{t('queue_description')}</p></div>
            <div className="flex flex-wrap gap-2">
              {selected.length > 0 && <><Button size="sm" onClick={() => action(selected, 'approve')} disabled={busy !== null}><CheckCircle2 className="mr-1.5 h-4 w-4" />{t('approve_selected', { count: selected.length })}</Button><Button size="sm" variant="outline" onClick={() => action(selected, 'reject')} disabled={busy !== null}><XCircle className="mr-1.5 h-4 w-4" />{t('reject')}</Button></>}
              <div className="flex rounded-md border bg-muted/30 p-0.5">
                <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-7 gap-1.5" onClick={() => setView('list')}><List className="h-3.5 w-3.5" />{t('view_list')}</Button>
                <Button variant={view === 'calendar' ? 'secondary' : 'ghost'} size="sm" className="h-7 gap-1.5" onClick={() => { setView('calendar'); setStatus('all'); setSelected([]); }}><CalendarDays className="h-3.5 w-3.5" />{t('view_calendar')}</Button>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-2 sm:flex-row sm:items-center">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search_placeholder')} className="pl-9" /></div>
            <Select value={status} onValueChange={(value: 'all' | CandidateStatus) => { setStatus(value); setSelected([]); }}><SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('status_all')} ({candidates.length})</SelectItem>{STATUSES.map((item) => <SelectItem key={item} value={item}>{t(`status_${item}`)} ({counts[item]})</SelectItem>)}</SelectContent></Select>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center"><CalendarClock className="mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">{t(candidates.length ? 'no_results' : 'empty_title')}</p><p className="mt-1 max-w-md text-sm text-muted-foreground">{t(candidates.length ? 'no_results_help' : 'empty_description')}</p></div>
          ) : view === 'calendar' ? (
            <AappRenewalCalendar
              candidates={visible}
              month={month}
              setMonth={setMonth}
              timeZone={draft.timezone}
              locale={locale}
              onSelect={(candidate) => candidate.status === 'pending' ? openEdit(candidate) : setPreviewing(candidate)}
              onAction={(candidate, nextAction) => {
                if (nextAction === 'approve' && !candidate.recipientPhone) openEdit(candidate);
                else action([candidate.id], nextAction);
              }}
              actingIds={actingIds}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="hidden grid-cols-[36px_1.5fr_1fr_1fr_1.2fr_1fr_minmax(190px,auto)] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                <Checkbox checked={visiblePendingIds.length > 0 && visiblePendingIds.every((id) => selected.includes(id))} onCheckedChange={(checked) => setSelected(checked ? visiblePendingIds : [])} aria-label={t('select_all')} /><span>{t('customer')}</span><span>{t('rule')}</span><span>{t('expiration')}</span><span>{t('recipient')}</span><span>{t('status')}</span><span className="text-right">{t('actions')}</span>
              </div>
              {visible.map((candidate) => (
                <div key={candidate.id} className="grid gap-3 border-b p-4 last:border-b-0 lg:grid-cols-[36px_1.5fr_1fr_1fr_1.2fr_1fr_minmax(190px,auto)] lg:items-center">
                  <Checkbox
                    className={candidate.status === 'pending' ? '' : 'invisible'}
                    checked={selected.includes(candidate.id)}
                    disabled={!candidate.recipientPhone}
                    onCheckedChange={(checked) => setSelected(checked ? [...selected, candidate.id] : selected.filter((id) => id !== candidate.id))}
                    aria-label={candidate.recipientPhone ? t('select_notice') : t('choose_number_first')}
                  />
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{candidate.customerName || t('unnamed_customer')}</p><p className="truncate text-xs text-muted-foreground">{candidate.planName || 'AAPP Space'}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground lg:hidden">{candidate.message}</p></div>
                  <div><p className="text-sm">{t(`rule_${candidate.ruleKey}`)}</p><p className="text-xs text-muted-foreground">{formatDateTime(candidate.sendAt, locale)}</p></div>
                  <div><p className="text-sm">{formatDate(candidate.expirationDate, locale)}</p><p className="text-xs text-muted-foreground">{t('due')} {formatDate(candidate.dueDate, locale)}</p></div>
                  <div className="min-w-0"><div className="flex items-center gap-1.5 text-sm">{candidate.resolvedRecipientSource === 'account' ? <UserRound className="h-3.5 w-3.5 shrink-0" /> : <Store className="h-3.5 w-3.5 shrink-0" />}<span className="truncate">{candidate.recipientPhone || t('no_phone')}</span></div>{candidate.usedAccountFallback && <p className="text-xs text-muted-foreground">{t('account_fallback')}</p>}</div>
                  <div aria-live="polite"><Badge variant={candidate.status === 'failed' ? 'destructive' : candidate.status === 'approved' || candidate.status === 'sent' ? 'default' : 'secondary'}>{t(`status_${candidate.status}`)}</Badge>{candidate.error && <p className="mt-1 line-clamp-2 text-xs text-destructive" title={candidate.error}>{candidate.error}</p>}</div>
                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    {candidate.status === 'pending' && <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(candidate)} disabled={actingIds.includes(candidate.id)} aria-label={`${t('edit')}: ${candidate.customerName || t('unnamed_customer')}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      {candidate.recipientPhone ? (
                        <Button size="sm" className="h-8 px-2 text-xs" onClick={() => action([candidate.id], 'approve')} disabled={busy !== null}>{actingIds.includes(candidate.id) ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}{t('approve')}</Button>
                      ) : (
                        <Button size="sm" className="h-8 px-2 text-xs" onClick={() => openEdit(candidate)} disabled={busy !== null}><PhoneCall className="mr-1 h-3.5 w-3.5" />{t('choose_number')}</Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 px-2 text-xs text-destructive hover:text-destructive" onClick={() => action([candidate.id], 'reject')} disabled={busy !== null}><XCircle className="mr-1 h-3.5 w-3.5" />{t('reject')}</Button>
                    </>}
                    {candidate.status === 'approved' && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => action([candidate.id], 'revoke')} disabled={busy !== null}>{actingIds.includes(candidate.id) ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}{t('revoke')}</Button>}
                    {candidate.status === 'rejected' && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => action([candidate.id], 'reopen')} disabled={busy !== null}>{actingIds.includes(candidate.id) ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}{t('reopen')}</Button>}
                    {candidate.status === 'failed' && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => action([candidate.id], 'retry')} disabled={busy !== null}>{actingIds.includes(candidate.id) ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}{t('retry')}</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{t('edit_notice_title')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t('recipient_number')}</span>
              <Select value={editRecipientKey || undefined} onValueChange={setEditRecipientKey} disabled={recipientOptionsLoading || !recipientData?.options.length}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={recipientOptionsLoading ? t('loading_numbers') : t('no_numbers_available')} />
                </SelectTrigger>
                <SelectContent>
                  {recipientData?.options.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">
                          {option.title || option.url || t(option.source === 'account' ? 'source_account' : option.source === 'store' ? 'source_store' : 'source_website')}
                        </span>
                        <span className="shrink-0 text-muted-foreground">· {option.phone}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!recipientOptionsLoading && recipientData?.options.length === 0 && (
                <span className="block text-xs text-destructive">{t('no_numbers_help')}</span>
              )}
              {recipientData?.options.some((option) => option.source !== 'account') && (
                <span className="block text-xs text-muted-foreground">{t('site_store_numbers_help')}</span>
              )}
            </label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">{t('message')}</span><Textarea value={editMessage} onChange={(event) => setEditMessage(event.target.value)} rows={7} /></label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t('cancel')}</Button>
            <Button onClick={saveCandidate} disabled={!editMessage.trim() || busy !== null || recipientOptionsLoading || (Boolean(recipientData?.options.length) && !editRecipientKey)}>{busy === 'action' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('save_button')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(previewing)} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{previewing?.customerName || t('unnamed_customer')}</DialogTitle></DialogHeader>
          {previewing && <div className="space-y-4 text-sm">
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">{t('rule')}</p><p className="font-medium">{t(`rule_${previewing.ruleKey}`)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t('status')}</p><Badge variant={previewing.status === 'failed' ? 'destructive' : 'secondary'}>{t(`status_${previewing.status}`)}</Badge></div>
              <div><p className="text-xs text-muted-foreground">{t('expiration')}</p><p>{formatDate(previewing.expirationDate, locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t('recipient')}</p><p>{previewing.recipientPhone || t('no_phone')}</p></div>
            </div>
            <div><p className="mb-1 text-xs text-muted-foreground">{t('message')}</p><p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3">{previewing.message}</p></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setPreviewing(null)}>{t('close')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
