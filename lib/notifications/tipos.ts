/** Tipos del sistema de notificaciones, compartidos por servidor y navegador. */

export const CANALES = ['inapp', 'push', 'whatsapp', 'group'] as const;
export type Canal = (typeof CANALES)[number];

export const CANAL_LABELS: Record<Canal, string> = {
  inapp: 'En la app',
  push: 'Push del navegador',
  whatsapp: 'WhatsApp',
  group: 'Grupo de WhatsApp',
};

/**
 * Tipos de aviso. Sirven para que cada persona elija por qué canal quiere cada
 * cosa: el recordatorio de una reunión conviene por push, y "te asignaron una
 * tarea" quizá alcanza con verlo en la app.
 */
export const KINDS = [
  'chat.incoming',
  'calendar.reminder',
  'calendar.invite',
  'task.assigned',
  'task.due',
  'sales.signal',
  'queue.review',
  'system',
  'manual',
] as const;
export type NotificationKind = (typeof KINDS)[number];

export const KIND_LABELS: Record<NotificationKind, string> = {
  'chat.incoming': 'Mensaje de un cliente sin leer',
  'calendar.reminder': 'Recordatorio de agenda',
  'calendar.invite': 'Te sumaron a un evento',
  'task.assigned': 'Tarea asignada',
  'task.due': 'Tarea que vence',
  'sales.signal': 'Respuesta de un cliente',
  'queue.review': 'Algo espera tu aprobación',
  system: 'Avisos del sistema',
  manual: 'Mensajes del equipo',
};

/** Los avisos de chat son un río: no van a la campana, sólo al push y al cartel. */
export const KINDS_FUERA_DE_BANDEJA = ['chat.incoming'] as const;

/**
 * El sector es el Departamento del equipo: el mismo al que se asignan los
 * contactos y los chats. No hay un segundo concepto de área para los avisos,
 * porque dos listas de sectores en paralelo terminan siempre desincronizadas.
 */
export type Sector = { id: number; name: string; miembros: number };

/**
 * Hasta dónde quiere que le griten a cada uno cuando entra un mensaje.
 *
 * `sector` es el default y es la razón de todo esto: que un mensaje de un
 * cliente de Ventas no le suene al de Producción. Un chat sin asignar no es de
 * nadie, así que ése sí le llega a todos: es preferible a que se pierda.
 */
export const ALCANCES_CHAT = ['todos', 'sector', 'mios', 'ninguno'] as const;
export type AlcanceChat = (typeof ALCANCES_CHAT)[number];

export const ALCANCE_LABELS: Record<AlcanceChat, string> = {
  todos: 'Todos los chats',
  sector: 'Los de mi sector',
  mios: 'Sólo los míos',
  ninguno: 'Ninguno',
};

export const ALCANCE_AYUDA: Record<AlcanceChat, string> = {
  todos: 'Cada mensaje que entra, sea de quien sea.',
  sector: 'Los chats de mi sector, los que tengo asignados y los que no son de nadie.',
  mios: 'Sólo los chats asignados a mí.',
  ninguno: 'Nada: los veo cuando entro.',
};

/** A quién mira un chat para decidir si le corresponde el aviso. */
export type AsignacionChat = { assignedUserId: number | null; assignedDepartmentId: number | null };

/** Quién es el que recibe, para la misma decisión. */
export type Receptor = { userId: number; sectores: number[]; alcance: AlcanceChat };

/**
 * ¿Le toca este chat? Una sola función para el cartel del navegador y para el
 * push del servidor: si cada lado decidiera por su cuenta, la mitad de los
 * avisos llegaría por un camino y no por el otro.
 */
export function leTocaElChat(receptor: Receptor, chat: AsignacionChat): boolean {
  if (receptor.alcance === 'ninguno') return false;
  if (receptor.alcance === 'todos') return true;
  if (chat.assignedUserId === receptor.userId) return true;
  if (receptor.alcance === 'mios') return false;
  if (chat.assignedDepartmentId) return receptor.sectores.includes(chat.assignedDepartmentId);
  // Sin asignar: no es de nadie, que lo vea el que esté.
  return !chat.assignedUserId;
}

export type NotificacionRow = {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string | null;
  status: string;
  channels: string[];
  createdAt: string;
  readAt: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  source: string;
};

export type PrefsNotificacion = {
  whatsappPhone: string | null;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  inappEnabled: boolean;
  /** De qué chats quiere que le avisen. */
  chatAlerts: AlcanceChat;
  quietFrom: number | null;
  quietTo: number | null;
  kinds: Record<string, string[]>;
  groupJid: string | null;
};

/** Una persona del equipo, como se la ve desde la pantalla de Avisos. */
export type MiembroAvisos = {
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  chatAlerts: AlcanceChat;
  /** Departamentos a los que pertenece. */
  sectores: number[];
  /** Dispositivos con push activado. */
  dispositivos: number;
};
