'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { BellRing, MessageCircle, X } from 'lucide-react';
import { usePusher } from '@/providers/pusher-provider';
import { activarPushAqui } from '@/lib/notifications/cliente-push';
import { leTocaElChat, type AlcanceChat, type AsignacionChat } from '@/lib/notifications/tipos';

type ChatListUpdatePayload = {
  id?: number;
  remoteJid: string;
  instanceId?: number | null;
  name?: string | null;
  pushName?: string | null;
  lastMessageText?: string | null;
  lastMessageTimestamp?: string | null;
  lastMessageFromMe?: boolean | null;
  unreadCount?: number | null;
};

type ChatLookup = {
  remoteJid: string;
  instanceId?: number | null;
  name?: string | null;
  pushName?: string | null;
  contact?: {
    name?: string | null;
    assignedDepartmentId?: number | null;
    assignedUser?: { id?: number | null } | null;
    assignedDepartment?: { name?: string | null } | null;
  } | null;
};

type IncomingAlert = {
  key: string;
  title: string;
  preview: string;
  href: string;
  remoteJid: string;
  instanceId?: number | null;
  /** De quién es el chat: se muestra para que se entienda por qué suena. */
  duenio: string | null;
};

type Alcance = { userId: number; sectores: number[]; alcance: AlcanceChat; pushEnabled: boolean; vapid: string | null };

const SOUNDS = [
  { id: 'sound1', src: '/sounds/notification_1.mp3' },
  { id: 'sound2', src: '/sounds/notification_2.mp3' },
  { id: 'sound3', src: '/sounds/notification_3.mp3' },
  { id: 'sound4', src: '/sounds/notification_4.mp3' },
  { id: 'sound5', src: '/sounds/notification_5.mp3' },
] as const;

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

function chatHref(payload: ChatListUpdatePayload) {
  const isGroup = payload.remoteJid.endsWith('@g.us');
  const routeParam = isGroup ? payload.remoteJid : payload.remoteJid.split('@')[0];
  const query = payload.instanceId ? `?instanceId=${payload.instanceId}` : '';
  return `/dashboard/chat/${routeParam}${query}`;
}

function fallbackName(payload: ChatListUpdatePayload) {
  return payload.name || payload.pushName || payload.remoteJid.split('@')[0];
}

/**
 * El aviso de mensaje entrante.
 *
 * Suena y salta **sólo si el chat es tuyo**: tuyo por asignación, por sector, o
 * porque no es de nadie. Antes le sonaba a todo el que tuviera WhatsPro abierto,
 * que es la forma más rápida de que un equipo apague los avisos y no se entere
 * de nada. La regla vive en `leTocaElChat`, la misma que usa el servidor para
 * decidir a quién le manda el push con la app cerrada.
 */
