export type AISessionStatus = 'active' | 'paused' | string;

type EffectiveAIState = {
  conversationStatus: AISessionStatus | null;
  effectiveStatus: 'active' | 'paused';
  hasSession: boolean;
  inheritsTeamStatus: boolean;
  isActive: boolean;
  teamEnabled: boolean;
};

export function getEffectiveAIState(
  teamEnabled: boolean,
  sessionStatus: AISessionStatus | null | undefined
): EffectiveAIState {
  const conversationStatus = sessionStatus ?? null;
  const hasSession = conversationStatus !== null;
  const isPaused = conversationStatus === 'paused';
  const effectiveStatus = !teamEnabled || isPaused ? 'paused' : 'active';

  return {
    conversationStatus,
    effectiveStatus,
    hasSession,
    inheritsTeamStatus: !hasSession,
    isActive: teamEnabled && !isPaused,
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

export function shouldBlockAIProcessing(sessionStatus: AISessionStatus | null | undefined) {
  return sessionStatus === 'paused';
}
