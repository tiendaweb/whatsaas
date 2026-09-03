import 'server-only';
import { and, asc, eq, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import webpush from 'web-push';
import { db } from '@/lib/db/drizzle';
import { chats, departmentMembers, departments, pushSubscriptions, teamMembers, teamNotificationPrefs, teamNotifications, users } from '@/lib/db/schema';
import { sendTeamTextMessage } from '@/lib/messaging/send';
import { pusherServer } from '@/lib/pusher-server';
import { KINDS_FUERA_DE_BANDEJA, leTocaElChat, type AlcanceChat, type AsignacionChat, type Canal, type MiembroAvisos, type NotificationKind, type PrefsNotificacion, type Sector } from './tipos';

/**
 * El sistema de avisos del equipo.
 *
 * Una notificación es una fila en `team_notifications` con los canales por los
 * que tiene que salir. `notify()` la guarda (y la manda al toque si no está
 * programada); el cron toma las pendientes que ya vencieron. Por qué así y no
 * mandando directo:
 *
 *  - Un aviso programado (recordatorio de una reunión) y uno inmediato son la
 *    misma cosa con distinta fecha; con una sola cola no hay dos caminos.
 *  - `dedupeKey` evita el clásico "me llegaron seis veces": el cron puede
 *    correr de nuevo sin duplicar.
 *  - Si un canal falla (sin cuota de WhatsApp, push vencido) el resto igual
 *    sale, y queda registrado qué pasó.
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:soporte@whatspro.uno';
let vapidListo = false;
function prepararVapid(): boolean {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  if (!vapidListo) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidListo = true;
  }
  return true;
}

export const PREFS_DEFAULT: PrefsNotificacion = {
  whatsappPhone: null,
  whatsappEnabled: false,
  pushEnabled: true,
  inappEnabled: true,
  chatAlerts: 'sector',
  quietFrom: null,
  quietTo: null,
  kinds: {},
  groupJid: null,
};

export async function getPrefs(teamId: number, userId: number): Promise<PrefsNotificacion> {
  const row = await db.query.teamNotificationPrefs.findFirst({ where: and(eq(teamNotificationPrefs.teamId, teamId), eq(teamNotificationPrefs.userId, userId)) });
  if (!row) return PREFS_DEFAULT;
  return {
    whatsappPhone: row.whatsappPhone,
    whatsappEnabled: row.whatsappEnabled,
    pushEnabled: row.pushEnabled,
    inappEnabled: row.inappEnabled,
    chatAlerts: (row.chatAlerts as AlcanceChat) ?? 'sector',
    quietFrom: row.quietFrom,
    quietTo: row.quietTo,
    kinds: row.kinds ?? {},
    groupJid: row.groupJid,
  };
}

export async function setPrefs(teamId: number, userId: number, patch: Partial<PrefsNotificacion>): Promise<PrefsNotificacion> {
  const actual = await getPrefs(teamId, userId);
  const next = { ...actual, ...patch };
  await db
    .insert(teamNotificationPrefs)
    .values({ teamId, userId, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [teamNotificationPrefs.teamId, teamNotificationPrefs.userId], set: { ...next, updatedAt: new Date() } });
  return next;
}

/** ¿Está en horario de silencio? Sólo frena WhatsApp y push; la app siempre lo muestra. */
function enSilencio(prefs: PrefsNotificacion, ahora = new Date()): boolean {
  if (prefs.quietFrom == null || prefs.quietTo == null) return false;
  const h = ahora.getHours();
  return prefs.quietFrom <= prefs.quietTo ? h >= prefs.quietFrom && h < prefs.quietTo : h >= prefs.quietFrom || h < prefs.quietTo;
}

/** Los canales que corresponden para esta persona y este tipo de aviso. */
function canalesPara(prefs: PrefsNotificacion, kind: string, pedidos: Canal[], ahora = new Date()): Canal[] {
  const porTipo = prefs.kinds[kind];
  const base = porTipo?.length ? (porTipo as Canal[]) : pedidos;
  const silencio = enSilencio(prefs, ahora);
  return base.filter((c) => {
    if (c === 'inapp') return prefs.inappEnabled;
    if (c === 'push') return prefs.pushEnabled && !silencio;
    if (c === 'whatsapp') return prefs.whatsappEnabled && Boolean(prefs.whatsappPhone) && !silencio;
    if (c === 'group') return !silencio;
    return false;
  });
}

export type NotifyInput = {
  teamId: number;
  /** Destinatario. `null` = el sector indicado, o todo el equipo si no hay sector. */
  userId?: number | null;
  /** Sector destino (departamento) cuando no hay `userId`: sólo le llega a quien trabaja ahí. */
  departmentId?: number | null;
  kind: NotificationKind | string;
  title: string;
  body: string;
  url?: string | null;
  channels?: Canal[];
  scheduledFor?: Date | null;
  entityType?: string | null;
  entityId?: number | null;
  /** Grupo de WhatsApp destino cuando el canal es `group`. */
  groupJid?: string | null;
  source?: 'system' | 'ui' | 'connector' | 'cron';
  createdBy?: number | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * A quiénes va un aviso sin destinatario: al sector indicado, o a todo el equipo.
 *
 * Un aviso de sector sin nadie adentro no se manda a todos a propósito: si el
 * sector está vacío es que todavía no le pusieron gente, y llenarle la campana
 * al resto es justo lo que hace que dejen de mirarla.
 */
async function miembros(teamId: number, departmentId?: number | null): Promise<number[]> {
  if (departmentId) {
    const rows = await db
      .select({ userId: departmentMembers.userId })
      .from(departmentMembers)
      .innerJoin(departments, eq(departments.id, departmentMembers.departmentId))
      .innerJoin(teamMembers, and(eq(teamMembers.userId, departmentMembers.userId), eq(teamMembers.teamId, teamId)))
      .where(and(eq(departmentMembers.departmentId, departmentId), eq(departments.teamId, teamId)));
    return [...new Set(rows.map((r) => r.userId))];
  }
  const rows = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
  return rows.map((r) => r.userId);
}

/** Los sectores del equipo (departamentos), con cuánta gente tiene cada uno. */
export async function listarSectores(teamId: number): Promise<Sector[]> {
  const rows = await db
    .select({ id: departments.id, name: departments.name, miembros: sql<number>`count(${departmentMembers.userId})::int` })
    .from(departments)
    .leftJoin(departmentMembers, eq(departmentMembers.departmentId, departments.id))
    .where(eq(departments.teamId, teamId))
    .groupBy(departments.id, departments.name)
    .orderBy(asc(departments.name));
  return rows.map((r) => ({ id: r.id, name: r.name, miembros: Number(r.miembros ?? 0) }));
}

/** Los sectores de una persona. */
export async function sectoresDe(teamId: number, userId: number): Promise<number[]> {
  const rows = await db
    .select({ id: departments.id })
    .from(departmentMembers)
    .innerJoin(departments, eq(departments.id, departmentMembers.departmentId))
    .where(and(eq(departmentMembers.userId, userId), eq(departments.teamId, teamId)));
  return rows.map((r) => r.id);
}

/**
 * Mueve a alguien de sector. Uno solo por persona a propósito: el sector define
 * a quién le suena cada chat, y estar en dos es no estar en ninguno.
 */
export async function setSector(teamId: number, userId: number, departmentId: number | null): Promise<number[]> {
  const propios = await db.select({ id: departments.id }).from(departments).where(eq(departments.teamId, teamId));
  const ids = propios.map((d) => d.id);
  if (ids.length) await db.delete(departmentMembers).where(and(eq(departmentMembers.userId, userId), inArray(departmentMembers.departmentId, ids)));
  if (departmentId && ids.includes(departmentId)) {
    await db.insert(departmentMembers).values({ departmentId, userId }).onConflictDoNothing();
    return [departmentId];
  }
  return [];
}

/**
 * Deja el aviso en la cola. Si no es programado, lo despacha en el momento.
 * Devuelve los ids creados (uno por destinatario).
 */
export async function notify(input: NotifyInput): Promise<{ ids: number[]; enviados: number; sinDestinatarios?: boolean }> {
  // Con destinatario: esa persona. Sin destinatario: el área, o el equipo.
  const lista = input.userId ? [input.userId] : await miembros(input.teamId, input.departmentId);
  if (!lista.length) return { ids: [], enviados: 0, sinDestinatarios: true };
  const ids: number[] = [];
  for (const uid of lista) {
    const dedupe = input.dedupeKey ? `${input.dedupeKey}${uid ? `:u${uid}` : ''}`.slice(0, 160) : null;
    const [row] = await db
      .insert(teamNotifications)
      .values({
        teamId: input.teamId,
        userId: uid ?? null,
        type: input.kind,
        title: input.title.slice(0, 180),
        body: input.body.slice(0, 4000),
        url: input.url?.slice(0, 400) ?? null,
        channels: input.channels ?? ['inapp'],
        status: 'pending',
        scheduledFor: input.scheduledFor ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        groupJid: input.groupJid ?? null,
        source: input.source ?? 'system',
        createdBy: input.createdBy ?? null,
        dedupeKey: dedupe,
        departmentId: input.departmentId ?? null,
        metadata: input.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: teamNotifications.id });
    if (row) ids.push(row.id);
  }
  let enviados = 0;
  if (!input.scheduledFor && ids.length) enviados = await despachar(ids);
  return { ids, enviados };
}

async function enviarPush(teamId: number, userId: number, payload: { title: string; body: string; url?: string | null; tag?: string }): Promise<boolean> {
  if (!prepararVapid()) return false;
  const subs = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.teamId, teamId), eq(pushSubscriptions.userId, userId)));
  if (!subs.length) return false;
  let alguno = false;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/apps', tag: payload.tag }),
      );
      alguno = true;
      await db.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(eq(pushSubscriptions.id, s.id));
    } catch (error) {
      // 404/410 = el navegador borró la suscripción: se limpia sola.
      const code = (error as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else console.error('[notificaciones] push', code, error);
    }
  }
  return alguno;
}

