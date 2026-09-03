'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ArrowDown, FileText, Info, Loader2, MapPin, Send } from 'lucide-react';
import { usePusher } from '@/providers/pusher-provider';
import { CustomAudioPlayer } from '@/components/ui/custom-audio-player';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * Chat embebido: lectura y respuesta rápida de una conversación de WhatsApp
 * dentro de otra pantalla (ficha de Tareas, Command Center, Seguimiento).
 *
 * Nació en `lib/plugins/tasks/ui-nueva/views/ChatCliente.tsx` y se extrajo acá
 * para reutilizarlo. Deliberadamente NO usa `MessageBubble`: ese componente
 * arrastra el tema del chat principal, traducciones y una decena de callbacks.
 *
 * Contrato con el padre:
 * - **`key={remoteJid}` lo pone el padre.** El componente asume que vive para
 *   un solo contacto: al cambiar de JID hay que remontarlo para que el scroll,
 *   la paginación y el texto sin enviar no se mezclen entre conversaciones.
 * - `tokens`: `'core'` (default) usa los tokens del sistema (`bg-muted`,
 *   `bg-primary/10`…); `'tareas'` conserva las variables `var(--t-*)` del
 *   plugin Tareas para que esa app no cambie de aspecto.
 * - `chatId`: si viene, marca leído al montar y con cada mensaje nuevo del JID.
 * - `puedeEnviar === false` reemplaza la caja por un aviso para conectar WhatsApp.
 * - `ocultarEnviados`: deja sólo lo que escribió el cliente (y las notas
 *   internas, que son anotaciones nuestras, no mensajes que le llegaron). Sirve
 *   para leer una conversación larga sin la mitad propia; no cambia lo que se
 *   trae del servidor, sólo lo que se dibuja.
 */

export type ChatEmbebidoProps = {
  remoteJid: string;
  instanceId?: number | null;
  chatId?: number | null;
  nombre: string;
  teamId: number | null;
  puedeEnviar?: boolean;
  ocultarEnviados?: boolean;
  tokens?: 'core' | 'tareas';
  className?: string;
};

type MensajeApi = {
  id: string;
  text: string | null;
  fromMe: boolean;
  timestamp: string;
  messageType: string | null;
  mediaUrl: string | null;
  mediaMimetype: string | null;
  mediaCaption: string | null;
  status: string | null;
  isInternal: boolean | null;
  participantName?: string | null;
  locationLatitude?: string | null;
  locationLongitude?: string | null;
  locationName?: string | null;
};

const LIMITE = 60;
/** Distancia al fondo (px) por debajo de la cual consideramos que el usuario "está al final". */
const UMBRAL_FONDO = 80;

const TEXTOS = {
  cargando: 'Cargando…',
  sinMensajes: 'Todavía no hay mensajes en esta conversación.',
  cargarAnteriores: 'Cargar anteriores',
  nuevos: 'Nuevos mensajes',
  placeholder: (nombre: string) => `Escribirle a ${nombre}…`,
  placeholderNota: 'Nota interna (no se envía al cliente)…',
  enviar: 'Enviar',
  nota: 'Nota',
  errorEnvio: 'No se pudo enviar el mensaje.',
  errorCarga: 'No se pudieron cargar los mensajes anteriores.',
  fallido: 'no salió',
  adjunto: 'Adjunto',
  ubicacion: 'Ubicación',
  verMapa: 'Ver en el mapa',
  sinWhatsapp: 'Conectá WhatsApp para responder.',
  soloEnviados: 'En esta conversación sólo hay mensajes nuestros. Marcá "Enviados" para verlos.',
};

