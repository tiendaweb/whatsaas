import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import postgres from 'postgres';
import { ACTOR_USER_ID, TEAM_ID } from './lib/noelia-membership-funnel.mjs';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');
const backupArg = process.argv.find((arg) => arg.startsWith('--backup='))?.slice('--backup='.length);
const confirm = process.argv.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length);
const apply = process.argv.includes('--apply');
if (!backupArg) throw new Error('Indicá --backup=.backups/noelia-membership-funnel/<archivo>.json');

const backupRoot = resolve('.backups/noelia-membership-funnel');
const backupPath = resolve(backupArg);
const pathWithinRoot = relative(backupRoot, backupPath);
if (pathWithinRoot.startsWith('..') || pathWithinRoot === '' || pathWithinRoot.includes('/../')) {
  throw new Error('El backup debe ser un archivo dentro de .backups/noelia-membership-funnel.');
}

const backup = JSON.parse(await readFile(backupPath, 'utf8'));
if (backup.format !== 'noelia-membership-funnel-backup-v1' || Number(backup.teamId) !== TEAM_ID) {
  throw new Error('Formato de backup inválido o team incorrecto.');
}
const contactBefore = new Map(backup.contacts.map((row) => [Number(row.id), row]));
const originalTagPairs = new Set(backup.contactTags.map((row) => `${Number(row.contact_id)}:${Number(row.tag_id)}`));
const moves = backup.plannedChanges?.moves ?? [];
const removedTags = backup.plannedChanges?.tagRemovals ?? [];
const addedTags = backup.plannedChanges?.tagAdditions ?? [];
const summary = {
  dryRun: !apply,
  backupPath,
  fingerprint: backup.fingerprint,
  restoreStages: moves.length,
  restoreRemovedTags: removedTags.filter((row) => originalTagPairs.has(`${row.contactId}:${row.tagId}`)).length,
  removeAddedTags: addedTags.filter((row) => !originalTagPairs.has(`${row.contactId}:${row.tagId}`)).length,
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Para revertir: node --env-file=.env scripts/revert-noelia-membership-funnel.mjs --backup=${backupArg} --apply --confirm=${backup.fingerprint}`);
  process.exit(0);
}
if (confirm !== backup.fingerprint) throw new Error(`Confirmación inválida; usá --confirm=${backup.fingerprint}`);

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
try {
  const result = await sql.begin(async (tx) => {
    const ids = [...new Set([...moves, ...removedTags, ...addedTags].map((row) => Number(row.contactId)))].sort((a, b) => a - b);
    const current = await tx`
      select id, funnel_stage_id from contacts
      where team_id = ${TEAM_ID} and id in ${tx(ids)}
      order by id for update
    `;
    if (current.length !== ids.length) throw new Error('Faltan contactos del backup; abortando reversión.');
    const currentById = new Map(current.map((row) => [Number(row.id), row]));
    for (const move of moves) {
      const row = currentById.get(Number(move.contactId));
      if (Number(row.funnel_stage_id) !== Number(move.toStageId)) {
        throw new Error(`El contacto ${move.contactId} ya no está en la etapa aplicada; no se pisa un cambio posterior.`);
      }
      const before = contactBefore.get(Number(move.contactId));
      await tx`
        update contacts
        set funnel_stage_id = ${before.funnel_stage_id}, updated_at = now()
        where team_id = ${TEAM_ID} and id = ${move.contactId}
      `;
    }
    for (const removal of removedTags) {
      if (!originalTagPairs.has(`${removal.contactId}:${removal.tagId}`)) continue;
      await tx`
        insert into contact_tags (contact_id, tag_id)
        values (${removal.contactId}, ${removal.tagId})
        on conflict (contact_id, tag_id) do nothing
      `;
    }
    for (const addition of addedTags) {
      if (originalTagPairs.has(`${addition.contactId}:${addition.tagId}`)) continue;
      await tx`delete from contact_tags where contact_id = ${addition.contactId} and tag_id = ${addition.tagId}`;
    }
    const content = [
      `Reversión del ordenamiento de membresías. Huella: ${backup.fingerprint}.`,
      `Backup usado: ${backupPath}`,
      `Etapas restauradas: ${moves.length}.`,
      `Etiquetas restauradas: ${summary.restoreRemovedTags}.`,
      `Etiquetas agregadas por la aplicación y retiradas: ${summary.removeAddedTags}.`,
    ].join('\n');
    const [note] = await tx`
      insert into team_notes (team_id, title, content, tags, pinned, status, created_by, updated_by)
      values (
        ${TEAM_ID}, ${`Reversión CRM membresías · ${new Date().toISOString().slice(0, 10)}`}, ${content},
        ${tx.json(['CRM', 'membresías', 'reversión', 'auditoría'])}, true, 'done', ${ACTOR_USER_ID}, ${ACTOR_USER_ID}
      ) returning id
    `;
    const [audit] = await tx`
      insert into activity_logs (team_id, user_id, action, ip_address)
      values (
        ${TEAM_ID}, ${ACTOR_USER_ID},
        ${`contacts.membership_funnel_reverted:${JSON.stringify({ fingerprint: backup.fingerprint, backupPath, noteId: Number(note.id), stages: moves.length, restoredTags: summary.restoreRemovedTags, removedTags: summary.removeAddedTags })}`},
        'Codex/local'
      ) returning id
    `;
    return { noteId: Number(note.id), auditId: Number(audit.id) };
  });
  console.log(JSON.stringify({ reverted: true, ...summary, ...result }, null, 2));
} finally {
  await sql.end();
}