async function enviarWhatsApp(teamId: number, destino: string, texto: string, idempotencyKey: string): Promise<boolean> {
  const digitos = destino.replace(/\D/g, '');
  const jid = destino.endsWith('@g.us') ? destino : `${digitos}@s.whatsapp.net`;
  if (!destino.endsWith('@g.us') && digitos.length < 8) return false;
  const r = await sendTeamTextMessage(teamId, { recipientJid: jid, text: texto, origin: 'automation', idempotencyKey });
  return r.ok;
}

/** Despacha una tanda de avisos ya vencidos. Devuelve cuántos salieron. */
export async function despachar(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const filas = await db.select().from(teamNotifications).where(inArray(teamNotifications.id, ids));
  let ok = 0;
  for (const n of filas) {
    if (n.status !== 'pending') continue;
    const canalesPedidos = (n.channels ?? ['inapp']) as Canal[];
    const prefs = n.userId ? await getPrefs(n.teamId, n.userId) : PREFS_DEFAULT;
    const canales = n.userId ? canalesPara(prefs, n.type, canalesPedidos) : canalesPedidos;
    const texto = `*${n.title}*\n${n.body}`.slice(0, 3000);
    const resultados: Record<string, boolean> = {};

    if (canales.includes('inapp')) {
      resultados.inapp = true;
      try {
        await pusherServer.trigger(`team-${n.teamId}`, 'notification', { id: n.id, userId: n.userId, title: n.title, body: n.body, url: n.url, type: n.type });
      } catch (error) {
        console.error('[notificaciones] pusher', error);
      }
    }
    if (canales.includes('push') && n.userId) {
      // Con `tag`, tres mensajes del mismo chat son un aviso que se actualiza y
      // no tres carteles apilados en la pantalla de bloqueo.
      const tag = n.entityType && n.entityId ? `${n.entityType}-${n.entityId}` : undefined;
      resultados.push = await enviarPush(n.teamId, n.userId, { title: n.title, body: n.body, url: n.url, tag });
    }
    if (canales.includes('whatsapp') && prefs.whatsappPhone) resultados.whatsapp = await enviarWhatsApp(n.teamId, prefs.whatsappPhone, texto, `notif:${n.id}:wa`);
    const grupo = n.groupJid ?? prefs.groupJid;
    if (canales.includes('group') && grupo) resultados.group = await enviarWhatsApp(n.teamId, grupo, texto, `notif:${n.id}:grp`);

    const salio = Object.values(resultados).some(Boolean);
    await db
      .update(teamNotifications)
      .set({ status: salio ? 'sent' : 'failed', sentAt: new Date(), metadata: { ...(n.metadata ?? {}), canales: resultados } })
      .where(eq(teamNotifications.id, n.id));
    if (salio) ok += 1;
  }
  return ok;
}