/** Textos de los eventos de sistema (`@@syslog_*`), calcados de messages/es.json → Chat. */
const SYSLOG: Record<string, (p: Record<string, string>) => string> = {
  syslog_chat_closed: (p) => `${p.name ?? ''} cerró el chat`,
  syslog_moved_to_stage: (p) => `${p.name ?? ''} movió a etapa: ${p.stage ?? ''}`,
  syslog_transferred_to: (p) => `${p.name ?? ''} transfirió a ${p.agent ?? ''}`,
  syslog_unassigned: (p) => `${p.name ?? ''} desasignó el chat`,
  syslog_department_assigned: (p) => `${p.name ?? ''} asignó al departamento: ${p.department ?? ''}`,
  syslog_department_removed: (p) => `${p.name ?? ''} removió el departamento del chat`,
  syslog_ai_moved_to_stage: (p) => `IA movió a etapa: ${p.stage ?? ''}`,
  syslog_ai_assigned_agent: (p) => `IA asignó al agente: ${p.agent ?? ''}`,
  syslog_ai_set_field: (p) => `IA definió "${p.field ?? ''}" como "${p.value ?? ''}"`,
  syslog_ai_added_note: () => 'IA agregó nota al contacto',
  syslog_ai_added_tag: (p) => `IA agregó etiqueta: ${p.tag ?? ''}`,
  syslog_ai_deactivated: (p) => `IA desactivó la conversación${p.reason ?? ''}`,
  syslog_contact_auto_created: (p) => `Contacto "${p.name ?? ''}" creado automáticamente por IA`,
  syslog_user_activated_ai: (p) => `${p.name ?? ''} activó la IA`,
  syslog_user_deactivated_ai: (p) => `${p.name ?? ''} desactivó la IA`,
};

function textoSistema(texto: string | null): string {
  const raw = texto ?? '';
  if (!raw.startsWith('@@')) return raw;
  const partes = raw.slice(2).split('|');
  const clave = partes[0];
  const params: Record<string, string> = {};
  for (let i = 1; i < partes.length; i++) {
    const idx = partes[i].indexOf('=');
    if (idx > 0) params[partes[i].slice(0, idx)] = partes[i].slice(idx + 1);
  }
  const fn = SYSLOG[clave];
  if (fn) return fn(params).trim();
  return clave.replace(/^syslog_/, '').replace(/_/g, ' ');
}

function hora(iso: string) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(fecha);
  } catch {
    return fecha.toISOString().slice(0, 16).replace('T', ' ');
  }
}

const normalizarJid = (jid: string) => (jid || '').split(':')[0];

/**
 * Dos juegos de clases. `tareas` copia EXACTAMENTE lo que tenía ChatCliente
 * (variables `--t-*` y `--tareas-accent`); `core` usa tokens del sistema.
 */
const ESTILOS = {
  core: {
    contenedor: 'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card',
    lista: 'flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2',
    muted: 'text-sm text-muted-foreground',
    burbuja: 'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
    propia: 'bg-primary/10 text-foreground',
    ajena: 'bg-muted text-foreground',
    nota: 'border border-dashed border-border bg-muted/40 text-foreground',
    horaPropia: 'text-[10px] text-muted-foreground',
    horaAjena: 'text-[10px] text-muted-foreground',
    link: 'underline underline-offset-2 hover:text-primary',
    sistema: 'flex max-w-full items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-3 py-1 text-xs text-muted-foreground',
    botonSecundario: 'rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50',
    botonFlotante: 'rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm hover:bg-muted',
    pie: 'border-t border-border p-3',
    input: 'flex-1 resize-none rounded-2xl bg-muted px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground',
    enviar: 'shrink-0 rounded-2xl bg-primary p-3 text-primary-foreground disabled:opacity-40',
    aviso: 'border-t border-border p-3 text-center text-xs text-muted-foreground',
    etiquetaNota: 'text-xs text-muted-foreground',
  },
  tareas: {
    contenedor: 'flex flex-col rounded-3xl border border-[var(--t-border)] bg-[var(--t-surface)] overflow-hidden',
    lista: 'max-h-[52vh] min-h-[220px] overflow-y-auto px-4 py-4 space-y-2',
    muted: 'text-sm text-[var(--t-muted)]',
    burbuja: 'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
    propia: 'bg-[var(--tareas-accent)] text-white',
    ajena: 'bg-[var(--t-surface-2)] text-[var(--t-text)]',
    nota: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
    horaPropia: 'text-[10px] text-white/70',
    horaAjena: 'text-[10px] text-[var(--t-muted)]',
    link: 'underline break-all',
    sistema: 'flex max-w-full items-center gap-2 rounded-full border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 py-1 text-xs text-[var(--t-muted)]',
    botonSecundario: 'rounded-full border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 py-1 text-xs text-[var(--t-muted)] disabled:opacity-50',
    botonFlotante: 'rounded-full bg-[var(--tareas-accent)] px-3 py-1.5 text-xs text-white shadow-sm',
    pie: 'border-t border-[var(--t-border)] p-3',
    input: 'flex-1 resize-none rounded-2xl bg-[var(--t-surface-2)] px-4 py-3 text-sm text-[var(--t-text)] outline-none placeholder:text-[var(--t-muted)]',
    enviar: 'shrink-0 rounded-2xl bg-[var(--tareas-accent)] p-3 text-white disabled:opacity-40',
    aviso: 'border-t border-[var(--t-border)] p-3 text-center text-xs text-[var(--t-muted)]',
    etiquetaNota: 'text-xs text-[var(--t-muted)]',
  },
} as const;

