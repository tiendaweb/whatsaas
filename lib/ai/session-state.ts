export type AISessionStatus = 'active' | 'paused' | string;

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

export function getEffectiveAIState(
  teamEnabled: boolean,
  sessionStatus: AISessionStatus | null | undefined
): EffectiveAIState {
  const conversationStatus = sessionStatus ?? null;
  const hasSession = conversationStatus !== null;
  const hasExplicitConversationOverride = isExplicitConversationOverride(conversationStatus);
  const effectiveStatus = hasExplicitConversationOverride
    ? conversationStatus
    : teamEnabled
      ? 'active'
      : 'paused';

  return {
    conversationStatus,
    effectiveStatus,
    hasSession,
    inheritsTeamStatus: !hasExplicitConversationOverride,
    isActive: effectiveStatus === 'active',
    teamEnabled,
  };
}

export function shouldPersistAISession(
  requestedStatus: AISessionStatus,
  hasExistingSession: boolean
) {
  if (hasExistingSession) {
    return true;
  }

  return requestedStatus !== 'paused';
}

export function shouldBlockAIProcessing(
  teamEnabledOrSessionStatus: boolean | AISessionStatus | null | undefined,
  sessionStatus?: AISessionStatus | null | undefined
) {
  if (typeof teamEnabledOrSessionStatus === 'boolean') {
    return getEffectiveAIState(teamEnabledOrSessionStatus, sessionStatus).effectiveStatus === 'paused';
  }

  return teamEnabledOrSessionStatus === 'paused';
}
