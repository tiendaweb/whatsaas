'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Ban, Bot, ChevronDown, ChevronUp, FileText, Inbox, Loader2, Mic, Save, Search, Sparkles, Trash2, Undo2, UserSquare2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { CustomAudioPlayer } from '@/components/ui/custom-audio-player';
import { cn } from '@/lib/utils';
import type { AudioEstado, AudioFila, NuncaTranscribir } from '../../server/audios';
import { GateBadge } from '../components/GateBadge';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher, fmtInt, tiempoRelativo } from '../components/format';
import type { Gate } from '../../shared/taxonomy';

const ESTADOS: Array<{ id: AudioEstado; label: string }> = [
  { id: 'pendientes', label: 'Sin transcribir' },
  { id: 'en_cola', label: 'En cola' },
  { id: 'transcriptos', label: 'Transcriptos' },
  { id: 'fallidos', label: 'Fallidos' },
  { id: 'todos', label: 'Todos' },
];

const INTENTS = ['consulta', 'pedido', 'reclamo', 'pago', 'coordinacion', 'seguimiento', 'saludo', 'otro'];
const URGENCIAS = ['baja', 'media', 'alta'];

const STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', queued: 'En cola', done: 'Transcripto', failed: 'Falló' };
const STATUS_TONE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  queued: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-destructive/10 text-destructive',
};

/**
 * Audios: las notas de voz de los chats, con su transcripción y análisis, y
 * las acciones a mano.
 *
 * Los audios se transcriben solos con el banco de keys, pero el banco rinde
 * poco y a la tarde se agota: acá se puede escuchar el audio, transcribirlo o
 * analizarlo ya, corregir la ficha a mano, o pedirle a un conector que lo
 * escuche y dé contexto (queda en la cola como pedido aprobado). "Sólo en
 * cola" filtra los chats que tienen algo por salir: son los que conviene
 * escuchar antes de que salga.
 */
