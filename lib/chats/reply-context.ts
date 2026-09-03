/**
 * Contexto para redactar una respuesta a un chat.
 *
 * Vivía duplicado en `improve-reply` y en `radar-suggest` (el segundo lo admite
 * en un comentario). El Centro de Comandos habría sido la tercera copia, así que
 * las piezas puras viven acá.
 */

export function buildSavedContext(params: {
  teamPrompt?: string | null;
  contactName?: string | null;
  contactNotes?: string | null;
  chatName?: string | null;
  remoteJid?: string | null;
}) {
  const sections = [
    params.teamPrompt?.trim() ? `Team prompt:\n${params.teamPrompt.trim()}` : null,
    params.contactName?.trim() ? `Contact name:\n${params.contactName.trim()}` : null,
    params.chatName?.trim() ? `Chat label:\n${params.chatName.trim()}` : null,
    params.remoteJid?.trim() ? `WhatsApp ID:\n${params.remoteJid.trim()}` : null,
    params.contactNotes?.trim() ? `Saved notes:\n${params.contactNotes.trim()}` : null,
  ].filter(Boolean);

  return sections.join('\n\n');
}

export function buildConversationExcerpt(
  recentMessages: Array<{
    fromMe: boolean;
    text: string | null;
    mediaCaption: string | null;
    messageType: string | null;
  }>,
) {
  return recentMessages
    .map((message) => {
      const speaker = message.fromMe ? 'Agent' : 'Customer';
      const content = message.text?.trim() || message.mediaCaption?.trim() || `[${message.messageType || 'message'}]`;
      return `${speaker}: ${content}`;
    })
    .join('\n');
}
