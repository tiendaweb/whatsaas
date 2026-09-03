'use client';

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Bell, BellRing, CalendarClock, CheckCheck, ClipboardList, Loader2, MessageSquare, Settings2, Smartphone, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { activarPushAqui, tienePushAqui } from '@/lib/notifications/cliente-push';
import { cn } from '@/lib/utils';
import { usePusher } from '@/providers/pusher-provider';
import type { NotificacionRow } from '@/lib/notifications/tipos';

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

function hace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Un ícono por familia de aviso: de un vistazo se sabe si urge o no. */
function iconoDe(type: string) {
  if (type.startsWith('calendar')) return CalendarClock;
  if (type.startsWith('task')) return ClipboardList;
  if (type.startsWith('sales') || type.startsWith('queue')) return Sparkles;
  if (type.startsWith('chat')) return MessageSquare;
  return Bell;
}

/**
 * La campana: lo que pasó mientras no mirabas.
 *
 * Muestra lo dirigido a la persona y lo del equipo. Se refresca sola por Pusher
 * (mismo canal del equipo que usa el chat) y al abrirla marca todo leído: si
 * hubiera que marcar de a uno, el contador no bajaría nunca. En el celular no
 * es un menú colgando de un ícono sino una hoja desde abajo: un panel de 20rem
 * anclado a un riel se sale de la pantalla.
 */
export function NotificacionesCampana({
  className,
  compact,
  align = 'right',
  side = 'bottom',
}: {
  className?: string;
  compact?: boolean;
  align?: 'left' | 'right';
  /** `top` cuando la campana vive al pie de un riel: si no, el panel se corta abajo. */
  side?: 'top' | 'bottom';
}) {
  const [abierta, setAbierta] = useState(false);
  const { data, mutate, isLoading } = useSWR<{ items: NotificacionRow[]; unread: number }>('/api/notifications?limit=25', fetcher, { refreshInterval: 120_000 });
  const pusher = usePusher();
  const team = useSWR<{ id: number } | null>('/api/team', fetcher);
  const teamId = team.data?.id ?? null;

  useEffect(() => {
    if (!pusher || !teamId) return;
    const channel = pusher.subscribe(`team-${teamId}`);
    const handler = () => void mutate();
    channel.bind('notification', handler);
    return () => {
      channel.unbind('notification', handler);
    };
  }, [pusher, teamId, mutate]);

  const marcarTodo = useCallback(async () => {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read' }) }).catch(() => null);
    void mutate();
  }, [mutate]);

  /**
   * El push no se puede activar desde el servidor: el permiso lo da cada
   * navegador. Si falta, la campana lo ofrece en un clic.
   */
  const [faltaPush, setFaltaPush] = useState(false);
  const [activando, setActivando] = useState(false);
  const prefs = useSWR<{ vapid: string | null }>(abierta ? '/api/notifications/alcance' : null, fetcher);
  useEffect(() => {
    if (!abierta) return;
    void tienePushAqui().then((tiene) => setFaltaPush(!tiene));
  }, [abierta]);

  const activarPush = async () => {
    setActivando(true);
    const r = await activarPushAqui(prefs.data?.vapid ?? null);
    setActivando(false);
    if (r.ok) {
      setFaltaPush(false);
      toast.success('Este dispositivo va a recibir avisos.');
    } else {
      toast.error(
        r.motivo === 'sin-permiso'
          ? 'El navegador no dio permiso para avisar.'
          : r.motivo === 'no-soportado'
            ? 'Este navegador no soporta avisos.'
            : r.motivo === 'sin-claves'
              ? 'Falta configurar las claves de push en el servidor.'
              : 'No se pudo activar el push.',
      );
    }
  };

  const items = data?.items ?? [];
  const sinLeer = data?.unread ?? 0;

  const contenido = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          Avisos
          {sinLeer > 0 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{sinLeer}</span>}
        </span>
        <div className="flex items-center gap-1">
          <a href="/plugins/calendar?panel=avisos" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" title="Configurar avisos">
            <Settings2 className="size-3.5" aria-hidden />
            Configurar
          </a>
          <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {faltaPush && (
        <button
          type="button"
          onClick={() => void activarPush()}
          disabled={activando}
          className="flex w-full items-center gap-2.5 border-b border-border bg-primary/5 px-3 py-2.5 text-left hover:bg-primary/10 disabled:opacity-60"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {activando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
          </span>
          <span className="min-w-0 text-[11px]">
            <span className="block font-semibold text-foreground">Activar avisos en este dispositivo</span>
            <span className="block text-muted-foreground">Para que lleguen aunque WhatsPro esté cerrado.</span>
          </span>
        </button>
      )}

      <ul className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain">
        {isLoading && (
          <li className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Cargando…
          </li>
        )}
        {!isLoading && items.length === 0 && (
          <li className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
            <BellRing className="size-6 text-muted-foreground/50" aria-hidden />
            <span className="text-xs font-medium text-muted-foreground">Nada nuevo por acá.</span>
            <span className="text-[11px] text-muted-foreground/80">Los recordatorios de agenda y lo que el equipo te mande aparecen en esta lista.</span>
          </li>
        )}
        {items.map((n) => {
          const Icono = iconoDe(n.type);
          const Contenido = (
            <>
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
                <Icono className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{n.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{hace(n.createdAt)}</span>
                </span>
                {n.body && <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted-foreground">{n.body}</span>}
              </span>
              {!n.readAt && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
            </>
          );
          return (
            <li key={n.id} className="border-b border-border/60 last:border-0">
              {n.url ? (
                <a href={n.url} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/60">{Contenido}</a>
              ) : (
                <div className="flex items-start gap-2.5 px-3 py-2.5">{Contenido}</div>
              )}
            </li>
          );
        })}
      </ul>

      {items.length > 0 && (
        <button type="button" onClick={() => void marcarTodo()} className="flex w-full items-center justify-center gap-1.5 border-t border-border py-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground">
          <CheckCheck className="size-3.5" aria-hidden />
          Marcar todo como leído
        </button>
      )}
    </>
  );

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => {
          setAbierta((v) => !v);
          if (!abierta && sinLeer > 0) void marcarTodo();
        }}
        aria-label={sinLeer ? `${sinLeer} avisos sin leer` : 'Avisos'}
        className={cn('relative flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', compact ? 'size-8' : 'size-9')}
      >
        {sinLeer > 0 ? <BellRing className={compact ? 'size-4' : 'size-5'} aria-hidden /> : <Bell className={compact ? 'size-4' : 'size-5'} aria-hidden />}
        {sinLeer > 0 && (
          <span className={cn('absolute flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground', compact ? '-right-0.5 -top-0.5' : 'right-1 top-1')}>
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 md:z-40 md:bg-transparent" onClick={() => setAbierta(false)} role="presentation" />

          {/* Celular: hoja desde abajo, que no depende de dónde esté el ícono. */}
          <div className="fixed inset-x-0 bottom-0 z-[61] overflow-hidden rounded-t-3xl border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl duration-200 animate-in slide-in-from-bottom-4 md:hidden">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
            {contenido}
          </div>

          {/* Escritorio: colgado del ícono. */}
          <div
            className={cn(
              'absolute z-50 hidden w-80 max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-card shadow-xl md:block',
              align === 'left' ? 'left-0' : 'right-0',
              side === 'top' ? 'bottom-full mb-2' : 'mt-2',
            )}
          >
            {contenido}
          </div>
        </>
      )}
    </div>
  );
}
