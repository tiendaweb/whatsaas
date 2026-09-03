'use client';

import { useState } from 'react';
import { Ban, Check, ChevronDown, ChevronRight, ExternalLink, Inbox, Loader2, MessageSquare, Send, Wand2, Zap } from 'lucide-react';
import type { SignalRow } from '../../shared/api-types';
import { KIND_META, timeAgo } from './kind-meta';
import { SignalItem } from './SignalItem';

/**
 * Una tarjeta por contacto, no por mensaje.
 *
 * El radar crea una señal por mensaje entrante, así que quien escribe cinco
 * veces seguidas ocupa cinco filas idénticas de la bandeja y hay que marcarlas
 * una por una aunque el trabajo real —contestarle— sea uno solo. Acá el
 * contacto es la unidad: se ve lo último que dijo, se despliega el resto si
 * hace falta, y "Atendido" cierra todo lo suyo de un saque.
 */

export type SignalGroup = {
  chatId: number;
  name: string;
  /** Ordenadas de la más nueva a la más vieja. */
  signals: SignalRow[];
  urgent: boolean;
  /** Todo lo del contacto es automático o irrelevante: se pliega. */
  folded: boolean;
  lastAt: string;
};

/** Agrupa por chat conservando el orden en que vinieron (ya ordenadas por fecha desc). */
export function agruparSenales(rows: SignalRow[]): SignalGroup[] {
  const porChat = new Map<number, SignalGroup>();
  for (const signal of rows) {
    const meta = KIND_META[signal.kind];
    const actual = porChat.get(signal.chatId);
    if (actual) {
      actual.signals.push(signal);
      actual.urgent = actual.urgent || !!meta?.urgent;
      actual.folded = actual.folded && !!meta?.folded;
      continue;
    }
    porChat.set(signal.chatId, {
      chatId: signal.chatId,
      name: signal.name,
      signals: [signal],
      urgent: !!meta?.urgent,
      folded: !!meta?.folded,
      lastAt: signal.createdAt,
    });
  }

  // Urgentes primero; dentro de cada bloque, el contacto que habló más recién.
  return [...porChat.values()].sort(
    (a, b) => Number(b.urgent) - Number(a.urgent) || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0),
  );
}

/** 💰 ×2 🔥 — los tipos que trae el contacto, sin repetir el emoji por mensaje. */
function ResumenDeTipos({ signals }: { signals: SignalRow[] }) {
  const conteo = new Map<string, { emoji: string; label: string; n: number }>();
  for (const signal of signals) {
    const meta = KIND_META[signal.kind] ?? { emoji: '•', label: signal.kind, urgent: false, folded: false };
    const actual = conteo.get(signal.kind);
    if (actual) actual.n += 1;
    else conteo.set(signal.kind, { emoji: meta.emoji, label: meta.label, n: 1 });
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {[...conteo.values()].map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
          title={item.label}
        >
          <span aria-hidden>{item.emoji}</span>
          <span className="sr-only">{item.label}</span>
          {item.n > 1 ? <span className="font-semibold">×{item.n}</span> : null}
        </span>
      ))}
    </span>
  );
}

export type AutomationOption = { id: number; name: string; isActive: boolean };

