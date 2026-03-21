import assert from 'node:assert/strict';
import {
  getEffectiveAIState,
  shouldBlockAIProcessing,
  shouldPersistAISession,
} from '../lib/ai/session-state';

type Scenario = {
  name: string;
  run: () => void;
};

const scenarios: Scenario[] = [
  {
    name: 'IA global apagada + activación manual del chat mantiene el chat activo',
    run: () => {
      assert.equal(shouldPersistAISession('active', false), true);

      const state = getEffectiveAIState(false, 'active');

      assert.equal(state.teamEnabled, false);
      assert.equal(state.hasSession, true);
      assert.equal(state.isActive, true);
      assert.equal(state.effectiveStatus, 'active');
      assert.equal(state.conversationStatus, 'active');
      assert.equal(state.inheritsTeamStatus, false);
      assert.equal(shouldBlockAIProcessing(false, state.conversationStatus), false);
    },
  },
  {
    name: 'IA global encendida + pausa manual del chat mantiene el chat pausado',
    run: () => {
      assert.equal(shouldPersistAISession('paused', true), true);

      const state = getEffectiveAIState(true, 'paused');

      assert.equal(state.teamEnabled, true);
      assert.equal(state.hasSession, true);
      assert.equal(state.isActive, false);
      assert.equal(state.effectiveStatus, 'paused');
      assert.equal(state.conversationStatus, 'paused');
      assert.equal(state.inheritsTeamStatus, false);
      assert.equal(shouldBlockAIProcessing(true, state.conversationStatus), true);
    },
  },
  {
    name: 'chat sin sesión hereda el estado global activo del equipo',
    run: () => {
      const state = getEffectiveAIState(true, null);

      assert.equal(state.teamEnabled, true);
      assert.equal(state.hasSession, false);
      assert.equal(state.isActive, true);
      assert.equal(state.effectiveStatus, 'active');
      assert.equal(state.conversationStatus, null);
      assert.equal(state.inheritsTeamStatus, true);
      assert.equal(shouldBlockAIProcessing(true, state.conversationStatus), false);
    },
  },
  {
    name: 'chat sin sesión hereda el estado global apagado del equipo',
    run: () => {
      const state = getEffectiveAIState(false, null);

      assert.equal(state.teamEnabled, false);
      assert.equal(state.hasSession, false);
      assert.equal(state.isActive, false);
      assert.equal(state.effectiveStatus, 'paused');
      assert.equal(state.conversationStatus, null);
      assert.equal(state.inheritsTeamStatus, true);
      assert.equal(shouldBlockAIProcessing(false, state.conversationStatus), true);
    },
  },
  {
    name: 'reactivación manual desde sesión pausada vuelve a estado activo',
    run: () => {
      assert.equal(shouldPersistAISession('active', true), true);

      const state = getEffectiveAIState(true, 'active');

      assert.equal(state.isActive, true);
      assert.equal(state.effectiveStatus, 'active');
      assert.equal(state.conversationStatus, 'active');
      assert.equal(state.inheritsTeamStatus, false);
      assert.equal(shouldBlockAIProcessing(true, state.conversationStatus), false);
    },
  },
  {
    name: 'regresión: ni POST ni ai_control deben crear sesión paused en chat nuevo',
    run: () => {
      assert.equal(shouldPersistAISession('paused', false), false);

      const state = getEffectiveAIState(true, null);

      assert.equal(state.isActive, true);
      assert.equal(state.effectiveStatus, 'active');
      assert.equal(state.conversationStatus, null);
      assert.equal(state.inheritsTeamStatus, true);
    },
  },
];

for (const scenario of scenarios) {
  scenario.run();
  console.log(`✓ ${scenario.name}`);
}

console.log(`Verificados ${scenarios.length} escenarios de sesiones AI.`);
