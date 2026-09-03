import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// lib/plugins/grok-connector/server/business-os-actions.ts importa 'server-only'
// y @/lib/db/drizzle (crea un pool de conexión al cargar el módulo), y usa el
// alias de paths @/, que este runner de node:test no resuelve. Se verifica por
// contenido, igual que el resto de los tests de este directorio.
let source: string;

test.before(async () => {
  source = await readFile('lib/plugins/grok-connector/server/business-os-actions.ts', 'utf8');
});

function functionBody(fnName: string) {
  const start = source.indexOf(`async function ${fnName}(`);
  assert.ok(start >= 0, `no se encontró la función ${fnName}`);
  const nextFnMarkers = ['\nasync function ', '\nexport async function ', '\nfunction ', '\nexport function '];
  let end = source.length;
  for (const marker of nextFnMarkers) {
    const markerIdx = source.indexOf(marker, start + 10);
    if (markerIdx >= 0 && markerIdx < end) end = markerIdx;
  }
  return source.slice(start, end);
}

const EXPECTED_PERMISSION: Record<string, string> = {
  financeSummary: 'financeRead',
  financeReceivablesPayables: 'financeRead',
  financeCashflowProjection: 'financeRead',
  meetingAgenda: 'calendarRead',
  generateTasksFromNote: 'tasksWrite',
};

test('cada tool de negocio valida el permiso correcto antes de tocar la base de datos', () => {
  for (const [fn, permission] of Object.entries(EXPECTED_PERMISSION)) {
    const body = functionBody(fn);
    const assertIdx = body.indexOf(`assertPermission(context, '${permission}'`);
    assert.ok(assertIdx >= 0, `${fn} debe llamar assertPermission(context, '${permission}', ...)`);
    const firstDbCallIdx = (() => {
      const candidates = ['db.select(', 'db.query.'].map((token) => body.indexOf(token)).filter((i) => i >= 0);
      return candidates.length ? Math.min(...candidates) : -1;
    })();
    if (firstDbCallIdx >= 0) {
      assert.ok(assertIdx < firstDbCallIdx, `${fn} debe verificar el permiso ANTES de la primera consulta a la base`);
    }
  }
});

test('las 4 tools de lectura y la de generación de tareas están registradas en los catálogos exportados', () => {
  const readTools = [
    'whatspro_finance_summary',
    'whatspro_finance_receivables_payables',
    'whatspro_finance_cashflow_projection',
    'whatspro_meeting_agenda',
  ];
  for (const tool of readTools) {
    assert.match(source, new RegExp(`name: '${tool}'`));
  }
  assert.match(source, /name: 'whatspro_generate_tasks_from_note'/);
  assert.match(source, /if \(name === 'whatspro_finance_summary'\) return financeSummary/);
  assert.match(source, /if \(name === 'whatspro_generate_tasks_from_note'\) return generateTasksFromNote/);
});

test('financeReceivablesPayables filtra siempre por teamId, incluso combinando condiciones dinámicas', () => {
  const body = functionBody('financeReceivablesPayables');
  assert.match(body, /eq\(teamFinancialEntries\.teamId, context\.teamId\)/);
  assert.match(body, /and\(\.\.\.conditions\)/);
});

test('meetingAgenda, cuando filtra por user_id, nunca cruza participantes de otro team', () => {
  const body = functionBody('meetingAgenda');
  assert.match(body, /eq\(teamEventParticipants\.teamId, context\.teamId\), eq\(teamEventParticipants\.userId, data\.user_id\)/);
});

test('generateTasksFromNote audita la generación de tareas (trazabilidad IA)', () => {
  const body = functionBody('generateTasksFromNote');
  assert.match(body, /await audit\(context, 'GROK_NOTE_TASKS_GENERATED', data\.note_id\)/);
});

test('isoWeek implementa la fórmula estándar ISO-8601 (jueves de la semana + primer jueves del año)', () => {
  assert.match(source, /export function isoWeek\(dateStr: string\)/);
  const start = source.indexOf('export function isoWeek(');
  const body = source.slice(start, source.indexOf('\n}', start));
  // Ancla del algoritmo textbook: mover al jueves de la semana ISO y comparar contra el primer jueves del año.
  assert.match(body, /getUTCDay\(\) \+ 6\) % 7/);
  assert.match(body, /firstThursday/);
  assert.match(body, /Date\.UTC\([\s\S]*?0, 4\)/, 'debe anclar el primer jueves usando el 4 de enero');
});