export function ChatEmbebido(props: ChatEmbebidoProps) {
  const { remoteJid, instanceId, chatId, nombre, teamId, puedeEnviar = true, ocultarEnviados = false, tokens = 'core', className } = props;
  const S = ESTILOS[tokens];
  const pusher = usePusher();

  const [texto, setTexto] = useState('');
  const [esNota, setEsNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [anteriores, setAnteriores] = useState<MensajeApi[]>([]);
  const [hayMas, setHayMas] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayNuevos, setHayNuevos] = useState(false);

  const listaRef = useRef<HTMLDivElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  /** Qué hacer con el scroll cuando cambie la lista: 'forzar' (propio/montaje) o 'siCerca' (ajeno). */
  const scrollPendiente = useRef<'forzar' | 'siCerca' | null>('forzar');
  /** Para conservar la posición al prepender mensajes anteriores. */
  const alturaAntesDePrepender = useRef<number | null>(null);

  const clave = remoteJid
    ? `/api/messages?jid=${encodeURIComponent(remoteJid)}&limit=${LIMITE}${instanceId ? `&instanceId=${instanceId}` : ''}`
    : null;
  const { data, isLoading, mutate } = useSWR<MensajeApi[]>(
    clave,
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])),
    { revalidateOnFocus: false },
  );

  const mensajes = useMemo(() => {
    const recientes = data ?? [];
    if (anteriores.length === 0) return recientes;
    const vistos = new Set(recientes.map((m) => m.id));
    return [...anteriores.filter((m) => !vistos.has(m.id)), ...recientes];
  }, [data, anteriores]);

  /**
   * Lo que se dibuja. La paginación y el scroll siguen contando `mensajes`
   * completos: si filtrar cambiara el total, "Cargar anteriores" desaparecería
   * en una conversación donde casi todo lo escribimos nosotros.
   */
  const visibles = useMemo(
    () => (ocultarEnviados ? mensajes.filter((m) => !m.fromMe || m.isInternal) : mensajes),
    [mensajes, ocultarEnviados],
  );

  const estaCercaDelFondo = useCallback(() => {
    const el = listaRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < UMBRAL_FONDO;
  }, []);

  const irAlFinal = useCallback(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
    setHayNuevos(false);
  }, []);

  const marcarLeido = useCallback(() => {
    if (!chatId) return;
    fetch('/api/chats/mark-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatId }),
    }).catch(() => { /* no bloquea la lectura */ });
  }, [chatId]);

  // Al montar: marcar leído. (El padre remonta con key={remoteJid}.)
  useEffect(() => { marcarLeido(); }, [marcarLeido]);

  // Live: el equipo puede estar contestando desde la bandeja mientras esta
  // ficha está abierta.
  useEffect(() => {
    if (!pusher || !teamId) return;
    const channel = pusher.subscribe(`team-${teamId}`);
    const onNuevo = (payload: { remoteJid?: string; fromMe?: boolean }) => {
      if (normalizarJid(payload.remoteJid ?? '') !== normalizarJid(remoteJid)) return;
      scrollPendiente.current = payload.fromMe ? 'forzar' : 'siCerca';
      if (!payload.fromMe) marcarLeido();
      void mutate();
    };
    channel.bind('new-message', onNuevo);
    return () => { channel.unbind('new-message', onNuevo); };
  }, [pusher, teamId, remoteJid, mutate, marcarLeido]);

  // Scroll tras cada cambio de lista, según lo que haya pedido quien la cambió.
  useEffect(() => {
    const el = listaRef.current;
    if (alturaAntesDePrepender.current !== null && el) {
      // Se prependieron mensajes: mantener la vista donde estaba.
      el.scrollTop += el.scrollHeight - alturaAntesDePrepender.current;
      alturaAntesDePrepender.current = null;
      return;
    }
    const modo = scrollPendiente.current;
    scrollPendiente.current = null;
    if (modo === 'forzar') {
      irAlFinal();
    } else if (modo === 'siCerca') {
      if (estaCercaDelFondo()) irAlFinal();
      else setHayNuevos(true);
    }
  }, [mensajes.length, irAlFinal, estaCercaDelFondo]);

  // Si el usuario baja solo hasta el final, el botón de "nuevos" deja de tener sentido.
  const onScroll = () => {
    if (hayNuevos && estaCercaDelFondo()) setHayNuevos(false);
  };

  const cargarAnteriores = async () => {
    const primero = mensajes[0];
    if (!primero || cargandoMas) return;
    setCargandoMas(true);
    try {
      const url = `/api/messages?jid=${encodeURIComponent(remoteJid)}&limit=${LIMITE}` +
        `&before=${encodeURIComponent(primero.timestamp)}&beforeId=${encodeURIComponent(primero.id)}` +
        (instanceId ? `&instanceId=${instanceId}` : '');
      const res = await fetch(url);
      if (!res.ok) throw new Error(TEXTOS.errorCarga);
      const lote = (await res.json()) as MensajeApi[];
      if (lote.length < LIMITE) setHayMas(false);
      if (lote.length > 0) {
        alturaAntesDePrepender.current = listaRef.current?.scrollHeight ?? null;
        setAnteriores((prev) => [...lote, ...prev]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : TEXTOS.errorCarga);
    } finally {
      setCargandoMas(false);
    }
  };

  const enviar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    setTexto('');
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipientJid: remoteJid,
          text: cuerpo,
          ...(instanceId ? { instanceId } : {}),
          ...(esNota ? { isInternal: true } : {}),
        }),
      });
      const cuerpoRes = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpoRes?.error || TEXTOS.errorEnvio);
      scrollPendiente.current = 'forzar';
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : TEXTOS.errorEnvio);
      // El texto vuelve a la caja para no perder lo escrito.
      setTexto((actual) => (actual ? actual : cuerpo));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={cn(S.contenedor, className)}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={listaRef} onScroll={onScroll} className={S.lista}>
          {isLoading && <p className={S.muted}>{TEXTOS.cargando}</p>}
          {!isLoading && visibles.length === 0 && (
            <p className={S.muted}>{mensajes.length === 0 ? TEXTOS.sinMensajes : TEXTOS.soloEnviados}</p>
          )}
          {!isLoading && mensajes.length >= LIMITE && hayMas && (
            <div className="flex justify-center pb-1">
              <button type="button" onClick={() => void cargarAnteriores()} disabled={cargandoMas} className={S.botonSecundario}>
                {cargandoMas ? <Loader2 className="inline h-3 w-3 animate-spin" /> : TEXTOS.cargarAnteriores}
              </button>
            </div>
          )}
          {visibles.map((msg) => (
            <Mensaje key={msg.id} msg={msg} S={S} tokens={tokens} />
          ))}
          <div ref={finRef} />
        </div>

        {hayNuevos && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <button type="button" onClick={irAlFinal} className={cn('pointer-events-auto inline-flex items-center gap-1', S.botonFlotante)}>
              <ArrowDown className="h-3 w-3" /> {TEXTOS.nuevos}
            </button>
          </div>
        )}
      </div>

      {puedeEnviar === false ? (
        <div className={S.aviso}>{TEXTOS.sinWhatsapp}</div>
      ) : (
        <div className={S.pie}>
          <div className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void enviar();
                }
              }}
              rows={1}
              placeholder={esNota ? TEXTOS.placeholderNota : TEXTOS.placeholder(nombre)}
              className={S.input}
            />
            <label className={cn('flex shrink-0 select-none items-center gap-1.5 pb-3', S.etiquetaNota)}>
              <Switch checked={esNota} onCheckedChange={setEsNota} className="scale-90" aria-label={TEXTOS.nota} />
              {TEXTOS.nota}
            </label>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!texto.trim() || enviando}
              className={S.enviar}
              aria-label={TEXTOS.enviar}
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Estilos = (typeof ESTILOS)[keyof typeof ESTILOS];

