'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowDown, ArrowUp, Ban, Bot, ChevronDown, ChevronUp, FileText, Inbox, Layers, ListOrdered, Loader2, Mic, Pause, Play, Plus, Save, Search, Sparkles, Trash2, Undo2, UserRound, UserSquare2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { CustomAudioPlayer } from '@/components/ui/custom-audio-player';
import { cn } from '@/lib/utils';
import type { AudioEstado, AudioFila, AudioResumen, HumanoDeAudios, NuncaTranscribir } from '../../server/audios';
import type { AudioBlock } from '../../server/audio-blocks';
import { GateBadge } from '../components/GateBadge';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher, fmtInt, tiempoRelativo } from '../components/format';
import type { Gate } from '../../shared/taxonomy';

type Miembro = HumanoDeAudios & { role: string };
type Respuesta = { rows: AudioFila[]; nunca: NuncaTranscribir[]; resumen: AudioResumen; bloques: AudioBlock[]; humano: HumanoDeAudios | null; miembros: Miembro[] };

const ESTADOS: Array<{ id: AudioEstado; label: string; conteo: (r: AudioResumen) => number | null; ayuda: string }> = [
  { id: 'en_cola', label: 'En cola de Gemini', conteo: (r) => r.enCola, ayuda: 'Lo que el worker de Gemini va a transcribir, en el orden en que lo va a tomar. Lo frenado por su bloque va al final, marcado.' },
  { id: 'sin_encolar', label: 'Sin encolar', conteo: (r) => r.sinEncolar, ayuda: 'Audios entrantes que nunca entraron a la cola. Encolá los que importen.' },
  { id: 'transcriptos', label: 'Transcriptos', conteo: (r) => r.transcriptos, ayuda: 'Ya tienen ficha: transcripción y, casi siempre, análisis.' },
  { id: 'fallidos', label: 'Fallidos', conteo: (r) => r.fallidos, ayuda: 'Agotaron sus intentos. Se pueden volver a encolar, pedirle contexto a un conector o a una persona.' },
  { id: 'quitados', label: 'Quitados', conteo: (r) => r.quitados, ayuda: 'Los sacó alguien a mano o se le pidieron a una persona. El cron no los vuelve a encolar; desde acá se reponen o se les escribe la ficha.' },
  { id: 'todos', label: 'Todos', conteo: () => null, ayuda: 'Todo lo entrante, esté como esté.' },
];

const INTENTS = ['consulta', 'pedido', 'reclamo', 'pago', 'coordinacion', 'seguimiento', 'saludo', 'otro'];
const URGENCIAS = ['baja', 'media', 'alta'];

const STATUS_LABEL: Record<string, string> = { pending: 'Sin encolar', queued: 'En cola', done: 'Transcripto', failed: 'Falló', skipped: 'Quitado' };
const STATUS_TONE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  queued: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-destructive/10 text-destructive',
  skipped: 'bg-muted text-muted-foreground line-through',
};

/** Las cuatro prioridades con nombre. El número es lo que guarda el servidor. */
const PRIORIDADES: Array<{ valor: number; label: string; ayuda: string }> = [
  { valor: 10, label: 'Primero', ayuda: 'Adelante de todo, incluso de los bloques' },
  { valor: 5, label: 'Adelante', ayuda: 'Antes que lo normal' },
  { valor: 0, label: 'Normal', ayuda: 'Lo decide el bloque y el frente comercial' },
  { valor: -1, label: 'Al final', ayuda: 'Después de todo lo demás' },
];
const prioridadLabel = (p: number) => (p >= 10 ? 'primero' : p > 0 ? 'adelante' : p < 0 ? 'al final' : null);

const MOTIVO_BLOQUE: Record<string, string> = { pausado: 'en pausa', programado: 'programado', tope: 'tope de hoy alcanzado' };

async function post(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(json?.error ?? `Error ${res.status}`));
  return json as Record<string, unknown>;
}

/**
 * Audios: la cola de Gemini, tal cual la va a drenar el worker, y las palancas
 * para repartirla en el tiempo.
 *
 * La pestaña principal es la cola en su orden real (prioridad → bloque →
 * frente comercial → antigüedad, el mismo ORDER BY del worker) con la posición
 * de cada audio. Arriba, cuánto hay, cuánta cuota queda hoy y cuánta se guarda
 * para lo que una persona pide a mano. Los **bloques** agrupan audios y deciden
 * si se transcriben ahora, desde un día, con tope diario o quedan en pausa. La
 * **prioridad** se cambia por contacto o por audio. Y cuando no vale gastar
 * cuota, el audio se le pide a una persona: sale de la cola, queda una tarea
 * asignada y un aviso, y la ficha se escribe a mano acá mismo.
 */