/** Las que ya tienen que salir (programadas vencidas o sin fecha). */
export async function despacharPendientes(limit = 100): Promise<{ tomadas: number; enviadas: number }> {
  const filas = await db
    .select({ id: teamNotifications.id })
    .from(teamNotifications)
    .where(and(eq(teamNotifications.status, 'pending'), or(isNull(teamNotifications.scheduledFor), lte(teamNotifications.scheduledFor, new Date()))))
    .orderBy(asc(teamNotifications.scheduledFor), asc(teamNotifications.id))
    .limit(limit);
  const enviadas = await despachar(filas.map((f) => f.id));
  return { tomadas: filas.length, enviadas };
}

/**
 * La bandeja de una persona: lo suyo y lo del equipo. Los avisos de chat quedan
 * afuera: son un río y taparían todo lo demás, que es lo que hay que leer.
 */
export async function listarBandeja(teamId: number, userId: number, opts: { soloNoLeidas?: boolean; limit?: number } = {}) {
  const conds = [
    eq(teamNotifications.teamId, teamId),
    or(eq(teamNotifications.userId, userId), isNull(teamNotifications.userId))!,
    sql`${teamNotifications.status} <> 'pending' or ${teamNotifications.scheduledFor} is null`,
    notInArray(teamNotifications.type, [...KINDS_FUERA_DE_BANDEJA]),
  ];
  if (opts.soloNoLeidas) conds.push(isNull(teamNotifications.readAt));
  const rows = await db
    .select()
    .from(teamNotifications)
    .where(and(...conds))
    .orderBy(sql`${teamNotifications.createdAt} desc`)
    .limit(Math.min(opts.limit ?? 30, 100));
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    status: n.status,
    channels: (n.channels ?? []) as string[],
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
    scheduledFor: n.scheduledFor ? n.scheduledFor.toISOString() : null,
    sentAt: n.sentAt ? n.sentAt.toISOString() : null,
    source: n.source,
  }));
}

