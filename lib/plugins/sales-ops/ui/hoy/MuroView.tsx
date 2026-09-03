'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Cpu, Loader2, RefreshCw, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { WallEntry, WallPayload } from '../../shared/api-types';
import { HISTORIAL_ICONOS, HISTORIAL_KIND_LABELS, HISTORIAL_TONOS, type HistorialKind } from '../components/historial-meta';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher, fmtHora, iniciales, tiempoRelativo } from '../components/format';
import { CH } from './estilo';

const KINDS = Object.keys(HISTORIAL_KIND_LABELS) as HistorialKind[];

/**
 * Nombre de pila de cada conector.
 *
 * En la auditoría se guarda la clave (`claude-code`), que en un feed se lee
 * como un id de sistema y no como "quién lo hizo".
 */
const CONECTOR_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  grok: 'Grok',
  gemini: 'Gemini',
  server: 'IA del equipo',
};

/**
 * Quién figura como autor de la publicación.
 *
 * Lo que hizo el trabajo casi siempre es una IA —el conector de madrugada, el
 * motor del servidor— y la persona sólo lo pidió. Poniendo a la persona de
 * titular, el muro contaba una historia falsa: parecía que Noelia había
 * clasificado doscientos chats a las tres de la mañana. El titular es la IA con
 * su modelo si se auditó; la persona queda abajo, en chico, como quien lo pidió.
 */
function titular(entry: WallEntry): { nombre: string; detalle: string | null } {
  if (entry.actor.kind === 'persona') return { nombre: entry.actor.name, detalle: null };
  const base = CONECTOR_LABELS[entry.actor.name] ?? entry.actor.name;
  const modelo = entry.ai?.model ?? entry.ai?.provider ?? null;
  return { nombre: modelo ? `${base} · ${modelo}` : base, detalle: entry.actor.kind === 'conector' ? 'conector' : 'automático' };
}