function Mensaje({ msg, S, tokens }: { msg: MensajeApi; S: Estilos; tokens: 'core' | 'tareas' }) {
  const tipo = msg.messageType ?? '';
  const mime = msg.mediaMimetype ?? '';

  if (tipo === 'system' || (msg.text ?? '').startsWith('@@syslog_')) {
    return (
      <div className="my-3 flex w-full justify-center">
        <div className={S.sistema}>
          <Info className="h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{textoSistema(msg.text)}</span>
        </div>
      </div>
    );
  }

  const esImagen = !!msg.mediaUrl && (mime.startsWith('image/') || tipo === 'imageMessage');
  const esAudio = !!msg.mediaUrl && (mime.startsWith('audio/') || tipo === 'audioMessage');
  const esUbicacion = tipo === 'locationMessage' && !!msg.locationLatitude && !!msg.locationLongitude;
  const esDocumento = !!msg.mediaUrl && !esImagen && !esAudio;
  const esTexto = !!(msg.text || msg.mediaCaption);
  const esNota = !!msg.isInternal;

  let cuerpo: React.ReactNode;
  if (esImagen) {
    cuerpo = (
      <>
        <a href={msg.mediaUrl!} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- media del chat */}
          <img src={msg.mediaUrl!} alt={msg.mediaCaption ?? ''} className="mb-1.5 max-h-56 rounded-xl object-cover" loading="lazy" />
        </a>
        {msg.mediaCaption && <p className="whitespace-pre-wrap break-words">{msg.mediaCaption}</p>}
      </>
    );
  } else if (esAudio) {
    cuerpo = (
      <div className="mb-1 w-56 max-w-full">
        <CustomAudioPlayer src={msg.mediaUrl!} isMe={msg.fromMe} />
        {msg.mediaCaption && <p className="mt-1 whitespace-pre-wrap break-words">{msg.mediaCaption}</p>}
      </div>
    );
  } else if (esUbicacion) {
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(msg.locationLatitude!)},${encodeURIComponent(msg.locationLongitude!)}`;
    cuerpo = (
      <a href={mapsUrl} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1.5', S.link)}>
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span>{msg.locationName || TEXTOS.ubicacion} · {TEXTOS.verMapa}</span>
      </a>
    );
  } else if (esDocumento) {
    cuerpo = (
      <a href={msg.mediaUrl!} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1.5 break-all', S.link)}>
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span>{msg.text || msg.mediaCaption || TEXTOS.adjunto}</span>
      </a>
    );
  } else if (esTexto) {
    cuerpo = <p className="whitespace-pre-wrap break-words">{msg.mediaCaption || msg.text}</p>;
  } else {
    cuerpo = <p className="italic opacity-70">[{tipo || 'mensaje'}]</p>;
  }

  return (
    <div className={cn('flex', msg.fromMe ? 'justify-end' : 'justify-start')}>
      <div className={cn(S.burbuja, esNota ? S.nota : msg.fromMe ? S.propia : S.ajena)}>
        {esNota && tokens === 'core' && (
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nota</span>
        )}
        {cuerpo}
        <div className={cn('mt-1', msg.fromMe && !esNota ? S.horaPropia : S.horaAjena)}>
          {hora(msg.timestamp)}
          {msg.status === 'error' ? ` · ${TEXTOS.fallido}` : ''}
        </div>
      </div>
    </div>
  );
}
