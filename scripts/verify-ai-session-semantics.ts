import assert from 'node:assert/strict';
import {
  getEffectiveAIState,
  shouldBlockAIProcessing,
  shouldPersistAISession,
} from '../lib/ai/session-state.ts';

type Scenario = {
  name: string;
  run: () => void;
};

const scenarios: Scenario[] = [
  {
    name: 'chat nuevo con IA global activa hereda estado activo sin sesión',
    run: () => {
      const state = getEffectiveAIState(true, null);

      assert.equal(state.isActive, true);
      assert.equal(state.effectiveStatus, 'active');
      assert.equal(state.conversationStatus, null);
      assert.equal(state.inheritsTeamStatus, true);
      assert.equal(shouldBlockAIProcessing(state.conversationStatus), false);
    },
  },
  {
    name: 'chat nuevo con IA global inactiva hereda estado inactivo sin sesión',
    run: () => {
      const state = getEffectiveAIState(false, null);

      assert.equal(state.isActive, false);
      assert.equal(state.effectiveStatus, 'paused');
      assert.equal(state.conversationStatus, null);
      assert.equal(state.inheritsTeamStatus, true);
    },
  },
  {
    name: 'pausa manual persiste solo si ya existe sesión y bloquea el procesamiento',
    run: () => {
      assert.equal(shouldPersistAISession('paused', true), true);

      const state = getEffectiveAIState(true, 'paused');

      assert.equal(state.isActive, false);
      assert.equal(state.effectiveStatus, 'paused');
      assert.equal(state.conversationStatus, 'paused');
      assert.equal(state.inheritsTeamStatus, false);
      assert.equal(shouldBlockAIProcessing(state.conversationStatus), true);
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
      assert.equal(shouldBlockAIProcessing(state.conversationStatus), false);
    },
  },
  {
    name: 'reactivación desde nodo ai_control crea sesión activa cuando no existe',
    run: () => {
      assert.equal(shouldPersistAISession('active', false), true);

      const state = getEffectiveAIState(true, 'active');

      assert.equal(state.isActive, true);
      assert.equal(state.effectiveStatus, 'active');
      assert.equal(state.conversationStatus, 'active');
      assert.equal(state.inheritsTeamStatus, false);
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
    },
  },
];

for (const scenario of scenarios) {
  scenario.run();
  console.log(`✓ ${scenario.name}`);
}

console.log(`Verificados ${scenarios.length} escenarios de sesiones AI.`);