/** "hoy" / "ayer" / la fecha, para el separador de cada día del muro. */
function tituloDia(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const hoy = new Date();
  const dia = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const ayer = new Date(hoy.getTime() - 86_400_000);
  if (dia(d) === dia(hoy)) return 'Hoy';
  if (dia(d) === dia(ayer)) return 'Ayer';
  try {
    return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Muro del equipo: todo lo que se procesó, como un feed.
 *
 * El historial por contacto ya existía, pero para saber "qué se hizo hoy" había
 * que abrir las fichas de a una — y lo que corre un conector de madrugada no lo
 * veía nadie. Acá está la misma auditoría leída por momento: qué se hizo, sobre
 * qué contacto, quién lo ejecutó (persona, servidor o conector), cuándo y con
 * qué IA.
 *
 * Cada publicación es un hecho ya registrado, no un resumen generado: si algo
 * no quedó auditado, acá no aparece.
 */
export function MuroView({ onOpen }: { onOpen: (chatId: number) => void }) {
  const [kinds, setKinds] = useState<Set<HistorialKind>>(new Set());
  const [entries, setEntries] = useState<WallEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const filtro = useMemo(() => [...kinds].sort().join(','), [kinds]);

  const cargar = useCallback(
    async (desde: string | null) => {
      const id = ++reqRef.current;
      if (desde) setCargandoMas(true);
      else {
        setCargando(true);
        setError(null);
      }
      try {
        const p = new URLSearchParams({ limit: '40' });
        if (filtro) p.set('kinds', filtro);
        if (desde) p.set('cursor', desde);
        const payload = await fetcher<WallPayload>(`${SALES_OPS_API}/wall?${p.toString()}`);
        // Una respuesta vieja que llega tarde no puede pisar a la nueva.
        if (id !== reqRef.current) return;
        setEntries((prev) => (desde ? [...prev, ...payload.entries] : payload.entries));
        setCursor(payload.nextCursor);
      } catch (e) {
        if (id !== reqRef.current) return;
        setError(e instanceof Error ? e.message : 'Error');
      } finally {
        if (id === reqRef.current) {
          setCargando(false);
          setCargandoMas(false);
        }
      }
    },
    [filtro],
  );

  useEffect(() => {
    void cargar(null);
  }, [cargar]);

  const porDia = useMemo(() => {
    const grupos = new Map<string, WallEntry[]>();
    for (const entry of entries) {
      const dia = entry.at.slice(0, 10);
      const lista = grupos.get(dia);
      if (lista) lista.push(entry);
      else grupos.set(dia, [entry]);
    }
    return [...grupos.entries()];
  }, [entries]);

  const alternar = (kind: HistorialKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setKinds(new Set())}
          aria-pressed={kinds.size === 0}
          className={cn(
            'rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-colors',
            kinds.size === 0 ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          Todo
        </button>
        {KINDS.map((kind) => {
          const Icon = HISTORIAL_ICONOS[kind];
          const activo = kinds.has(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => alternar(kind)}
              aria-pressed={activo}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                activo ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {HISTORIAL_KIND_LABELS[kind]}
            </button>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-8 gap-1.5 px-2 text-[11px] font-bold"
          onClick={() => void cargar(null)}
          disabled={cargando}
        >
          <RefreshCw className={cn('size-3.5', cargando && 'animate-spin')} aria-hidden />
          Actualizar
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void cargar(null)} />
      ) : cargando ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-3xl" />
          ))}
        </div>
      ) : porDia.length === 0 ? (
        <div className={cn('px-6 py-12 text-center', CH.card)}>
          <p className={CH.titulo}>Todavía no hay nada en el muro</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {kinds.size > 0 ? 'Con estos filtros no hay movimientos. Probá con "Todo".' : 'Cuando se clasifique, se lance un prompt o salga un envío, va a aparecer acá.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {porDia.map(([dia, delDia]) => (
            <section key={dia} className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className={CH.rotulo}>{tituloDia(delDia[0].at)}</h3>
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{delDia.length}</span>
              </div>
              <ul className="space-y-2">
                {delDia.map((entry) => (
                  <Publicacion key={entry.id} entry={entry} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          ))}

          {cursor && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-2xl font-bold"
              disabled={cargandoMas}
              onClick={() => void cargar(cursor)}
            >
              {cargandoMas ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Ver más
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Ícono de quién ejecutó: persona con iniciales, conector o servidor. */
function ActorAvatar({ actor }: { actor: WallEntry['actor'] }) {
  if (actor.kind === 'persona') {
    return (
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[11px] font-black text-primary"
        title={`${actor.name} (persona)`}
      >
        {iniciales(actor.name)}
      </span>
    );
  }
  const esConector = actor.kind === 'conector';
  const Icon = esConector ? Bot : Cpu;
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-2xl',
        esConector ? 'bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300' : 'bg-muted text-muted-foreground',
      )}
      title={esConector ? `${actor.name} (conector)` : 'Servidor'}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

/**
 * Una publicación del muro.
 *
 * El orden de lectura es el de una publicación: quién, cuándo, qué hizo, sobre
 * quién. La familia del evento se dice con el mismo ícono y el mismo color que
 * en la ficha, para que un envío se reconozca igual en los dos lados.
 */
function Publicacion({ entry, onOpen }: { entry: WallEntry; onOpen: (chatId: number) => void }) {
  const Icon = HISTORIAL_ICONOS[entry.kind] ?? HISTORIAL_ICONOS.otro;
  const autor = titular(entry);
  const ia = entry.ai?.model ?? entry.ai?.provider ?? null;

  return (
    <li className={cn('p-3.5', CH.card)}>
      <div className="flex items-start gap-3">
        <ActorAvatar actor={entry.actor} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-sm font-bold text-foreground">{autor.nombre}</span>
            {autor.detalle && <span className="text-[10px] text-muted-foreground">{autor.detalle}</span>}
            <span className="text-[11px] text-muted-foreground" title={entry.at}>
              · {tiempoRelativo(entry.at)} · {fmtHora(entry.at)}
            </span>
          </div>
          {/* La persona que lo pidió, en chico: importa saber quién fue, pero no
              es quien hizo el trabajo. */}
          {entry.by && entry.actor.kind !== 'persona' && (
            <p className="text-[10px] text-muted-foreground/80">pedido por {entry.by}</p>
          )}

          <div className="mt-2 flex items-start gap-2">
            <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg', HISTORIAL_TONOS[entry.kind] ?? HISTORIAL_TONOS.otro)}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-foreground">{entry.label}</p>
              {entry.detail && <p className="text-xs leading-snug text-muted-foreground">{entry.detail}</p>}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {entry.chatId != null && (
              <button type="button" onClick={() => onOpen(entry.chatId as number)} className={cn(CH.chip, 'hover:bg-muted hover:text-foreground')}>
                <User className="size-3" aria-hidden />
                {entry.contactName ?? `chat ${entry.chatId}`}
              </button>
            )}
            {ia && (
              <span className={CH.chip} title={[entry.ai?.provider, entry.ai?.model].filter(Boolean).join(' · ')}>
                <Sparkles className="size-3" aria-hidden />
                {ia}
              </span>
            )}
            <span className={CH.chip}>{HISTORIAL_KIND_LABELS[entry.kind]}</span>
          </div>
        </div>
      </div>
    </li>
  );
}
