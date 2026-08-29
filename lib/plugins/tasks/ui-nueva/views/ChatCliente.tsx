'use client';

import { ChatEmbebido } from '@/components/chat/ChatEmbebido';

/**
 * Conversación del cliente, embebida en la ficha de la tarea.
 *
 * La implementación vive en `components/chat/ChatEmbebido` (compartida con el
 * Command Center y Seguimiento). Acá sólo se fija `tokens="tareas"` para que
 * use las variables `--t-*` y la app no cambie de aspecto.
 */
export function ChatCliente(props: {
  remoteJid: string;
  instanceId?: number | null;
  nombre: string;
  teamId: number | null;
}) {
  return <ChatEmbebido {...props} tokens="tareas" />;
}