export function AudiosView({ onOpen }: { onOpen?: (chatId: number) => void }) {
  const [estado, setEstado] = useState<AudioEstado>('pendientes');
  // Arranca con todos: con «sólo en cola» muchas veces no hay ninguno pendiente y la pantalla salía vacía.
  const [enCola, setEnCola] = useState(false);
  const [q, setQ] = useState('');
  const url = `${SALES_OPS_API}/audios?estado=${estado}&enCola=${enCola ? 1 : 0}&q=${encodeURIComponent(q.trim())}&limit=80`;
  const { data, error, isLoading, mutate } = useSWR<{ rows: AudioFila[]; nunca: NuncaTranscribir[] }>(url, fetcher, { keepPreviousData: true });
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const [contacto, setContacto] = useState<number | 'todos'>('todos');
  const [verNunca, setVerNunca] = useState(false);
  const [marcando, setMarcando] = useState<number | null>(null);

  /** Una tarjeta por contacto: los audios de la misma persona se leen juntos. */
  const grupos = useMemo(() => {
    const map = new Map<number, { chatId: number; nombre: string; gate: string | null; enCola: boolean; audios: AudioFila[] }>();
    for (const r of rows) {
      const g = map.get(r.chatId) ?? { chatId: r.chatId, nombre: r.nombre, gate: r.gate, enCola: false, audios: [] };
      g.audios.push(r);
      g.enCola = g.enCola || r.enCola;
      map.set(r.chatId, g);
    }
    return Array.from(map.values()).sort((a, b) => Number(b.enCola) - Number(a.enCola) || b.audios[0].timestamp.localeCompare(a.audios[0].timestamp));
  }, [rows]);
  const visibles = contacto === 'todos' ? grupos : grupos.filter((g) => g.chatId === contacto);

  const nunca = async (chatId: number, valor: boolean, nombre: string) => {
    if (valor && !window.confirm(`¿Nunca transcribir los audios de ${nombre}? Salen de esta lista y de la cola; lo ya transcripto se conserva.`)) return;
    setMarcando(chatId);
    try {
      const res = await fetch(`${SALES_OPS_API}/audios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'nunca', chatId, nunca: valor }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      toast.success(valor ? `${nombre}: nunca transcribir${body.quitados ? ` (${body.quitados} sacados de la cola)` : ''}.` : `${nombre}: vuelve a transcribirse.`);
      if (contacto === chatId) setContacto('todos');
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setMarcando(null);
    }
  };

  if (error) return <ErrorState message={String((error as Error).message ?? error)} onRetry={() => void mutate()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por contacto, teléfono o texto transcripto" className="h-9 pl-8 pr-8 text-sm" />
          {q && (
            <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Limpiar">
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEnCola((v) => !v)}
          aria-pressed={enCola}
          className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs', enCola ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted')}
        >
          <Inbox className="size-3.5" aria-hidden />
          Sólo chats en cola
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ESTADOS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setEstado(e.id)}
            aria-pressed={estado === e.id}
            className={cn('shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors', estado === e.id ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            {e.label}
          </button>
        ))}
        <span className="ml-auto shrink-0 self-center text-[11px] tabular-nums text-muted-foreground">{fmtInt(rows.length)} audios · {fmtInt(grupos.length)} contactos</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={contacto} onChange={(e) => setContacto(e.target.value === 'todos' ? 'todos' : Number(e.target.value))} className="h-8 max-w-full rounded-md border border-input bg-background px-2 text-xs" aria-label="Filtrar por contacto">
          <option value="todos">Todos los contactos ({grupos.length})</option>
          {grupos.map((g) => (
            <option key={g.chatId} value={g.chatId}>
              {g.nombre} ({g.audios.length})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setVerNunca((v) => !v)}
          aria-pressed={verNunca}
          className={cn('ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs', verNunca ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted')}
        >
          <Ban className="size-3.5" aria-hidden />
          Nunca transcribir · {data?.nunca?.length ?? 0}
        </button>
      </div>

      {verNunca && (
        <div className="space-y-1.5 rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Contactos cuyos audios no entran a la cola ni a esta lista. Lo que ya estaba transcripto se conserva.</p>
          {(data?.nunca?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">Ninguno. Desde la tarjeta de un contacto, "Nunca transcribir".</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {data!.nunca.map((n) => (
                <li key={n.chatId} className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpen?.(n.chatId)}>{n.nombre}</button>
                  <button type="button" className="text-muted-foreground hover:text-foreground" title="Volver a transcribir" disabled={marcando === n.chatId} onClick={() => void nunca(n.chatId, false, n.nombre)}>
                    {marcando === n.chatId ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Undo2 className="size-3" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isLoading && !data && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Mic className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">Sin audios acá</p>
          <p className="mt-1 text-xs text-muted-foreground">{enCola ? 'Probá sacando "Sólo chats en cola" o cambiando el estado.' : 'Cambiá el estado o la búsqueda.'}</p>
        </div>
      )}

      <ul className="space-y-3">
        {visibles.map((g) => (
          <li key={g.chatId} className={cn('rounded-2xl border p-2.5', g.enCola ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20')}>
            <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
              <button type="button" className="truncate text-sm font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => onOpen?.(g.chatId)}>
                {g.nombre}
              </button>
              {g.gate && <GateBadge gate={g.gate as Gate} />}
              {g.enCola && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">en cola</span>}
              <span className="text-[11px] tabular-nums text-muted-foreground">{g.audios.length} audio{g.audios.length === 1 ? '' : 's'}</span>
              <div className="ml-auto flex items-center gap-0.5">
                {contacto === 'todos' && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setContacto(g.chatId)}>
                    Sólo este
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive" disabled={marcando === g.chatId} title="No transcribir nunca los audios de este contacto" onClick={() => void nunca(g.chatId, true, g.nombre)}>
                  {marcando === g.chatId ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Ban className="size-3" aria-hidden />}
                  Nunca transcribir
                </Button>
              </div>
            </div>
            <ul className="space-y-2">
              {g.audios.map((row) => (
                <li key={row.messageId}>
                  <AudioCard row={row} onOpen={onOpen} onChanged={() => void mutate()} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AudioCard({ row, onOpen, onChanged }: { row: AudioFila; onOpen?: (chatId: number) => void; onChanged: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [ficha, setFicha] = useState({
    transcript: row.insight.transcript ?? '',
    summary: row.insight.summary ?? '',
    intent: row.insight.intent ?? '',
    urgency: row.insight.urgency ?? '',
  });
  const status = row.insight.status;

  const accion = async (action: string, body: Record<string, unknown> = {}, ok = 'Listo.') => {
    setBusy(action);
    try {
      const res = await fetch(`${SALES_OPS_API}/audios/${encodeURIComponent(row.messageId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(cuerpo?.error ?? `Error ${res.status}`));
      toast.success(ok);
      onChanged();
      return cuerpo;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn('rounded-xl border bg-card px-3 py-2.5', row.enCola ? 'border-primary/40' : 'border-border')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', STATUS_TONE[status ?? 'pending'])}>{STATUS_LABEL[status ?? 'pending'] ?? 'Pendiente'}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {tiempoRelativo(row.timestamp)}
            {row.seconds ? ` · ${row.seconds} s` : ''}
            {row.fromMe ? ' · enviado por nosotros' : ''}
            {row.insight.provider ? ` · ${row.insight.provider}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {(status === 'queued' || status === 'pending' || status === 'failed') && (
            <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" title="Quitar de la cola de transcripción" disabled={busy !== null} onClick={() => void accion('dequeue', {}, 'Fuera de la cola.')}>
              {busy === 'dequeue' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
            </Button>
          )}
          {onOpen && (
            <Button type="button" variant="ghost" size="icon" className="size-7" title="Abrir la ficha" onClick={() => onOpen(row.chatId)}>
              <UserSquare2 className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="size-7" title={abierta ? 'Cerrar' : 'Ficha y acciones'} onClick={() => setAbierta((v) => !v)}>
            {abierta ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
          </Button>
        </div>
      </div>

      {row.src ? (
        <div className="mt-2">
          <CustomAudioPlayer src={row.src} isMe={false} />
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">El archivo de audio no está en el servidor.</p>
      )}

      {row.insight.transcript && !abierta && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground/85">{row.insight.transcript}</p>}
      {row.insight.summary && !abierta && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden />
          <span className="line-clamp-2">{row.insight.summary}</span>
        </p>
      )}
      {status === 'failed' && row.insight.error && <p className="mt-1 text-[11px] text-destructive">{row.insight.error}</p>}

      {abierta && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" disabled={busy !== null || !row.src} onClick={() => void accion('transcribe', {}, 'Transcripto.')}>
              {busy === 'transcribe' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <FileText className="size-3" aria-hidden />}
              Transcribir ahora
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" disabled={busy !== null || !row.insight.transcript} title={row.insight.transcript ? '' : 'Primero hace falta la transcripción'} onClick={() => void accion('analyze', {}, 'Analizado.')}>
              {busy === 'analyze' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
              Analizar
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-[11px]" disabled={busy !== null} onClick={() => void accion('queue', {}, 'En la cola de transcripción, con prioridad.')}>
              {busy === 'queue' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Inbox className="size-3" aria-hidden />}
              Encolar con prioridad
            </Button>
          </div>

          {/* Pedido al conector: lo escucha, lee el chat y devuelve contexto. */}
          <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/40 p-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Bot className="size-3" aria-hidden />
              Pedir contexto a un conector
            </p>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="resize-none text-xs" placeholder="Opcional: qué necesitás saber del audio (ej.: si confirmó el pago, qué fecha dijo…)" />
            <Button type="button" size="sm" className="h-7 gap-1.5 text-[11px]" disabled={busy !== null} onClick={() => void accion('ask_connector', { nota }, 'Pedido en la cola: lo toma el próximo conector.')}>
              {busy === 'ask_connector' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Bot className="size-3" aria-hidden />}
              Dejar el pedido en la cola
            </Button>
          </div>

          {/* Ficha editable: lo que quede acá es lo que ven el radar y el dossier. */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ficha (corregí y guardá)</p>
            <Textarea value={ficha.transcript} onChange={(e) => setFicha({ ...ficha, transcript: e.target.value })} rows={4} className="text-xs" placeholder="Transcripción" />
            <Input value={ficha.summary} onChange={(e) => setFicha({ ...ficha, summary: e.target.value })} className="h-8 text-xs" placeholder="Resumen en una línea" />
            <div className="flex flex-wrap gap-2">
              <select value={ficha.intent} onChange={(e) => setFicha({ ...ficha, intent: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Intención…</option>
                {INTENTS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
              <select value={ficha.urgency} onChange={(e) => setFicha({ ...ficha, urgency: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">Urgencia…</option>
                {URGENCIAS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                className="ml-auto h-8 gap-1.5 text-[11px]"
                disabled={busy !== null || !ficha.transcript.trim()}
                onClick={() =>
                  void accion(
                    'write',
                    { ficha: { transcript: ficha.transcript.trim(), summary: ficha.summary.trim() || undefined, intent: ficha.intent || undefined, urgency: ficha.urgency || undefined } },
                    'Ficha guardada.',
                  )
                }
              >
                {busy === 'write' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Save className="size-3" aria-hidden />}
                Guardar ficha
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
