import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLE_PRESETS, getPermissions, hasPermission } from '../../lib/permissions';

const PHASE1_PERMISSIONS = ['financeRead', 'financeWrite', 'calendarRead', 'calendarWrite', 'notesRead', 'notesWrite'] as const;

test('los permisos de Fase 1 (finance/calendar/notes) existen para los tres roles, sin necesidad de campos nuevos', () => {
  for (const role of ['owner', 'admin', 'agent'] as const) {
    for (const permission of PHASE1_PERMISSIONS) {
      assert.equal(typeof ROLE_PRESETS[role][permission], 'boolean', `${role}.${permission} debe ser boolean`);
    }
  }
});

test('owner y admin tienen acceso total a finanzas/reuniones/notas; agent no tiene finance ni calendar por defecto', () => {
  for (const permission of PHASE1_PERMISSIONS) {
    assert.equal(ROLE_PRESETS.owner[permission], true, `owner.${permission}`);
    assert.equal(ROLE_PRESETS.admin[permission], true, `admin.${permission}`);
  }
  assert.equal(ROLE_PRESETS.agent.financeRead, false);
  assert.equal(ROLE_PRESETS.agent.financeWrite, false);
  assert.equal(ROLE_PRESETS.agent.calendarRead, false);
  assert.equal(ROLE_PRESETS.agent.calendarWrite, false);
});

test('hasPermission respeta el preset por rol y el owner siempre pasa (aislamiento de negocio, no de tenant)', () => {
  assert.equal(hasPermission('owner', null, 'financeRead'), true);
  assert.equal(hasPermission('admin', ROLE_PRESETS.admin, 'financeWrite'), true);
  assert.equal(hasPermission('agent', ROLE_PRESETS.agent, 'financeRead'), false);
  assert.equal(hasPermission('agent', ROLE_PRESETS.agent, 'tasksRead'), true);
});

test('un custom_permissions explícito con finance en false gana sobre el preset del rol admin', () => {
  const custom = { ...ROLE_PRESETS.admin, financeRead: false, financeWrite: false };
  const resolved = getPermissions('admin', custom);
  assert.equal(resolved.financeRead, false);
  assert.equal(hasPermission('admin', custom, 'financeRead'), false);
});
