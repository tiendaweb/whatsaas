/**
 * Chats que no son conversaciones con clientes.
 *
 * Internos del equipo, personales, pruebas: gastan cuota de IA, ensucian el
 * embudo comercial y llenan las bandejas. Al 2026-08-31, cinco chats internos
 * eran el 45% de la cola de audios, AAPP.SPACE figuraba en G9 (lista Dinero) y
 * Martin Dev encabezaba el radar de respuestas con 74 señales.
 *
 * La lista vive en el entorno y no en la base porque es una decisión de
 * operación, no un dato del negocio: se cambia sin migración y sin deploy de
 * esquema. Un solo módulo para que la cola de audios, el radar y el
 * clasificador comercial coincidan en qué ignoran; antes cada uno tenía su
 * copia y sólo el de audios miraba la config.
 */
import { sql, type SQL } from 'drizzle-orm';
import { chats } from '@/lib/db/schema';

function lista(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/** JIDs completos. Es el criterio preciso: no se lo lleva puesto un homónimo. */
export function jidsInternos(): string[] {
  return lista(process.env.CHATS_INTERNOS_JIDS ?? process.env.AUDIO_INSIGHTS_EXCLUDED_JIDS);
}

/**
 * Pedazos de nombre ("casa", "familia", el nombre de un compañero). Menos
 * preciso que el JID y por eso es el segundo criterio, no el primero.
 */
export function nombresInternos(): string[] {
  return lista(process.env.CHATS_INTERNOS_NOMBRES ?? process.env.AUDIO_INSIGHTS_EXCLUDED_NAMES);
}

/**
 * Condiciones SQL para dejar afuera esos chats. Se agregan a un `and(...)`.
 * Devuelve `[]` si no hay nada configurado, así el llamador no cambia.
 */
export function condicionesDeChatInterno(): SQL[] {
  const condiciones: SQL[] = [];

  const jids = jidsInternos();
  if (jids.length) condiciones.push(sql`lower(${chats.remoteJid}) not in ${jids}`);

  for (const nombre of nombresInternos()) {
    // El nombre puede estar en el chat o en el contacto guardado: se miran los
    // dos, porque renombrar el contacto no debería volver a encenderlo.
    const patron = `%${nombre}%`;
    condiciones.push(sql`coalesce(lower(${chats.name}), '') not like ${patron}`);
    condiciones.push(sql`coalesce(lower(${chats.pushName}), '') not like ${patron}`);
  }

  return condiciones;
}

/**
 * Chats que el equipo marcó a mano desde la vista Limpieza
 * (`team_chat_exclusions`: personal / equipo / otros).
 *
 * Es el criterio que faltaba: el `.env` sólo lo toca quien puede desplegar, así
 * que en la práctica la lista nunca crecía. Esto se marca con dos clics y vale
 * para todos los consumidores a la vez.
 *
 * No filtra por equipo a propósito: `chats.id` es único global y una fila de
 * exclusión cuelga de ese chat, así que mirar sólo `chat_id` no puede cruzar
 * datos entre equipos y deja usar la condición donde no hay `teamId` a mano
 * (la depuración de la cola de audios corre para todos los equipos juntos).
 *
 * `chatIdColumn` existe porque el clasificador arma su consulta con SQL crudo y
 * alias (`c.id`), no con la tabla de drizzle.
 */
export function condicionDeChatMarcado(chatIdColumn: SQL = sql`${chats.id}`): SQL {
  return sql`not exists (select 1 from team_chat_exclusions e where e.chat_id = ${chatIdColumn})`;
}

/**
 * Todo lo que hay que ignorar: la lista del entorno más lo marcado a mano.
 * Un solo llamado para que el radar, el clasificador y la cola de audios no se
 * desincronicen nunca.
 */
export function condicionesDeChatIgnorado(): SQL[] {
  return [...condicionesDeChatInterno(), condicionDeChatMarcado()];
}
