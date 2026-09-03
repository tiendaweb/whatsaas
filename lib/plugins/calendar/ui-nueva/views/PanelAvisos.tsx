'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Bell, BellOff, Check, Loader2, MessageSquare, Moon, Phone, Send, Smartphone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ALCANCES_CHAT,
  ALCANCE_AYUDA,
  ALCANCE_LABELS,
  CANALES,
  CANAL_LABELS,
  KINDS,
  KIND_LABELS,
  type AlcanceChat,
  type Canal,
  type MiembroAvisos,
  type PrefsNotificacion,
  type Sector,
} from '@/lib/notifications/tipos';
import { C } from '../data/clases';
import { activarPushAqui, tienePushAqui } from '@/lib/notifications/cliente-push';

type Payload = {
  prefs: PrefsNotificacion;
  grupos: Array<{ jid: string; name: string }>;
  sectores: Sector[];
  destinatarios: MiembroAvisos[];
  yo: { userId: number; sectores: number[]; puedeEditarEquipo: boolean };
  vapid: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

/** Una tarjeta con título, bajada e ícono: todas las secciones se ven igual. */
function Tarjeta({ icono: Icono, titulo, bajada, children, className }: { icono: typeof Bell; titulo: string; bajada: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4', className)}>
      <header className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--c-chip)] text-[var(--cal-accent)]">
          <Icono className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[var(--c-text)]">{titulo}</h3>
          <p className="text-xs leading-snug text-[var(--c-text-secondary)]">{bajada}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/** Estado de un canal: verde cuando de verdad va a llegar algo por ahí. */
function Estado({ ok, si, no }: { ok: boolean; si: string; no: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-[var(--c-chip)] text-[var(--c-muted)]')}>
      <span className={cn('size-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-[var(--c-muted)]')} aria-hidden />
      {ok ? si : no}
    </span>
  );
}

/**
 * Avisos: por dónde le llega cada cosa a cada uno, y a quién.
 *
 * Lo que ordena la pantalla es una pregunta sola: ¿de qué te avisamos y por
 * dónde? Arriba lo tuyo; abajo, si mandás vos, el equipo entero en una tabla —
 * porque el teléfono que falta o el sector vacío de otro es exactamente lo que
 * hace que un aviso no llegue, y desde la pantalla de cada uno no se ve.
 */
export function PanelAvisos() {
  const { data, mutate, isLoading } = useSWR<Payload>('/api/notifications/prefs', fetcher);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | 'no-soportado'>('default');
  const [pushAqui, setPushAqui] = useState(false);
  const [suscribiendo, setSuscribiendo] = useState(false);
  const [prueba, setPrueba] = useState<Canal[]>(['inapp', 'push']);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) setPermiso('no-soportado');
    else setPermiso(Notification.permission);
    void tienePushAqui().then(setPushAqui);
  }, []);

  const prefs = data?.prefs;
  const miSector = data?.yo.sectores[0] ?? null;

  const guardar = async (patch: Record<string, unknown>, quien = 'yo') => {
    setGuardando(quien);
    try {
      const res = await fetch('/api/notifications/prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? 'No se pudo guardar'));
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(null);
    }
  };

  /** Pide permiso y registra este navegador. El permiso lo da la persona, no el servidor. */
  const activarPush = async () => {
    setSuscribiendo(true);
    const r = await activarPushAqui(data?.vapid ?? null);
    setSuscribiendo(false);
    if (r.ok) {
      setPermiso('granted');
      setPushAqui(true);
      await guardar({ pushEnabled: true });
      toast.success('Listo: este dispositivo va a recibir avisos.');
      return;
    }
    toast.error(
      r.motivo === 'sin-permiso'
        ? 'El navegador no dio permiso para avisar.'
        : r.motivo === 'no-soportado'
          ? 'Este navegador no soporta avisos.'
          : r.motivo === 'sin-claves'
            ? 'El servidor no tiene configuradas las claves de push.'
            : 'No se pudo activar el push.',
    );
  };

  const enviarPrueba = async () => {
    setEnviando(true);
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', title: 'Aviso de prueba', body: 'Si ves esto, el canal funciona.', channels: prueba, kind: 'system', url: '/plugins/calendar?panel=avisos' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? 'No se pudo enviar'));
      toast.success(body?.enviados ? 'Prueba enviada.' : 'Quedó en la cola (revisá que el canal esté activo).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  if (isLoading || !prefs || !data) {
    return (
      <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-[var(--c-surface)]" />)}
      </div>
    );
  }

  const sectorDe = (m: MiembroAvisos) => data.sectores.find((s) => m.sectores.includes(s.id));
  const pushListo = permiso === 'granted' && pushAqui;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[var(--c-text)]">Avisos</h2>
          <p className="text-sm text-[var(--c-text-secondary)]">De qué te avisamos, por dónde y a quién del equipo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Estado ok={pushListo} si="Push activo acá" no="Push sin activar" />
          <Estado ok={prefs.whatsappEnabled && Boolean(prefs.whatsappPhone)} si="WhatsApp cargado" no="Sin WhatsApp" />
          <Estado ok={Boolean(miSector)} si={data.sectores.find((s) => s.id === miSector)?.name ?? 'Con sector'} no="Sin sector" />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Tarjeta icono={MessageSquare} titulo="De qué chats te avisamos" bajada="Lo que evita que a todo el equipo le suene cada mensaje que entra.">
          <div className="grid gap-1.5">
            {ALCANCES_CHAT.map((a) => {
              const activo = prefs.chatAlerts === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => void guardar({ chatAlerts: a })}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
                    activo ? 'border-[var(--cal-accent)] bg-[color-mix(in_srgb,var(--cal-accent)_8%,transparent)]' : 'border-[var(--c-border-2)] hover:bg-[var(--c-hover)]',
                  )}
                >
                  <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2', activo ? 'border-[var(--cal-accent)] bg-[var(--cal-accent)] text-white' : 'border-[var(--c-border-2)]')}>
                    {activo && <Check className="size-2.5" aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--c-text)]">{ALCANCE_LABELS[a]}</span>
                    <span className="block text-[11px] leading-snug text-[var(--c-text-secondary)]">{ALCANCE_AYUDA[a]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Tarjeta>

        <div className="flex flex-col gap-3">
          <Tarjeta icono={Users} titulo="Tu sector" bajada="Los avisos generales van al sector que corresponde. Es el mismo al que se asignan los chats.">
            {data.sectores.length === 0 ? (
              <p className="text-xs text-[var(--c-muted)]">El equipo todavía no tiene sectores. Se crean en Ajustes › Departamentos.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.sectores.map((s) => (
                  <button key={s.id} type="button" onClick={() => void guardar({ sector: miSector === s.id ? null : s.id })} className={cn(C.chip, miSector === s.id ? C.chipActive : C.chipIdle)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </Tarjeta>

          <Tarjeta icono={Smartphone} titulo="Push del navegador" bajada="Llega aunque WhatsPro esté cerrado. Hay que activarlo en cada dispositivo.">
            {permiso === 'no-soportado' ? (
              <p className="text-xs text-[var(--c-muted)]">Este navegador no soporta avisos.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {!pushListo && (
                  <button type="button" onClick={() => void activarPush()} disabled={suscribiendo} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cal-accent)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                    {suscribiendo ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Bell className="size-3.5" aria-hidden />}
                    Activar en este dispositivo
                  </button>
                )}
                {pushListo && <Estado ok si="Este dispositivo ya recibe" no="" />}
                {permiso === 'denied' && <span className="text-[11px] text-[var(--c-muted)]">Está bloqueado en el navegador: hay que habilitarlo desde el candado de la barra de direcciones.</span>}
                {prefs.pushEnabled ? (
                  <button type="button" onClick={() => void guardar({ pushEnabled: false })} className="inline-flex items-center gap-1.5 text-xs text-[var(--c-muted)] hover:text-[var(--c-text)]">
                    <BellOff className="size-3.5" aria-hidden />
                    Apagar el push
                  </button>
                ) : (
                  <button type="button" onClick={() => void guardar({ pushEnabled: true })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cal-accent)]">
                    <Bell className="size-3.5" aria-hidden />
                    Prender el push
                  </button>
                )}
              </div>
            )}
          </Tarjeta>
        </div>

        <Tarjeta icono={Phone} titulo="WhatsApp" bajada="Al número que pongas acá. Puede ser distinto del de tu cuenta.">
          <div className="flex flex-wrap items-center gap-2">
            <input
              defaultValue={prefs.whatsappPhone ?? ''}
              onBlur={(e) => e.target.value !== (prefs.whatsappPhone ?? '') && void guardar({ whatsappPhone: e.target.value.trim() || null })}
              placeholder="5491122334455"
              inputMode="tel"
              className={cn(C.control, 'max-w-52')}
            />
            <label className="flex items-center gap-2 text-sm text-[var(--c-text-secondary)]">
              <input type="checkbox" checked={prefs.whatsappEnabled} onChange={(e) => void guardar({ whatsappEnabled: e.target.checked })} />
              Avisarme por WhatsApp
            </label>
            {guardando === 'yo' && <Loader2 className="size-4 animate-spin text-[var(--c-muted)]" aria-hidden />}
          </div>
          <label className="block">
            <span className={cn(C.rotulo, 'mb-1 block')}>Grupo del equipo</span>
            <select value={prefs.groupJid ?? ''} onChange={(e) => void guardar({ groupJid: e.target.value || null })} className={C.control}>
              <option value="">Sin grupo</option>
              {data.grupos.map((g) => (
                <option key={g.jid} value={g.jid}>{g.name}</option>
              ))}
            </select>
          </label>
        </Tarjeta>

        <Tarjeta icono={Moon} titulo="Horario de silencio" bajada="Entre estas horas no salen ni push ni WhatsApp. En la app se siguen viendo.">
          <div className="flex items-center gap-2">
            <select value={prefs.quietFrom ?? ''} onChange={(e) => void guardar({ quietFrom: e.target.value === '' ? null : Number(e.target.value) })} className={cn(C.control, 'max-w-28')}>
              <option value="">—</option>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
            <span className="text-sm text-[var(--c-text-secondary)]">a</span>
            <select value={prefs.quietTo ?? ''} onChange={(e) => void guardar({ quietTo: e.target.value === '' ? null : Number(e.target.value) })} className={cn(C.control, 'max-w-28')}>
              <option value="">—</option>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
        </Tarjeta>
      </div>

      {data.yo.puedeEditarEquipo && (
        <Tarjeta icono={Users} titulo="El equipo" bajada="El teléfono y el sector de cada uno. Sin teléfono no hay WhatsApp; sin sector, no le llega nada sectorizado.">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-separate border-spacing-y-1 px-1 text-sm">
              <thead>
                <tr className="text-left">
                  <th className={cn(C.rotulo, 'px-2 pb-1 font-black')}>Quién</th>
                  <th className={cn(C.rotulo, 'px-2 pb-1 font-black')}>Sector</th>
                  <th className={cn(C.rotulo, 'px-2 pb-1 font-black')}>WhatsApp</th>
                  <th className={cn(C.rotulo, 'px-2 pb-1 font-black')}>Chats</th>
                  <th className={cn(C.rotulo, 'px-2 pb-1 font-black')}>Push</th>
                </tr>
              </thead>
              <tbody>
                {data.destinatarios.map((m) => {
                  const sector = sectorDe(m);
                  const cargando = guardando === `u${m.userId}`;
                  return (
                    <tr key={m.userId} className="bg-[var(--c-surface-2)]">
                      <td className="rounded-l-xl px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--c-chip)] text-[11px] font-bold text-[var(--c-text)]">
                            {m.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-[var(--c-text)]">{m.name}</span>
                            <span className="block truncate text-[10px] text-[var(--c-muted)]">{m.email}</span>
                          </span>
                          {cargando && <Loader2 className="size-3.5 animate-spin text-[var(--c-muted)]" aria-hidden />}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={sector?.id ?? ''}
                          onChange={(e) => void guardar({ userId: m.userId, sector: e.target.value ? Number(e.target.value) : null }, `u${m.userId}`)}
                          className={cn(C.control, 'min-w-36 py-1.5 text-[13px]')}
                        >
                          <option value="">Sin sector</option>
                          {data.sectores.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            defaultValue={m.phone ?? ''}
                            onBlur={(e) => e.target.value !== (m.phone ?? '') && void guardar({ userId: m.userId, whatsappPhone: e.target.value.trim() || null, whatsappEnabled: Boolean(e.target.value.trim()) }, `u${m.userId}`)}
                            placeholder="5491122334455"
                            inputMode="tel"
                            className={cn(C.control, 'w-40 py-1.5 text-[13px]')}
                          />
                          <input
                            type="checkbox"
                            checked={m.whatsappEnabled}
                            disabled={!m.phone}
                            onChange={(e) => void guardar({ userId: m.userId, whatsappEnabled: e.target.checked }, `u${m.userId}`)}
                            title={m.phone ? 'Avisarle por WhatsApp' : 'Primero cargá el teléfono'}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={m.chatAlerts}
                          onChange={(e) => void guardar({ userId: m.userId, chatAlerts: e.target.value as AlcanceChat }, `u${m.userId}`)}
                          className={cn(C.control, 'min-w-32 py-1.5 text-[13px]')}
                        >
                          {ALCANCES_CHAT.map((a) => (
                            <option key={a} value={a}>{ALCANCE_LABELS[a]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="rounded-r-xl px-2 py-2">
                        <span className={cn('text-[11px] font-semibold', m.dispositivos ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--c-muted)]')}>
                          {m.dispositivos ? `${m.dispositivos} disp.` : 'sin activar'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--c-muted)]">
            El push se activa desde el dispositivo de cada uno: entrá con tu usuario y tocá &laquo;Activar en este dispositivo&raquo;, o aceptá el cartel que aparece al abrir WhatsPro.
          </p>
        </Tarjeta>
      )}

      <Tarjeta icono={Bell} titulo="Por tipo de aviso" bajada="Si no elegís nada, cada aviso usa los canales de arriba.">
        <ul className="space-y-1.5">
          {KINDS.map((k) => {
            const elegidos = prefs.kinds[k] ?? [];
            return (
              <li key={k} className="flex flex-wrap items-center gap-1.5 rounded-xl px-1 py-1 hover:bg-[var(--c-hover)]">
                <span className="min-w-52 flex-1 text-[13px] text-[var(--c-text)]">{KIND_LABELS[k]}</span>
                {CANALES.map((c) => {
                  const activo = elegidos.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        const next = activo ? elegidos.filter((x) => x !== c) : [...elegidos, c];
                        const kinds = { ...prefs.kinds };
                        if (next.length) kinds[k] = next;
                        else delete kinds[k];
                        void guardar({ kinds });
                      }}
                      className={cn(C.chip, 'px-2.5 py-1 text-[11px]', activo ? C.chipActive : C.chipIdle)}
                    >
                      {activo && <Check className="size-3" aria-hidden />}
                      {CANAL_LABELS[c]}
                    </button>
                  );
                })}
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <Tarjeta icono={Send} titulo="Probar" bajada="Se lo mandás a vos mismo por los canales que elijas. Tené el celular a mano.">
        <div className="flex flex-wrap items-center gap-2">
          {CANALES.map((c) => (
            <button key={c} type="button" onClick={() => setPrueba((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} className={cn(C.chip, prueba.includes(c) ? C.chipActive : C.chipIdle)}>
              {CANAL_LABELS[c]}
            </button>
          ))}
          <button type="button" onClick={() => void enviarPrueba()} disabled={enviando || !prueba.length} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cal-accent)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
            {enviando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
            Enviarme una prueba
          </button>
        </div>
      </Tarjeta>
    </div>
  );
}
