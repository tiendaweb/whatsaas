import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path: string) {
  return readFile(path, 'utf8');
}

test('el POST de eventos acepta kind/subtype/outcome/nextAction/customerId/relatedEventId/participants y queda acotado al team', async () => {
  const source = await read('app/api/plugins/calendar/events/route.ts');
  assert.match(source, /kind: z\.enum\(\['meeting', 'call'\]\)\.default\('meeting'\)/);
  assert.match(source, /subtype: z\.string\(\)\.trim\(\)\.max\(40\)\.nullable\(\)\.optional\(\)/);
  assert.match(source, /customerId: z\.number\(\)\.int\(\)\.positive\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(source, /relatedEventId: z\.number\(\)\.int\(\)\.positive\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(source, /participants: z\.array\(participantInputSchema\)\.default\(\[\]\)/);
  assert.match(source, /getPluginRequestContext\('calendarRead'\)/);
  assert.match(source, /getPluginRequestContext\('calendarWrite'\)/);
  assert.match(source, /eq\(teamEvents\.teamId, context\.team\.id\)/);
  assert.match(source, /eq\(teamEventParticipants\.teamId, context\.team\.id\)/);
  assert.match(source, /syncEventParticipants\(context\.team\.id, created\.id, parsed\.data\.participants\)/);
});

test('GET/PATCH/DELETE de un evento puntual siempre combinan id + teamId (no exponen eventos de otro team)', async () => {
  const source = await read('app/api/plugins/calendar/events/[id]/route.ts');
  const idTeamPairs = source.match(/eq\(teamEvents\.id, Number\(id\)\), eq\(teamEvents\.teamId, context\.team\.id\)/g) ?? [];
  assert.ok(idTeamPairs.length >= 3, `se esperaban al menos 3 combinaciones id+teamId (GET/PATCH/DELETE), se encontraron ${idTeamPairs.length}`);
});

test('syncEventParticipants reemplaza la lista completa del evento dentro del team, sin tocar attendees legacy', async () => {
  const source = await read('lib/plugins/calendar/server/participants.ts');
  assert.match(source, /eq\(teamEventParticipants\.eventId, eventId\), eq\(teamEventParticipants\.teamId, teamId\)/);
  assert.match(source, /db\.transaction/);
  // team_event_participants reemplaza a `attendees` (jsonb legacy) sin escribir sobre esa columna.
  assert.doesNotMatch(source, /teamEvents\.attendees|\battendees:\s/, 'no debe escribir la columna legacy attendees de team_events');
});

test('generateTasksFromNoteCommitments es idempotente: solo procesa commitments sin taskItemId', async () => {
  const source = await read('lib/plugins/notes/server/meeting-notes.ts');
  assert.match(source, /const pending = commitments\.filter\(\(c\) => !c\.taskItemId && c\.text\?\.trim\(\)\)/);
  assert.match(source, /where: and\(eq\(teamNotes\.id, input\.noteId\), eq\(teamNotes\.teamId, input\.teamId\)\)/);
  // Cada tarea generada debe reusar la utilidad existente de Task OS, no reimplementar el insert.
  assert.match(source, /createTaskInColumn\(/);
  assert.match(source, /insertRelation\(/);
  assert.match(source, /sourceType: 'note'/);
  assert.match(source, /targetType: 'task'/);
  assert.match(source, /relationType: 'generated_from'/);
  // Al final debe persistir taskItemId en el commitment para que la siguiente corrida no lo repita.
  assert.match(source, /taskItemId: task\.id/);
});

test('el endpoint de generar tareas desde una nota exige notesWrite y queda acotado al team', async () => {
  const source = await read('app/api/plugins/notes/[id]/generate-tasks/route.ts');
  assert.match(source, /getPluginRequestContext\('notesWrite'\)/);
  assert.match(source, /generateTasksFromNoteCommitments\(\{ teamId: context\.team\.id, userId: context\.user\.id, noteId: Number\(id\) \}\)/);
});