export async function marcarLeidas(teamId: number, userId: number, ids?: number[]) {
  const conds = [
    eq(teamNotifications.teamId, teamId),
    or(eq(teamNotifications.userId, userId), isNull(teamNotifications.userId))!,
    isNull(teamNotifications.readAt),
    notInArray(teamNotifications.type, [...KINDS_FUERA_DE_BANDEJA]),
  ];
  if (ids?.length) conds.push(inArray(teamNotifications.id, ids));
  const rows = await db.update(teamNotifications).set({ readAt: new Date() }).where(and(...conds)).returning({ id: teamNotifications.id });
  return rows.length;
}

/** Grupos de WhatsApp del equipo, para elegir a dónde mandar los avisos generales. */
export async function listarGrupos(teamId: number) {
  const rows = await db
    .select({ jid: chats.remoteJid, name: chats.name })
    .from(chats)
    .where(and(eq(chats.teamId, teamId), sql`${chats.remoteJid} like '%@g.us'`))
    .orderBy(asc(chats.name))
    .limit(100);
  return rows.map((r) => ({ jid: r.jid, name: r.name || r.jid.split('@')[0] }));
}

/**
 * El equipo como se ve desde la pantalla de Avisos: quién tiene teléfono
 * cargado, en qué sector está y cuántos dispositivos suyos reciben push.
 */
export async function listarDestinatarios(teamId: number): Promise<MiembroAvisos[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: teamNotificationPrefs.whatsappPhone,
      whatsappEnabled: teamNotificationPrefs.whatsappEnabled,
      pushEnabled: teamNotificationPrefs.pushEnabled,
      chatAlerts: teamNotificationPrefs.chatAlerts,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .leftJoin(teamNotificationPrefs, and(eq(teamNotificationPrefs.teamId, teamId), eq(teamNotificationPrefs.userId, users.id)))
    .where(eq(teamMembers.teamId, teamId));

  const ids = rows.map((r) => r.userId);
  if (!ids.length) return [];
  const [sectores, dispositivos] = await Promise.all([
    db
      .select({ userId: departmentMembers.userId, departmentId: departments.id })
      .from(departmentMembers)
      .innerJoin(departments, eq(departments.id, departmentMembers.departmentId))
      .where(and(eq(departments.teamId, teamId), inArray(departmentMembers.userId, ids))),
    db
      .select({ userId: pushSubscriptions.userId, total: sql<number>`count(*)::int` })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.teamId, teamId), inArray(pushSubscriptions.userId, ids)))
      .groupBy(pushSubscriptions.userId),
  ]);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name?.trim() || r.email.split('@')[0],
    email: r.email,
    phone: r.phone,
    whatsappEnabled: Boolean(r.whatsappEnabled),
    pushEnabled: r.pushEnabled ?? true,
    chatAlerts: (r.chatAlerts as AlcanceChat) ?? 'sector',
    sectores: sectores.filter((x) => x.userId === r.userId).map((x) => x.departmentId),
    dispositivos: Number(dispositivos.find((d) => d.userId === r.userId)?.total ?? 0),
  }));
}

/**
 * A quién le corresponde el aviso de un chat: cada uno según su alcance y su
 * sector. Es la misma regla que aplica el navegador (`leTocaElChat`), acá para
 * decidir a quién sale el push cuando nadie tiene la app abierta.
 */
export async function receptoresDeChat(teamId: number, chat: AsignacionChat): Promise<MiembroAvisos[]> {
  const equipo = await listarDestinatarios(teamId);
  return equipo.filter((m) => leTocaElChat({ userId: m.userId, sectores: m.sectores, alcance: m.chatAlerts }, chat));
}