export function GlobalChatNotifications({ teamId }: { teamId: number }) {
  const t = useTranslations('Chat');
  const pusher = usePusher();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const alertTimerRef = useRef<number | null>(null);
  const recentEventsRef = useRef(new Set<string>());
  const [alert, setAlert] = useState<IncomingAlert | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [permissionPromptVisible, setPermissionPromptVisible] = useState(false);
  const [activando, setActivando] = useState(false);

  const { data: alcance } = useSWR<Alcance>('/api/notifications/alcance', fetcher, { revalidateOnFocus: false });
  const alcanceRef = useRef<Alcance | null>(null);
  useEffect(() => {
    alcanceRef.current = alcance ?? null;
  }, [alcance]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!('Notification' in window)) return;
    const syncPermission = () => {
      setPermission(Notification.permission);
      setPermissionPromptVisible(
        Notification.permission === 'default' &&
        sessionStorage.getItem('chatNotificationPromptDismissed') !== 'true',
      );
    };
    syncPermission();
    window.addEventListener('chat-notification-permission-change', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);
    return () => {
      window.removeEventListener('chat-notification-permission-change', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
    };
  }, []);

  /**
   * Si el navegador ya dio permiso, este dispositivo se registra solo para el
   * push. Pedir permiso sin registrar la suscripción era la razón por la que
   * "estaba activado" y no llegaba nada con la app cerrada.
   */
  useEffect(() => {
    if (permission !== 'granted' || !alcance?.vapid || !alcance.pushEnabled) return;
    // Una vez por sesión alcanza: la suscripción del navegador no cambia entre
    // pantalla y pantalla, y esto corre en cada página del panel.
    if (sessionStorage.getItem('pushRegistrado') === '1') return;
    void activarPushAqui(alcance.vapid).then((r) => {
      if (r.ok) sessionStorage.setItem('pushRegistrado', '1');
    });
  }, [permission, alcance?.vapid, alcance?.pushEnabled]);

  useEffect(() => {
    const audio = new Audio('/sounds/notification_1.mp3');
    audio.preload = 'auto';
    audio.volume = 0.5;
    audioRef.current = audio;

    const unlockAudio = () => {
      audio.muted = true;
      void audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => undefined);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, []);

  const playSound = useCallback((remoteJid: string) => {
    if (localStorage.getItem('soundEnabled') === 'false') return;

    try {
      const mutedChats = new Set<string>(JSON.parse(localStorage.getItem('mutedChats') || '[]'));
      if (mutedChats.has(remoteJid)) return;
    } catch {
      // A malformed local preference should not disable every notification.
    }

    const selectedSound = localStorage.getItem('selectedSound') || 'sound1';
    const sound = SOUNDS.find((item) => item.id === selectedSound) || SOUNDS[0];
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.src.endsWith(sound.src)) audio.src = sound.src;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.5;
    void audio.play().catch(() => undefined);
  }, []);

  const showBrowserNotification = useCallback(async (incoming: IncomingAlert) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;

    const options: NotificationOptions = {
      body: incoming.preview,
      icon: '/pwa-icon-192.png',
      badge: '/pwa-icon-192.png',
      tag: `whatspro-chat-${incoming.instanceId || 'any'}-${incoming.remoteJid}`,
      data: { url: incoming.href },
    };

    const registration = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration('/')
      : undefined;

    if (registration) {
      await registration.showNotification(incoming.title, options);
      return;
    }

    const notification = new Notification(incoming.title, options);
    notification.onclick = () => {
      window.focus();
      router.push(incoming.href);
      notification.close();
    };
  }, [router]);

  /** Busca el chat para saber el nombre real y, sobre todo, de quién es. */
  const resolverChat = useCallback(async (payload: ChatListUpdatePayload): Promise<{ alerta: IncomingAlert; asignacion: AsignacionChat; visible: boolean }> => {
    let title = fallbackName(payload);
    let asignacion: AsignacionChat = { assignedUserId: null, assignedDepartmentId: null };
    let duenio: string | null = null;
    // Si la consulta anda y el chat no aparece, es que esta persona no lo puede
    // ver (visibilidad por departamento): avisarle de algo que no puede abrir es
    // peor que no avisarle. Si la consulta falla, se avisa igual.
    let visible = true;
    const params = new URLSearchParams({ jid: payload.remoteJid });
    if (payload.instanceId) params.set('instanceId', String(payload.instanceId));

    try {
      const response = await fetch(`/api/chats?${params.toString()}`, { cache: 'no-store' });
      if (response.ok) {
        const chats = await response.json() as ChatLookup[];
        const chat = chats[0];
        visible = Boolean(chat);
        title = chat?.contact?.name || chat?.name || chat?.pushName || title;
        asignacion = {
          assignedUserId: chat?.contact?.assignedUser?.id ?? null,
          assignedDepartmentId: chat?.contact?.assignedDepartmentId ?? null,
        };
        duenio = chat?.contact?.assignedDepartment?.name ?? null;
      }
    } catch {
      // Sin respuesta se avisa igual: perder un mensaje es peor que un aviso de más.
    }

    const preview = payload.lastMessageText?.trim() || t('global_new_message');
    const key = `${payload.remoteJid}:${payload.lastMessageTimestamp || ''}:${preview}`;
    return {
      alerta: { key, title, preview, href: chatHref(payload), remoteJid: payload.remoteJid, instanceId: payload.instanceId, duenio },
      asignacion,
      visible,
    };
  }, [t]);

  useEffect(() => {
    if (!pusher || !teamId) return;

    const channelName = `team-${teamId}`;
    const channel = pusher.subscribe(channelName);

    const handleIncoming = async (payload: ChatListUpdatePayload) => {
      if (!payload.remoteJid || payload.lastMessageFromMe !== false) return;

      const eventKey = `${payload.remoteJid}:${payload.lastMessageTimestamp || ''}:${payload.lastMessageText || ''}`;
      if (recentEventsRef.current.has(eventKey)) return;
      recentEventsRef.current.add(eventKey);
      if (recentEventsRef.current.size > 100) {
        recentEventsRef.current.delete(recentEventsRef.current.values().next().value as string);
      }

      const { alerta, asignacion, visible } = await resolverChat(payload);
      if (!visible) return;

      // El corte: si el chat no es tuyo, ni suena ni salta. Mientras no sepamos
      // quién sos (primer render), se avisa: se corrige en el siguiente evento.
      const yo = alcanceRef.current;
      if (yo && !leTocaElChat({ userId: yo.userId, sectores: yo.sectores, alcance: yo.alcance }, asignacion)) return;

      playSound(payload.remoteJid);

      const activePath = alerta.href.split('?')[0];
      const activeInstanceId = new URLSearchParams(window.location.search).get('instanceId');
      const sameInstance = !alerta.instanceId || activeInstanceId === String(alerta.instanceId);
      if (pathnameRef.current.endsWith(activePath) && sameInstance) return;

      setAlert(alerta);
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
      alertTimerRef.current = window.setTimeout(() => setAlert(null), 9000);
      void showBrowserNotification(alerta);
    };

    channel.bind('chat-list-update', handleIncoming);
    return () => {
      channel.unbind('chat-list-update', handleIncoming);
    };
  }, [pusher, playSound, resolverChat, showBrowserNotification, teamId]);

  const openChat = (incoming: IncomingAlert) => {
    setAlert(null);
    router.push(incoming.href);
  };

  /** Permiso del navegador **y** alta de la suscripción: si no, el push no existe. */
  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    setActivando(true);
    const r = await activarPushAqui(alcance?.vapid ?? null);
    setActivando(false);
    setPermission(Notification.permission);
    setPermissionPromptVisible(false);
    window.dispatchEvent(new Event('chat-notification-permission-change'));

    if (r.ok) {
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
      const options: NotificationOptions = {
        body: t('global_notifications_enabled_body'),
        icon: '/pwa-icon-192.png',
        badge: '/pwa-icon-192.png',
        tag: 'whatspro-notifications-enabled',
      };
      if (registration) await registration.showNotification(t('global_notifications_enabled_title'), options);
      else new Notification(t('global_notifications_enabled_title'), options);
    }
  };

  const dismissPermissionPrompt = () => {
    sessionStorage.setItem('chatNotificationPromptDismissed', 'true');
    setPermissionPromptVisible(false);
  };

  const inicial = useMemo(() => (alert?.title ?? '?').trim().charAt(0).toUpperCase(), [alert?.title]);

  return (
    <>
      {alert ? (
        <section
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 top-3 z-[100] overflow-hidden rounded-2xl border border-border/70 bg-card/95 text-card-foreground shadow-xl backdrop-blur duration-300 animate-in slide-in-from-top-2 fade-in md:left-auto md:right-6 md:top-6 md:w-[24rem]"
        >
          <button type="button" onClick={() => openChat(alert)} className="flex w-full min-w-0 items-start gap-3 p-3.5 text-left transition-colors hover:bg-muted/50">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {inicial || <MessageCircle className="size-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{alert.title}</span>
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('global_new_message')}</span>
              </span>
              <span className="mt-0.5 block line-clamp-2 break-words text-[13px] leading-snug text-muted-foreground">{alert.preview}</span>
              {alert.duenio && <span className="mt-1.5 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{alert.duenio}</span>}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAlert(null)}
            aria-label={t('global_dismiss_alert')}
            className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </section>
      ) : null}

      {permissionPromptVisible && permission === 'default' ? (
        <section className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] overflow-hidden rounded-2xl border border-border/70 bg-card/95 text-card-foreground shadow-xl backdrop-blur md:bottom-6 md:left-auto md:right-6 md:w-[24rem]">
          <div className="flex min-w-0 items-start gap-3 p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BellRing className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('global_notifications_prompt_title')}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('global_notifications_prompt_body')}</p>
              <button
                type="button"
                onClick={() => void requestPermission()}
                disabled={activando}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {t('global_enable_notifications')}
              </button>
            </div>
            <button
              type="button"
              onClick={dismissPermissionPrompt}
              aria-label={t('global_dismiss_alert')}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