export function AudiosView({ onOpen }: { onOpen?: (chatId: number) => void }) {
  const [estado, setEstado] = useState<AudioEstado>('en_cola');
  const [enCola, setEnCola] = useState(false);
  const [q, setQ] = useState('');
  const [contacto, setContacto] = useState<number | 'todos'>('todos');
  const [verNunca, setVerNunca] = useState(false);
  const [verBloques, setVerBloques] = useState(false);
  const [marcando, setMarcando] = useState<number | null>(null);

  // Desde un aviso o una tarea se llega con el contacto y la pestaña en la URL.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const c = Number(sp.get('contacto'));
      if (Number.isInteger(c) && c > 0) setContacto(c);
      const e = sp.get('estado');
      if (e && ESTADOS.some((x) => x.id === e)) setEstado(e as AudioEstado);
    } catch {
      /* sin URL */
    }
  }, []);

  const url = `${SALES_OPS_API}/audios?estado=${estado}&enCola=${enCola ? 1 : 0}&q=${encodeURIComponent(q.trim())}&limit=${estado === 'en_cola' ? 300 : 80}${contacto !== 'todos' && estado !== 'en_cola' ? `&chatId=${contacto}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<Respuesta>(url, fetcher, { keepPreviousData: true });
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const bloques = data?.bloques ?? [];
  const humano = data?.humano ?? null;

  /**
   * Una tarjeta por contacto: los audios de la misma persona se leen juntos.
   * En la cola de Gemini el orden es el de la cola (el primer audio de cada
   * contacto marca su lugar); en el resto, por fecha.
   */
  const grupos = useMemo(() => {
    const map = new Map<number, { chatId: number; nombre: string; gate: string | null; enCola: boolean; primeraPos: number; audios: Array<AudioFila & { pos: number }> }>();
    let pos = 0;
    rows.forEach((r, idx) => {
      if (r.enColaGemini) pos += 1;
      const g = map.get(r.chatId) ?? { chatId: r.chatId, nombre: r.nombre, gate: r.gate, enCola: false, primeraPos: idx, audios: [] };
      g.audios.push({ ...r, pos: r.enColaGemini ? pos : 0 });
      g.enCola = g.enCola || r.enCola;
      map.set(r.chatId, g);
    });
    const lista = Array.from(map.values());
    if (estado === 'en_cola') return lista.sort((a, b) => a.primeraPos - b.primeraPos);
    return lista.sort((a, b) => Number(b.enCola) - Number(a.enCola) || b.audios[0].timestamp.localeCompare(a.audios[0].timestamp));
  }, [rows, estado]);
  const visibles = contacto === 'todos' ? grupos : grupos.filter((g) => g.chatId === contacto);

  const accionContacto = async (chatId: number, nombre: string, body: Record<string, unknown>, ok: (r: Record<string, unknown>) => string) => {
    setMarcando(chatId);
    try {
      const r = await post(`${SALES_OPS_API}/audios`, { chatId, ...body });
      toast.success(ok(r));
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setMarcando(null);
    }
  };

  if (error) return <ErrorState message={String((error as Error).message ?? error)} onRetry={() => void mutate()} />;
  const resumen = data?.resumen ?? null;
  const pestana = ESTADOS.find((e) => e.id === estado)!;
  const nombreHumano = humano?.name?.split(' ')[0] ?? 'una persona';

  return (
    <div className="space-y-3">
      {resumen && <Cabecera resumen={resumen} humano={humano} miembros={data?.miembros ?? []} onCambio={() => void mutate()} />}

      {/* Bloques: la palanca para repartir la cola en el tiempo. */}
      <PanelBloques bloques={bloques} abierto={verBloques} onToggle={() => setVerBloques((v) => !v)} resumen={resumen} onCambio={() => void mutate()} />

      <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ESTADOS.map((e) => {
          const n = resumen ? e.conteo(resumen) : null;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setEstado(e.id)}
              aria-pressed={estado === e.id}
              title={e.ayuda}
              className={cn('flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors', estado === e.id ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              {e.id === 'en_cola' && <ListOrdered className="size-3" aria-hidden />}
              {e.label}
              {n !== null && <span className="tabular-nums opacity-70">{fmtInt(n)}</span>}
              {e.id === 'en_cola' && resumen && resumen.frenados > 0 && <span className="rounded bg-background/20 px-1 text-[10px] tabular-nums" title="Encolados pero frenados por su bloque">+{fmtInt(resumen.frenados)} frenados</span>}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{pestana.ayuda}</p>

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
          title="Sólo contactos que tienen algo por salir en el Command Center (lote aprobado o pedido en cola)"
          className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs', enCola ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted')}
        >
          <Inbox className="size-3.5" aria-hidden />
          Sólo chats con algo por salir
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={contacto} onChange={(e) => setContacto(e.target.value === 'todos' ? 'todos' : Number(e.target.value))} className="h-8 max-w-full rounded-md border border-input bg-background px-2 text-xs" aria-label="Filtrar por contacto">
          <option value="todos">Todos los contactos ({grupos.length})</option>
          {grupos.map((g) => (
            <option key={g.chatId} value={g.chatId}>
              {g.nombre} ({g.audios.length})
            </option>
          ))}
          {contacto !== 'todos' && !grupos.some((g) => g.chatId === contacto) && <option value={contacto}>Contacto #{contacto}</option>}
        </select>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {fmtInt(rows.length)} audios · {fmtInt(grupos.length)} contactos{estado === 'en_cola' && resumen && resumen.enCola + resumen.frenados > rows.length ? ` · se muestran los primeros ${fmtInt(rows.length)}` : ''}
        </span>
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
            <p className="text-xs text-muted-foreground">Ninguno. Desde la tarjeta de un contacto, "Nunca".</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {data!.nunca.map((n) => (
                <li key={n.chatId} className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpen?.(n.chatId)}>{n.nombre}</button>
                  <button type="button" className="text-muted-foreground hover:text-foreground" title="Volver a transcribir" disabled={marcando === n.chatId} onClick={() => void accionContacto(n.chatId, n.nombre, { action: 'nunca', nunca: false }, () => `${n.nombre}: vuelve a transcribirse.`)}>
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

      {data && visibles.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Mic className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">{estado === 'en_cola' ? 'La cola de Gemini está vacía' : 'Sin audios acá'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{enCola ? 'Probá sacando "Sólo chats con algo por salir" o cambiando la pestaña.' : contacto !== 'todos' ? 'Este contacto no tiene audios en esta pestaña.' : estado === 'en_cola' ? 'Encolá desde "Sin encolar" los audios que valga la pena escuchar.' : 'Cambiá la pestaña o la búsqueda.'}</p>
        </div>
      )}

      <ul className="space-y-3">
        {visibles.map((g) => {
          const enColaGemini = g.audios.filter((a) => a.enColaGemini).length;
          const pendientes = g.audios.filter((a) => a.insight.status !== 'done').length;
          const encolables = g.audios.filter((a) => !a.enColaGemini && a.insight.status !== 'done' && !(a.insight.status === 'queued' && a.bloque && !a.bloque.activoHoy)).length;
          const prioridadActual = g.audios.find((a) => a.insight.status === 'queued')?.insight.priority ?? 0;
          const bloqueActual = g.audios.find((a) => a.bloque)?.bloque ?? null;
          return (
            <li key={g.chatId} className={cn('rounded-2xl border p-2.5', g.enCola ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20')} data-chat-id={g.chatId}>
              <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
                {estado === 'en_cola' && g.audios[0].pos > 0 && <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground/80" title="Posición del primer audio en la cola">#{g.audios[0].pos}</span>}
                <button type="button" className="truncate text-sm font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => onOpen?.(g.chatId)}>
                  {g.nombre}
                </button>
                {g.gate && <GateBadge gate={g.gate as Gate} />}
                {g.enCola && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary" title="Tiene algo por salir en el Command Center">por salir</span>}
                {prioridadLabel(prioridadActual) && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{prioridadLabel(prioridadActual)}</span>}
                {bloqueActual && (
                  <span className={cn('flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium', bloqueActual.activoHoy ? 'bg-muted text-muted-foreground' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')} title={bloqueActual.activoHoy ? 'Bloque activo' : 'El bloque está frenado'}>
                    <Layers className="size-2.5" aria-hidden />
                    {bloqueActual.name}
                  </span>
                )}
                <span className="text-[11px] tabular-nums text-muted-foreground">{g.audios.length} audio{g.audios.length === 1 ? '' : 's'}</span>
                <div className="ml-auto flex flex-wrap items-center gap-0.5">
                  {contacto === 'todos' && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setContacto(g.chatId)}>
                      Sólo este
                    </Button>
                  )}
                  {enColaGemini > 0 && (
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={marcando === g.chatId} title="Sacar de la cola de Gemini todos los audios pendientes de este contacto" onClick={() => void accionContacto(g.chatId, g.nombre, { action: 'dequeue_chat' }, (r) => `${g.nombre}: ${fmtInt(Number(r.cantidad ?? 0))} audio(s) fuera de la cola.`)}>
                      {marcando === g.chatId ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <XCircle className="size-3" aria-hidden />}
                      Sacar ({enColaGemini})
                    </Button>
                  )}
                  {encolables > 0 && (
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={marcando === g.chatId} title="Encolar adelante los audios de este contacto que no están en la cola" onClick={() => void accionContacto(g.chatId, g.nombre, { action: 'queue_chat' }, (r) => `${g.nombre}: ${fmtInt(Number(r.cantidad ?? 0))} audio(s) en la cola, adelante.`)}>
                      {marcando === g.chatId ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Inbox className="size-3" aria-hidden />}
                      Encolar ({encolables})
                    </Button>
                  )}
                  {pendientes > 0 && humano && (
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={marcando === g.chatId} title={`Sacarlos de la cola y pedirle a ${humano.name} que los escuche y deje el contexto (tarea asignada + aviso)`} onClick={() => {
                      const nota = window.prompt(`¿Qué necesitás saber de los audios de ${g.nombre}? (opcional)`, '');
                      if (nota === null) return;
                      void accionContacto(g.chatId, g.nombre, { action: 'ask_human_chat', nota: nota || undefined }, (r) => `Pedido a ${nombreHumano}: ${fmtInt(Number(r.quitados ?? 0))} audio(s) fuera de la cola${r.taskId ? ', tarea creada' : ''}.`);
                    }}>
                      {marcando === g.chatId ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <UserRound className="size-3" aria-hidden />}
                      Pedir a {nombreHumano}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive" disabled={marcando === g.chatId} title="No transcribir nunca los audios de este contacto" onClick={() => {
                    if (!window.confirm(`¿Nunca transcribir los audios de ${g.nombre}? Salen de la cola y de esta lista; lo ya transcripto se conserva.`)) return;
                    void accionContacto(g.chatId, g.nombre, { action: 'nunca', nunca: true }, (r) => `${g.nombre}: nunca transcribir${r.quitados ? ` (${r.quitados} fuera de la cola)` : ''}.`);
                  }}>
                    <Ban className="size-3" aria-hidden />
                    Nunca
                  </Button>
                </div>
              </div>

              {/* Prioridad y bloque de todo el contacto: es como se reordena la cola sin tocar audio por audio. */}
              {pendientes > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Orden</span>
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.valor}
                      type="button"
                      title={p.ayuda}
                      disabled={marcando === g.chatId}
                      aria-pressed={prioridadActual === p.valor}
                      onClick={() => void accionContacto(g.chatId, g.nombre, { action: 'priority_chat', priority: p.valor }, (r) => `${g.nombre}: ${fmtInt(Number(r.cantidad ?? 0))} audio(s) ${p.label.toLowerCase()}.`)}
                      className={cn('rounded-full border px-2 py-0.5 text-[10px]', prioridadActual === p.valor ? 'border-transparent bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted')}
                    >
                      {p.label}
                    </button>
                  ))}
                  {bloques.length > 0 && (
                    <select
                      value={bloqueActual?.id ?? ''}
                      disabled={marcando === g.chatId}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        void accionContacto(g.chatId, g.nombre, { action: 'block_chat', blockId: v }, (r) => `${g.nombre}: ${fmtInt(Number(r.cantidad ?? 0))} audio(s) ${v ? 'en el bloque' : 'sin bloque'}.`);
                      }}
                      className="ml-auto h-6 max-w-[220px] rounded-md border border-input bg-background px-1.5 text-[10px]"
                      aria-label="Bloque del contacto"
                      title="Mover todos los pendientes del contacto a un bloque"
                    >
                      <option value="">Sin bloque (orden normal)</option>
                      {bloques.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}{b.activoHoy ? '' : ` · ${MOTIVO_BLOQUE[b.motivo ?? ''] ?? 'frenado'}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <ul className="space-y-2">
                {g.audios.map((row) => (
                  <li key={row.messageId}>
                    <AudioCard row={row} pos={estado === 'en_cola' && row.pos > 0 ? row.pos : null} bloques={bloques} humano={humano} onOpen={onOpen} onChanged={() => void mutate()} />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cola, cuota, reserva y ritmo de los últimos días. */
function Cabecera({ resumen, humano, miembros, onCambio }: { resumen: AudioResumen; humano: HumanoDeAudios | null; miembros: Miembro[]; onCambio: () => void }) {
  const [editReserva, setEditReserva] = useState(false);
  const [pct, setPct] = useState(String(resumen.banco.reservaPct));
  const [guardando, setGuardando] = useState<'reserva' | 'humano' | 'transcripcion' | null>(null);
  useEffect(() => setPct(String(resumen.banco.reservaPct)), [resumen.banco.reservaPct]);
  const total = resumen.banco.totalDiario;
  const pctRestante = total ? Math.round((resumen.banco.restanteHoy / total) * 100) : 0;
  const pctReserva = total ? Math.round((resumen.banco.reserva / total) * 100) : 0;
  const ritmo = resumen.porDia.length ? Math.round(resumen.porDia.reduce((s, d) => s + d.n, 0) / resumen.porDia.length) : 0;
  const dias = resumen.enCola > 0 && ritmo > 0 ? Math.ceil(resumen.enCola / ritmo) : null;

  const guardarReserva = async () => {
    setGuardando('reserva');
    try {
      const r = await post(`${SALES_OPS_API}/audios`, { action: 'reserva', pct: Number(pct) });
      toast.success(`Reserva: ${r.reservaPct}% de la cuota diaria queda para lo manual.`);
      setEditReserva(false);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setGuardando(null);
    }
  };
  const cambiarTranscripcion = async (activa: boolean) => {
    setGuardando('transcripcion');
    try {
      const r = await post(`${SALES_OPS_API}/audios`, { action: 'transcripcion', activa });
      toast.success(r.transcripcionActiva ? 'El worker vuelve a transcribir por cron.' : 'Transcripción automática apagada: el banco queda para el Command Center y lo manual.');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setGuardando(null);
    }
  };
  const cambiarHumano = async (userId: number) => {
    setGuardando('humano');
    try {
      await post(`${SALES_OPS_API}/audios`, { action: 'humano', userId });
      toast.success('Listo: a esa persona se le piden las transcripciones a mano.');
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-3 sm:grid-cols-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cola de Gemini</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums">
          {fmtInt(resumen.enCola)} <span className="text-xs font-normal text-muted-foreground">audios · {resumen.minutosEnCola} min</span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {!resumen.transcripcionActiva ? <span className="font-medium text-amber-600 dark:text-amber-400">Transcripción automática apagada. </span> : null}
          {resumen.frenados > 0 ? `${fmtInt(resumen.frenados)} más frenados por su bloque. ` : ''}
          {ritmo > 0 ? `Ritmo real: ~${ritmo} por día (últimas dos semanas)${dias ? ` → ${dias} día${dias === 1 ? '' : 's'} para vaciarla` : ''}.` : ''}
        </p>
        {/* Check del plugin Gemini: apagado, el worker por cron no toma nada; "Transcribir ahora" sigue. */}
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px]" title="Apagado, el banco de keys queda para el Command Center (clasificar, Ejecutar ahora, skills) y para lo que pidas a mano">
          <input
            type="checkbox"
            className="size-3.5 accent-emerald-600"
            checked={resumen.transcripcionActiva}
            disabled={guardando === 'transcripcion'}
            onChange={(e) => void cambiarTranscripcion(e.target.checked)}
          />
          Usar Gemini para transcribir audios
          {guardando === 'transcripcion' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
        </label>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cuota de hoy</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums">
          {fmtInt(resumen.banco.restanteHoy)} <span className="text-xs font-normal text-muted-foreground">de {fmtInt(total)} pedidos · {resumen.banco.activas} keys</span>
        </p>
        {/* Dos franjas: lo que queda, y adentro lo reservado para lo manual. */}
        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pctRestante} aria-valuemin={0} aria-valuemax={100} aria-label="Cuota restante del banco de keys">
          <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${Math.max(0, pctRestante - pctReserva)}%` }} title="Para procesos automáticos" />
          <div className="h-full bg-amber-500 transition-[width]" style={{ width: `${Math.min(pctRestante, pctReserva)}%` }} title="Reservado para pedidos a mano" />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
          <span>Automático: {fmtInt(resumen.banco.disponibleAutomatico)} (~{fmtInt(Math.floor(resumen.banco.disponibleAutomatico / 2))} audios)</span>
          <span>·</span>
          {editReserva ? (
            <span className="inline-flex items-center gap-1">
              reserva
              <Input value={pct} onChange={(e) => setPct(e.target.value)} type="number" min={0} max={90} className="h-6 w-14 px-1 text-[11px]" aria-label="Porcentaje reservado" />
              %
              <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" disabled={guardando === 'reserva'} onClick={() => void guardarReserva()}>
                {guardando === 'reserva' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : 'OK'}
              </Button>
              <button type="button" className="text-muted-foreground" onClick={() => setEditReserva(false)} aria-label="Cancelar">
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ) : (
            <button type="button" className="underline-offset-2 hover:underline" title="El worker y el clasificador por cron paran acá; lo que queda es para Transcribir ahora, Ejecutar ahora y pedidos puntuales" onClick={() => setEditReserva(true)}>
              reserva para lo manual: {resumen.banco.reservaPct}% ({fmtInt(resumen.banco.reserva)})
            </button>
          )}
        </p>
      </div>
      <div className="text-[11px] leading-snug text-muted-foreground sm:self-center">
        <p>Cada audio son dos pedidos (transcribir y analizar). Cuando lo automático llega a la reserva, la cola espera a mañana en este mismo orden; lo que pidas a mano sigue saliendo.</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1">
          <UserRound className="size-3" aria-hidden />
          Transcripción a mano:
          <select
            value={humano?.userId ?? ''}
            disabled={guardando === 'humano'}
            onChange={(e) => e.target.value && void cambiarHumano(Number(e.target.value))}
            className="h-6 rounded-md border border-input bg-background px-1 text-[11px]"
            aria-label="A quién se le piden las transcripciones a mano"
          >
            {!humano && <option value="">Elegir…</option>}
            {miembros.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name}</option>
            ))}
          </select>
        </p>
      </div>
    </div>
  );
}

/** Los bloques de trabajo: qué se drena hoy, qué está en pausa, con qué tope. */
function PanelBloques({ bloques, abierto, onToggle, resumen, onCambio }: { bloques: AudioBlock[]; abierto: boolean; onToggle: () => void; resumen: AudioResumen | null; onCambio: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState('');
  const activos = bloques.filter((b) => b.activoHoy).length;

  const correr = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setBusy(null);
    }
  };
  const editar = (b: AudioBlock, patch: Record<string, unknown>, ok: string) => correr(`b-${b.id}`, () => post(`${SALES_OPS_API}/audios/blocks/${b.id}`, patch, 'PATCH'), ok);
  const mover = (b: AudioBlock, dir: -1 | 1) => {
    const ids = bloques.map((x) => x.id);
    const i = ids.indexOf(b.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return correr(`b-${b.id}`, () => post(`${SALES_OPS_API}/audios/blocks`, { action: 'reorder', ids }), 'Orden de bloques guardado.');
  };

  return (
    <section className="rounded-2xl border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={abierto} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <Layers className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Bloques de trabajo</span>
        <span className="text-[11px] text-muted-foreground">
          {bloques.length === 0 ? 'sin bloques: la cola se drena de corrido' : `${bloques.length} bloque${bloques.length === 1 ? '' : 's'} · ${activos} activo${activos === 1 ? '' : 's'} hoy`}
        </span>
        {abierto ? <ChevronUp className="ml-auto size-4 text-muted-foreground" aria-hidden /> : <ChevronDown className="ml-auto size-4 text-muted-foreground" aria-hidden />}
      </button>
      {abierto && (
        <div className="space-y-2 border-t border-border/60 px-3 pb-3 pt-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Un bloque agrupa audios y decide si se transcriben ahora, desde un día, con un tope por día, o quedan en pausa. Se drenan en este orden; lo que no tiene bloque (lo recién encolado por el cron) va antes que todos. La prioridad "Primero" le gana a los bloques.
          </p>
          {bloques.length === 0 && (
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={busy !== null} onClick={() => void correr('suggest', () => post(`${SALES_OPS_API}/audios/blocks`, { action: 'suggest' }), 'Bloques armados por frente comercial.')}>
              {busy === 'suggest' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
              Armar bloques sugeridos (por frente comercial)
            </Button>
          )}
          <ul className="space-y-1.5">
            {bloques.map((b, idx) => (
              <li key={b.id} className={cn('rounded-xl border p-2.5', b.activoHoy ? 'border-border bg-background' : 'border-amber-500/30 bg-amber-500/5')} data-block-id={b.id}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}.</span>
                  <span className="text-sm font-medium">{b.name}</span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', b.activoHoy ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
                    {b.activoHoy ? 'se drena hoy' : MOTIVO_BLOQUE[b.motivo ?? ''] ?? 'frenado'}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {fmtInt(b.enCola)} en cola · {b.contactos} contactos · {b.minutosEnCola} min · hechos {fmtInt(b.hechos)}{b.dailyCap ? ` (hoy ${b.hechosHoy}/${b.dailyCap})` : b.hechosHoy ? ` (hoy ${b.hechosHoy})` : ''}
                  </span>
                  <div className="ml-auto flex items-center gap-0.5">
                    <Button type="button" variant="ghost" size="icon" className="size-7" title="Subir" disabled={busy !== null || idx === 0} onClick={() => void mover(b, -1)}>
                      <ArrowUp className="size-3.5" aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="size-7" title="Bajar" disabled={busy !== null || idx === bloques.length - 1} onClick={() => void mover(b, 1)}>
                      <ArrowDown className="size-3.5" aria-hidden />
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={busy !== null} onClick={() => void editar(b, { status: b.status === 'active' ? 'paused' : 'active' }, b.status === 'active' ? `${b.name}: en pausa.` : `${b.name}: activo.`)}>
                      {busy === `b-${b.id}` ? <Loader2 className="size-3 animate-spin" aria-hidden /> : b.status === 'active' ? <Pause className="size-3" aria-hidden /> : <Play className="size-3" aria-hidden />}
                      {b.status === 'active' ? 'Pausar' : 'Activar'}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" title="Borrar el bloque (sus audios vuelven a la cola sin bloque)" disabled={busy !== null} onClick={() => {
                      if (!window.confirm(`¿Borrar el bloque "${b.name}"? Sus ${fmtInt(b.enCola)} audios vuelven a la cola sin bloque.`)) return;
                      void correr(`b-${b.id}`, () => post(`${SALES_OPS_API}/audios/blocks/${b.id}`, {}, 'DELETE'), 'Bloque borrado.');
                    }}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
                {b.description && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{b.description}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <label className="flex items-center gap-1">
                    Desde el
                    <input type="date" defaultValue={b.notBefore ?? ''} key={`nb-${b.id}-${b.notBefore ?? ''}`} onBlur={(e) => { const v = e.target.value || null; if (v !== (b.notBefore ?? null)) void editar(b, { notBefore: v }, v ? `${b.name}: arranca el ${v}.` : `${b.name}: sin fecha de arranque.`); }} className="h-6 rounded-md border border-input bg-background px-1 text-[11px]" aria-label="No drenar antes de" />
                  </label>
                  <label className="flex items-center gap-1">
                    Tope por día
                    <input type="number" min={1} max={5000} defaultValue={b.dailyCap ?? ''} key={`cap-${b.id}-${b.dailyCap ?? ''}`} placeholder="sin tope" onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (b.dailyCap ?? null)) void editar(b, { dailyCap: v }, v ? `${b.name}: hasta ${v} por día.` : `${b.name}: sin tope diario.`); }} className="h-6 w-20 rounded-md border border-input bg-background px-1 text-[11px]" aria-label="Tope diario" />
                  </label>
                  {resumen && b.dailyCap && resumen.banco.disponibleAutomatico > 0 && b.dailyCap * 2 > resumen.banco.disponibleAutomatico && (
                    <span className="text-amber-700 dark:text-amber-300">el tope supera lo que queda hoy para automático</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre del bloque nuevo" className="h-8 max-w-xs text-xs" aria-label="Nombre del bloque nuevo" />
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={busy !== null || nuevo.trim().length < 2} onClick={() => void correr('create', () => post(`${SALES_OPS_API}/audios/blocks`, { action: 'create', name: nuevo.trim() }).then(() => setNuevo('')), 'Bloque creado. Asigná contactos desde su tarjeta.')}>
              {busy === 'create' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
              Nuevo bloque
            </Button>
            {bloques.length > 0 && (
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" disabled={busy !== null} title="Reparte por frente comercial lo que está en cola sin bloque (no toca lo ya asignado)" onClick={() => void correr('suggest', () => post(`${SALES_OPS_API}/audios/blocks`, { action: 'suggest' }), 'Lo que no tenía bloque quedó repartido por frente comercial.')}>
                {busy === 'suggest' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
                Repartir lo sin bloque
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function AudioCard({ row, pos, bloques, humano, onOpen, onChanged }: { row: AudioFila; pos: number | null; bloques: AudioBlock[]; humano: HumanoDeAudios | null; onOpen?: (chatId: number) => void; onChanged: () => void }) {
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
  const maxIntentos = 3;
  const pendiente = status !== 'done';
  const nombreHumano = humano?.name?.split(' ')[0] ?? 'una persona';

  const accion = async (action: string, body: Record<string, unknown> = {}, ok = 'Listo.') => {
    setBusy(action);
    try {
      const cuerpo = await post(`${SALES_OPS_API}/audios/${encodeURIComponent(row.messageId)}`, { action, ...body });
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
    <div className={cn('rounded-xl border bg-card px-3 py-2.5', row.enCola ? 'border-primary/40' : 'border-border')} data-message-id={row.messageId} data-audio-status={status ?? 'none'}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {pos !== null && <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums" title="Posición en la cola de Gemini">#{pos}</span>}
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', STATUS_TONE[status ?? 'pending'])}>{STATUS_LABEL[status ?? 'pending'] ?? 'Sin encolar'}</span>
            {status === 'queued' && row.bloque && !row.bloque.activoHoy && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300" title="Su bloque está frenado: el worker no lo toma hoy">frenado · {row.bloque.name}</span>}
            {prioridadLabel(row.insight.priority) && pendiente && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{prioridadLabel(row.insight.priority)}</span>}
            {row.insight.attempts > 0 && status !== 'done' && (
              <span className="text-[10px] text-muted-foreground" title="Intentos de transcripción consumidos">
                {row.insight.attempts}/{maxIntentos} intentos
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {tiempoRelativo(row.timestamp)}
            {row.seconds ? ` · ${row.seconds} s` : ''}
            {row.fromMe ? ' · enviado por nosotros' : ''}
            {row.insight.provider ? ` · ${row.insight.provider}` : ''}
            {row.insight.queuedAt && status === 'queued' ? ` · en cola ${tiempoRelativo(row.insight.queuedAt)}` : ''}
            {status === 'skipped' && row.insight.error ? ` · ${row.insight.error}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {row.enColaGemini ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive" title="Sacar de la cola de Gemini (queda como quitado; el cron no lo vuelve a encolar)" disabled={busy !== null} onClick={() => void accion('dequeue', {}, 'Fuera de la cola de Gemini.')}>
              {busy === 'dequeue' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
              Sacar
            </Button>
          ) : pendiente && !(status === 'queued' && row.bloque && !row.bloque.activoHoy) ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" title="Encolar adelante en la cola de Gemini" disabled={busy !== null} onClick={() => void accion('queue', {}, 'En la cola de Gemini, adelante.')}>
              {busy === 'queue' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Inbox className="size-3.5" aria-hidden />}
              Encolar
            </Button>
          ) : null}
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
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" disabled={busy !== null || !row.src} title="Gasta un pedido de la cuota de hoy (puede usar la reserva)" onClick={() => void accion('transcribe', {}, 'Transcripto.')}>
              {busy === 'transcribe' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <FileText className="size-3" aria-hidden />}
              Transcribir ahora
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" disabled={busy !== null || !row.insight.transcript} title={row.insight.transcript ? 'Gasta un pedido de la cuota de hoy' : 'Primero hace falta la transcripción'} onClick={() => void accion('analyze', {}, 'Analizado.')}>
              {busy === 'analyze' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
              Analizar
            </Button>
          </div>

          {pendiente && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Orden</span>
              {PRIORIDADES.map((p) => (
                <button key={p.valor} type="button" title={p.ayuda} disabled={busy !== null} aria-pressed={row.insight.priority === p.valor} onClick={() => void accion('priority', { priority: p.valor }, `${p.label}.`)} className={cn('rounded-full border px-2 py-0.5 text-[10px]', row.insight.priority === p.valor ? 'border-transparent bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {p.label}
                </button>
              ))}
              {bloques.length > 0 && (
                <select value={row.bloque?.id ?? ''} disabled={busy !== null} onChange={(e) => void accion('block', { blockId: e.target.value ? Number(e.target.value) : null }, 'Bloque cambiado.')} className="ml-auto h-6 max-w-[200px] rounded-md border border-input bg-background px-1.5 text-[10px]" aria-label="Bloque del audio">
                  <option value="">Sin bloque</option>
                  {bloques.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Pedido a una persona o a un conector: lo escuchan, leen el chat y devuelven contexto. */}
          <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/40 p-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Bot className="size-3" aria-hidden />
              Pedir contexto sin gastar cuota
            </p>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="resize-none text-xs" placeholder="Opcional: qué necesitás saber del audio (ej.: si confirmó el pago, qué fecha dijo…)" />
            <div className="flex flex-wrap gap-1.5">
              {pendiente && humano && (
                <Button type="button" size="sm" className="h-7 gap-1.5 text-[11px]" disabled={busy !== null} title={`Sale de la cola; ${humano.name} recibe una tarea y un aviso, y escribe la ficha acá`} onClick={() => void accion('ask_human', { nota }, `Pedido a ${nombreHumano}: tarea y aviso enviados. El audio salió de la cola.`)}>
                  {busy === 'ask_human' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <UserRound className="size-3" aria-hidden />}
                  Pedir a {nombreHumano}
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" disabled={busy !== null} onClick={() => void accion('ask_connector', { nota }, 'Pedido en la cola: lo toma el próximo conector.')}>
                {busy === 'ask_connector' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Bot className="size-3" aria-hidden />}
                Dejar a un conector
              </Button>
            </div>
          </div>

          {/* Ficha editable: lo que quede acá es lo que ven el radar y el dossier. */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ficha (escribila o corregila y guardá)</p>
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
