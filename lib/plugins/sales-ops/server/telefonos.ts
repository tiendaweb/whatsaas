import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, teamCommercialAnalysis } from '@/lib/db/schema';
import type { Gate } from '../shared/taxonomy';

export type ChatDeTelefono = {
  chatId: number;
  name: string;
  phone: string;
  /** Etapa del análisis comercial, si el chat ya fue auditado. */
  gate: Gate | null;
  /** Foto de WhatsApp, para que la fila se reconozca por la cara y no por el texto. */
  avatarUrl: string | null;
};

/**
 * De un teléfono suelto al chat del equipo.
 *
 * Los mensajes programados guardan números pelados (`targetNumbers`), no
 * `chatId`, así que desde esa lista no había forma de abrir la ficha del
 * contacto: el botón sólo podía mandar a la app de Programados, que es donde ya
 * estabas.
 *
 * El cruce es por los **últimos 8 dígitos** y no por igualdad exacta: el mismo
 * teléfono aparece escrito de tres formas distintas según quién lo cargó
 * (`5493444…`, `543444…`, `3444…`), y comparando enteros no coincidía casi
 * ninguno. Ocho dígitos es el largo del abonado en Argentina y Paraguay, así
 * que distingue bien dentro de un equipo sin depender del prefijo.
 */
export async function chatsPorTelefono(teamId: number, numeros: string[]): Promise<Record<string, ChatDeTelefono>> {
  const claves = Array.from(
    new Set(
      numeros
        .map((n) => (n ?? '').replace(/\D/g, ''))
        .filter((n) => n.length >= 8)
        .map((n) => n.slice(-8)),
    ),
  );
  if (!claves.length) return {};

  const digitosDelChat = sql<string>`right(regexp_replace(split_part(${chats.remoteJid}, '@', 1), '[^0-9]', '', 'g'), 8)`;

  const filas = await db
    .select({
      chatId: chats.id,
      clave: digitosDelChat,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
      pushName: chats.pushName,
      contactName: contacts.name,
      avatarUrl: chats.profilePicUrl,
      gate: teamCommercialAnalysis.currentGate,
    })
    .from(chats)
    .leftJoin(contacts, and(eq(contacts.chatId, chats.id), eq(contacts.teamId, teamId)))
    .leftJoin(
      teamCommercialAnalysis,
      and(eq(teamCommercialAnalysis.chatId, chats.id), eq(teamCommercialAnalysis.teamId, teamId)),
    )
    .where(and(eq(chats.teamId, teamId), inArray(digitosDelChat, claves)));

  const mapa: Record<string, ChatDeTelefono> = {};
  for (const fila of filas) {
    // Si dos chats terminan igual gana el primero: son teléfonos distintos con
    // el mismo abonado y no hay forma de desempatar sin el prefijo completo.
    if (mapa[fila.clave]) continue;
    mapa[fila.clave] = {
      chatId: fila.chatId,
      name: fila.contactName || fila.chatName || fila.pushName || fila.remoteJid,
      phone: fila.remoteJid.split('@')[0],
      gate: (fila.gate as Gate | null) ?? null,
      avatarUrl: fila.avatarUrl ?? null,
    };
  }
  return mapa;
}
