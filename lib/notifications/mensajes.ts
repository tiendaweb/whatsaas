import 'server-only';
import { and, desc, eq, gt, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, contacts } from '@/lib/db/schema';
import { notify, receptoresDeChat } from './service';

/**
 * El aviso de "te escribió un cliente", sectorizado.
 *
 * No sale del webhook sino del cron, y a propósito:
 *
 *  - El webhook está en el camino caliente de cada mensaje; sumarle un push por
 *    persona lo vuelve más lento justo cuando entra una ráfaga.
 *  - Esperar un par de minutos filtra sola la mitad de los avisos: si alguien
 *    ya lo leyó, no hace falta molestar a nadie.
 *  - Una ráfaga de seis mensajes es un solo aviso, no seis.
 *
 * Quién lo recibe lo decide `receptoresDeChat`: el asignado, su sector, o todo
 * el mundo si el chat no es de nadie. Nunca "todos los que tengan la app".
 */

/** Cuánto espera antes de avisar: si lo leyeron en ese rato, no avisa. */
const ESPERA_MINUTOS = 2;
/** Más viejo que esto ya no es novedad (y evita avisar de lo de ayer si el cron estuvo caído). */
const VENTANA_MINUTOS = 30;
/** Un aviso por chat cada tanto, aunque sigan llegando mensajes. */
const BUCKET_MINUTOS = 10;

function recorte(texto: string | null, largo = 140): string {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio) return 'Mensaje nuevo.';
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
}

export async function avisarMensajesSinLeer(limite = 60): Promise<{ chats: number; avisos: number }> {
  const ahora = Date.now();
  const desde = new Date(ahora - VENTANA_MINUTOS * 60000);
  const hasta = new Date(ahora - ESPERA_MINUTOS * 60000);

  const filas = await db
    .select({
      chatId: chats.id,
      teamId: chats.teamId,
      remoteJid: chats.remoteJid,
      instanceId: chats.instanceId,
      nombreChat: chats.name,
      pushName: chats.pushName,
      texto: chats.lastMessageText,
      cuando: chats.lastMessageTimestamp,
      nombreContacto: contacts.name,
      assignedUserId: contacts.assignedUserId,
      assignedDepartmentId: contacts.assignedDepartmentId,
    })
    .from(chats)
    .leftJoin(contacts, eq(contacts.chatId, chats.id))
    .where(
      and(
        gt(chats.unreadCount, 0),
        eq(chats.lastMessageFromMe, false),
        gte(chats.lastMessageTimestamp, desde),
        lte(chats.lastMessageTimestamp, hasta),
      ),
    )
    .orderBy(desc(chats.lastMessageTimestamp))
    .limit(limite);

  let avisos = 0;
  // Caché por (equipo, asignación): en una ráfaga son siempre los mismos destinatarios.
  const cache = new Map<string, Awaited<ReturnType<typeof receptoresDeChat>>>();

  for (const f of filas) {
    const clave = `${f.teamId}:${f.assignedUserId ?? 0}:${f.assignedDepartmentId ?? 0}`;
    let receptores = cache.get(clave);
    if (!receptores) {
      receptores = await receptoresDeChat(f.teamId, { assignedUserId: f.assignedUserId ?? null, assignedDepartmentId: f.assignedDepartmentId ?? null });
      cache.set(clave, receptores);
    }
    // Sin dispositivo registrado no hay push que mandar: crear la fila sólo
    // dejaría un aviso "fallido" por cada mensaje que entra.
    const conPush = receptores.filter((r) => r.pushEnabled && r.dispositivos > 0);
    if (!conPush.length) continue;

    const nombre = f.nombreContacto?.trim() || f.nombreChat?.trim() || f.pushName?.trim() || f.remoteJid.split('@')[0];
    const bucket = Math.floor((f.cuando ? new Date(f.cuando).getTime() : ahora) / (BUCKET_MINUTOS * 60000));
    const ruta = f.remoteJid.endsWith('@g.us') ? f.remoteJid : f.remoteJid.split('@')[0];
    const url = `/dashboard/chat/${ruta}${f.instanceId ? `?instanceId=${f.instanceId}` : ''}`;

    for (const r of conPush) {
      const { ids } = await notify({
        teamId: f.teamId,
        userId: r.userId,
        kind: 'chat.incoming',
        title: nombre,
        body: recorte(f.texto),
        url,
        // Sólo push: el cartel y la lista de chats ya lo muestran adentro de la app.
        channels: ['push'],
        entityType: 'chat',
        entityId: f.chatId,
        source: 'cron',
        dedupeKey: `chat:${f.chatId}:${bucket}`,
      });
      avisos += ids.length;
    }
  }

  return { chats: filas.length, avisos };
}
