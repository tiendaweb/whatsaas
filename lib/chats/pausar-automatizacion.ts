import 'server-only';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { automationSessions, chats } from '@/lib/db/schema';
import { createSystemMessage } from '@/lib/db/system-messages';
import { pusherServer } from '@/lib/pusher-server';

/**
 * Apagar las automatizaciones del chat al que le entra un programado.
 *
 * Un mensaje programado y un flujo automático se pisan. El caso concreto: se
 * deja programado un recordatorio para el martes, y para el martes el chat
 * tiene un flujo corriendo (`automation_sessions` en `active`) o simplemente
 * habilitado. El programado sale igual —el cron le pega derecho a Evolution—
 * pero **la respuesta del cliente se la come el flujo**: en vez de contestarle
 * a lo que se le programó, el motor la toma como el paso siguiente de su
 * guion, o arranca un flujo nuevo con ese mensaje como disparador. Desde
 * afuera se ve como que el programado "no se ejecutó bien".
 *
 * Por eso, programar algo para un chat lo saca de los flujos: se completan las
 * sesiones activas y se marca `automationDisabled`, que es la misma marca que
 * deja cortar un chat a mano (`closeChat`). No se toca el **agente IA**, que es
 * otra cosa y tiene su propio interruptor (`setChatAiStatus`).
 *
 * Se hace en los dos momentos, y no es redundante: **al programar**, para que
 * desde ya ningún flujo se meta, y **al salir** (en el cron), porque entre una
 * cosa y la otra pueden pasar días y alguien puede haber vuelto a habilitar los
 * flujos en el medio.
 *
 * No se vuelve a encender solo cuando el programado sale: no hay forma de saber
 * si quien lo apagó fue esto o una persona cortando el chat. Se reactiva como
 * siempre, disparando un flujo a mano (`triggerAutomationManually` lo resetea).
 */

export type ChatPausado = {
  chatId: number;
  /** Sesiones de flujo que estaban corriendo y se cerraron. */
  sesionesCerradas: number;
  /** false = ya estaba apagado, no se tocó nada. */
  seApago: boolean;
};

export type ResultadoPausa = {
  chats: ChatPausado[];
  /** Chats en los que efectivamente hubo algo que apagar. */
  total: number;
  /** El silencio nunca frena la creación del programado: si falla, viene acá. */
  error?: string;
};

const VACIO: ResultadoPausa = { chats: [], total: 0 };

/**
 * Los jid con los que puede estar guardado un destinatario.
 *
 * `targetNumbers` casi siempre trae el teléfono pelado, que es lo que el cron
 * convierte a `<dígitos>@s.whatsapp.net`. Pero por las distintas puertas de
 * entrada (conector, cola, importaciones) puede venir ya como jid, incluso de
 * grupo, así que se prueban las dos formas en vez de normalizar a una sola y
 * errarle al chat.
 */
function jidsPosibles(numero: string): string[] {
  const crudo = (numero ?? '').trim();
  if (!crudo) return [];
  const digitos = crudo.replace(/\D/g, '');
  const salida = new Set<string>();
  if (crudo.includes('@')) salida.add(crudo);
  if (digitos) salida.add(`${digitos}@s.whatsapp.net`);
  return [...salida];
}

/**
 * Saca un chat de los flujos automáticos, por un programado que le va a entrar.
 *
 * Devuelve `seApago: false` si ya estaba apagado y no había sesión corriendo:
 * en ese caso no escribe nada, para no llenar la conversación de mensajes de
 * sistema repetidos cada vez que se programa algo.
 */
export async function pausarAutomatizacionDelChat(
  teamId: number,
  chatId: number,
  nombrePrograma: string,
): Promise<ChatPausado> {
  const cerradas = await db
    .update(automationSessions)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(and(eq(automationSessions.chatId, chatId), eq(automationSessions.status, 'active')))
    .returning({ id: automationSessions.id });

  // `automation_disabled` es nullable y las filas viejas lo tienen en NULL, que
  // significa lo mismo que `false`: `= false` a secas se las saltearía.
  const apagado = await db
    .update(chats)
    .set({ automationDisabled: true })
    .where(
      and(
        eq(chats.id, chatId),
        eq(chats.teamId, teamId),
        or(eq(chats.automationDisabled, false), isNull(chats.automationDisabled)),
      ),
    )
    .returning({ id: chats.id });

  const seApago = cerradas.length > 0 || apagado.length > 0;
  if (seApago) {
    await createSystemMessage(teamId, chatId, `@@syslog_automation_paused_scheduled|name=${nombrePrograma.slice(0, 120)}`);
    // La bandeja pinta el estado del chat con esto; sin el aviso, el operador
    // ve el flujo "activo" hasta que recarga.
    await pusherServer
      .trigger(`team-${teamId}`, 'chat-status-update', { chatId, type: 'automation', status: 'completed' })
      .catch((error) => console.error('[pausar-automatizacion] Pusher:', error));
  }

  return { chatId, sesionesCerradas: cerradas.length, seApago };
}

/**
 * Lo mismo, para todos los destinatarios de un programado recién creado.
 *
 * Sólo aplica a los programados que van a salir (`status: 'active'`) y que
 * mandan un mensaje: uno cuyo `actionType` es `automation` existe justamente
 * para disparar un flujo, así que apagarle los flujos al chat no tendría
 * sentido. Los destinatarios que todavía no tienen chat no se tocan: sin chat
 * no hay flujo corriendo, y el cron lo crea recién al enviar.
 *
 * Nunca tira: que falle el silencio no puede impedir que se guarde el
 * programado, así que el motivo vuelve en `error` y queda en los logs.
 */
export async function pausarAutomatizacionesDelProgramado(
  teamId: number,
  programado: {
    id?: number;
    name: string;
    status?: string | null;
    actionType?: string | null;
    instanceId: number | null;
    targetNumbers: unknown;
  },
): Promise<ResultadoPausa> {
  try {
    if ((programado.status ?? 'active') !== 'active') return VACIO;
    if ((programado.actionType ?? 'message') !== 'message') return VACIO;
    if (!programado.instanceId) return VACIO;

    const numeros = Array.isArray(programado.targetNumbers) ? (programado.targetNumbers as unknown[]) : [];
    const jids = [...new Set(numeros.flatMap((n) => jidsPosibles(String(n ?? ''))))];
    if (!jids.length) return VACIO;

    const encontrados = await db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.teamId, teamId), eq(chats.instanceId, programado.instanceId), inArray(chats.remoteJid, jids)));
    if (!encontrados.length) return VACIO;

    const resultados: ChatPausado[] = [];
    for (const chat of encontrados) {
      resultados.push(await pausarAutomatizacionDelChat(teamId, chat.id, programado.name));
    }
    return { chats: resultados, total: resultados.filter((r) => r.seApago).length };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    console.error(`[pausar-automatizacion] programado ${programado.id ?? '?'} del equipo ${teamId}:`, error);
    return { ...VACIO, error: motivo };
  }
}