export function ContactSignalCard({
  group,
  busy,
  onOpen,
  onHandleAll,
  onHandleOne,
  onAbrirChat,
  onPrompt,
  onFlujo,
  onExcluir,
  pendientes = 0,
  automations = [],
}: {
  group: SignalGroup;
  /** Hay una operación en curso sobre este contacto. */
  busy: boolean;
  onOpen: (chatId: number) => void;
  onHandleAll: (group: SignalGroup) => void;
  onHandleOne: (signal: SignalRow) => void;
  /** Chat flotante, sin salir de la bandeja. */
  onAbrirChat?: (chatId: number) => void;
  /** Deja un pedido en la cola de conectores para este chat. Devuelve cuando quedó encolado. */
  onPrompt?: (chatId: number, text: string) => Promise<void>;
  /** Dispara un flujo de automatización sobre el chat. */
  onFlujo?: (chatId: number, automationId: number) => Promise<void>;
  /** Excluye el contacto de Respuestas: el radar deja de crearle señales. */
  onExcluir?: (chatId: number, name: string) => void;
  /** Pedidos ya encolados para este chat (para que se vea que hay algo en marcha). */
  pendientes?: number;
  automations?: AutomationOption[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [panel, setPanel] = useState<'prompt' | 'flujo' | null>(null);
  const [texto, setTexto] = useState('');
  const [flujo, setFlujo] = useState<number | ''>('');
  const [enviando, setEnviando] = useState(false);

  const encolar = async () => {
    if (!onPrompt || texto.trim().length < 5) return;
    setEnviando(true);
    try {
      await onPrompt(group.chatId, texto.trim());
      setTexto('');
      setPanel(null);
    } finally {
      setEnviando(false);
    }
  };
  const disparar = async () => {
    if (!onFlujo || !flujo) return;
    setEnviando(true);
    try {
      await onFlujo(group.chatId, Number(flujo));
      setPanel(null);
    } finally {
      setEnviando(false);
    }
  };
  const total = group.signals.length;
  const ultima = group.signals[0];
  const resto = group.signals.slice(1);

  return (
    <li
      className={
        'rounded-xl border p-3 transition-colors ' +
        (group.urgent ? 'border-primary/50 bg-primary/5' : 'border-border bg-card')
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="truncate font-medium text-foreground">{group.name}</span>
        <span className="text-xs text-muted-foreground">{timeAgo(group.lastAt)}</span>
        {total > 1 ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {total} mensajes
          </span>
        ) : null}
        <ResumenDeTipos signals={group.signals} />
      </div>

      <p className="mt-1 line-clamp-3 text-sm text-foreground/90">“{ultima.excerpt || '(sin texto)'}”</p>

      {resto.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {abierto ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
            {abierto ? 'Ocultar los anteriores' : `Ver los ${resto.length} anteriores`}
          </button>
          {abierto ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {resto.map((signal) => (
                <SignalItem key={signal.id} signal={signal} busy={busy} compact onOpen={() => onOpen(group.chatId)} onHandle={onHandleOne} />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {/* Panel de acción: dejar un prompt en cola o disparar un flujo, sin abrir la ficha. */}
      {panel === 'prompt' && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 p-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Qué tiene que hacer el conector con este chat. Ej.: redactá la respuesta a lo último que dijo, sin enviar."
            className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={() => setPanel(null)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="button" disabled={enviando || texto.trim().length < 5} onClick={() => void encolar()} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-60">
              {enviando ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Send className="h-3 w-3" aria-hidden />}
              Encolar prompt
            </button>
          </div>
        </div>
      )}
      {panel === 'flujo' && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 p-2">
          <select value={flujo} onChange={(e) => setFlujo(e.target.value ? Number(e.target.value) : '')} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
            <option value="">Elegí un flujo…</option>
            {automations.map((a) => (
              <option key={a.id} value={a.id}>{a.name}{a.isActive ? '' : ' (inactivo)'}</option>
            ))}
          </select>
          <p className="text-[10px] text-muted-foreground">Le llega al cliente ahora mismo, sin pasar por la cola.</p>
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={() => setPanel(null)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="button" disabled={enviando || !flujo} onClick={() => void disparar()} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-60">
              {enviando ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Zap className="h-3 w-3" aria-hidden />}
              Disparar
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        {pendientes > 0 && (
          <span className="mr-auto inline-flex items-center gap-1 self-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300" title="Pedidos en la cola de conectores para este chat">
            <Inbox className="h-3 w-3" aria-hidden />
            {pendientes} en cola
          </span>
        )}
        {onExcluir && (
          <button type="button" onClick={() => onExcluir(group.chatId, group.name)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Excluir de Respuestas: el radar deja de avisar por este contacto">
            <Ban className="h-3.5 w-3.5" aria-hidden />
            Excluir
          </button>
        )}
        {onAbrirChat && (
          <button type="button" onClick={() => onAbrirChat(group.chatId)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted" title="Chat flotante">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Chat
          </button>
        )}
        {onPrompt && (
          <button type="button" onClick={() => setPanel((p) => (p === 'prompt' ? null : 'prompt'))} aria-pressed={panel === 'prompt'} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted" title="Dejar un prompt en la cola">
            <Wand2 className="h-3.5 w-3.5" aria-hidden />
            Prompt
          </button>
        )}
        {onFlujo && automations.length > 0 && (
          <button type="button" onClick={() => setPanel((p) => (p === 'flujo' ? null : 'flujo'))} aria-pressed={panel === 'flujo'} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted" title="Disparar un flujo">
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Flujo
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen(group.chatId)}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          title="Ficha completa"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Ficha
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onHandleAll(group)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
          {total > 1 ? `Atendido (${total})` : 'Atendida'}
        </button>
      </div>
    </li>
  );
}
