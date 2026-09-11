export type AISessionStatus = 'active' | 'paused' | string;

/**
 * Quién manda sobre el agente IA en un chat.
 *
 * Hay dos interruptores: el del equipo (`ai_configs.is_active`) y el de cada
 * conversación. El de la conversación sólo existe si **alguien lo tocó**: una
 * persona desde el chat o un nodo de automatización. Mientras nadie lo toque,
 * el chat hereda lo que diga el equipo.
 *
 * Esa distinción no estaba y costó caro. El motor crea la sesión del chat con
 * `status = 'active'` la primera vez que responde —para guardar el historial—
 * y ese valor se leía después como "acá la IA está prendida a propósito", así
 * que ganaba sobre el interruptor del equipo. Apagar el bot no apagaba ningún
 * chat donde ya hubiera contestado: el 2026-09-10, doce horas después de que
 * Contratá Ya apagara su agente, le escribió solo a un contacto personal con el
 * guion de ventas. Entre dos equipos con el bot apagado había 230 chats en esa
 * condición.
 *
 * Por eso el override viaja aparte del `status`: `overrideStatus` es `null`
 * cuando nadie tocó nada, y sólo entonces el equipo decide.
 */
type EffectiveAIState = {
  conversationStatus: AISessionStatus | null;
  effectiveStatus: 'active' | 'paused';
  hasSession: boolean;
  inheritsTeamStatus: boolean;
  isActive: boolean;
  teamEnabled: boolean;
};

function isExplicitConversationOverride(
  sessionStatus: AISessionStatus | null
): sessionStatus is 'active' | 'paused' {
  return sessionStatus === 'active' || sessionStatus === 'paused';
}

/**
 * El estado real del agente en un chat.
 *
 * `overrideStatus` es el interruptor de la conversación y **sólo se pasa si es
 * un override de verdad** (`ai_sessions.is_override`). Pasar el `status` crudo
 * de la sesión es el error que hacía que el equipo no pudiera apagar nada.
 */
export function getEffectiveAIState(
  teamEnabled: boolean,
  overrideStatus: AISessionStatus | null | undefined
): EffectiveAIState {
  const conversationStatus = overrideStatus ?? null;
  const hasExplicitConversationOverride = isExplicitConversationOverride(conversationStatus);
  const effectiveStatus = hasExplicitConversationOverride
    ? conversationStatus
    : teamEnabled
      ? 'active'
      : 'paused';

  return {
    conversationStatus,
    effectiveStatus,
    // "Tiene estado propio" es tener override, no tener fila: toda conversación
    // que el agente tocó alguna vez tiene fila.
    hasSession: hasExplicitConversationOverride,
    inheritsTeamStatus: !hasExplicitConversationOverride,
    isActive: effectiveStatus === 'active',
    teamEnabled,
  };
}

/**
 * El override de un chat se guarda SIEMPRE que alguien toca el interruptor.
 *
 * Antes activar un chat sin sesión no persistía nada ("ya hereda del equipo"),
 * y con el equipo apagado eso quería decir que prender la IA en un chat no
 * hacía nada. Lo que una persona toca, manda y queda escrito.
 */
export function shouldPersistAISession(
  _requestedStatus: AISessionStatus,
  _hasExistingSession: boolean
) {
  return true;
}

/**
 * ¿Hay que frenar al agente en este chat?
 *
 * `overrideStatus` es el del override, no el `status` de la sesión. Con la
 * firma de un solo argumento se pregunta por un override ya resuelto.
 */
export function shouldBlockAIProcessing(
  teamEnabledOrOverrideStatus: boolean | AISessionStatus | null | undefined,
  overrideStatus?: AISessionStatus | null | undefined
) {
  if (typeof teamEnabledOrOverrideStatus === 'boolean') {
    return getEffectiveAIState(teamEnabledOrOverrideStatus, overrideStatus).effectiveStatus === 'paused';
  }

  return teamEnabledOrOverrideStatus === 'paused';
}

/** El override de una fila de `ai_sessions`, o `null` si el chat hereda del equipo. */
export function overrideDeSesion(
  session: { status?: AISessionStatus | null; isOverride?: boolean | null } | null | undefined
): AISessionStatus | null {
  if (!session?.isOverride) return null;
  return session.status ?? null;
}
