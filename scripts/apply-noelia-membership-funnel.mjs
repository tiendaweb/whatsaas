import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import {
  ACTOR_USER_ID,
  buildNoeliaMembershipPlan,
  isPendingWorkStage,
  renderNoeliaMembershipReport,
  TEAM_ID,
} from './lib/noelia-membership-funnel.mjs';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');
const apply = process.argv.includes('--apply');
const approval = process.argv.find((arg) => arg.startsWith('--approval='))?.slice('--approval='.length) ?? null;
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const plan = await buildNoeliaMembershipPlan(sql);
  if (!apply) {
    process.stdout.write(renderNoeliaMembershipReport(plan));
    console.error('\nDRY-RUN: no se aplicó ningún cambio.');
  } else {
    if (!approval || approval !== plan.fingerprint) {
      throw new Error(`Huella de aprobación inválida. Actual: ${plan.fingerprint}. Ejecutá primero el audit y aprobá exactamente ese plan.`);
    }
    const affectedIds = [...new Set([
      ...plan.moves.map((row) => row.contactId),
      ...plan.tagRemovals.map((row) => row.contactId),
      ...plan.tagAdditions.map((row) => row.contactId),
    ])].sort((a, b) => a - b);
    if (affectedIds.length === 0) throw new Error('El plan no contiene cambios.');

    const result = await sql.begin(async (tx) => {
      const lockedContacts = await tx`
        select c.*, fs.name as stage_name
        from contacts c left join funnel_stages fs on fs.id = c.funnel_stage_id
        where c.team_id = ${TEAM_ID} and c.id in ${tx(affectedIds)}
        order by c.id for update of c
      `;
      if (lockedContacts.length !== affectedIds.length) throw new Error('Cambió el conjunto de contactos; abortando.');
      const lockedById = new Map(lockedContacts.map((row) => [Number(row.id), row]));
      for (const move of plan.moves) {
        const current = lockedById.get(move.contactId);
        if (Number(current.funnel_stage_id) !== move.fromStageId || current.stage_name !== move.fromStage) {
          throw new Error(`La etapa de ${move.contactId} cambió desde el dry-run; abortando.`);
        }
        if (isPendingWorkStage(current.stage_name)) throw new Error(`Salvaguarda: ${move.contactId} está en trabajo pendiente.`);
      }
      const currentTags = await tx`
        select ct.*, t.name as tag_name
        from contact_tags ct join tags t on t.id = ct.tag_id
        where ct.contact_id in ${tx(affectedIds)}
        order by ct.contact_id, ct.id
        for update of ct
      `;
      const backup = {
        format: 'noelia-membership-funnel-backup-v1',
        teamId: TEAM_ID,
        fingerprint: plan.fingerprint,
        createdAt: new Date().toISOString(),
        contacts: lockedContacts,
        contactTags: currentTags,
        plannedChanges: plan.mutationPlan,
      };
      const stamp = backup.createdAt.replace(/[:.]/g, '-');
      const backupDir = resolve('.backups/noelia-membership-funnel');
      const backupPath = resolve(backupDir, `${stamp}-${plan.fingerprint}.json`);
      await mkdir(backupDir, { recursive: true });
      await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600 });
      await chmod(backupPath, 0o600);

      for (const move of plan.moves) {
        const updated = await tx`
          update contacts set funnel_stage_id = ${move.toStageId}, updated_at = now()
          where team_id = ${TEAM_ID} and id = ${move.contactId} and funnel_stage_id = ${move.fromStageId}
          returning id
        `;
        if (updated.length !== 1) throw new Error(`No se pudo mover ${move.contactId}.`);
      }
      for (const removal of plan.tagRemovals) {
        await tx`delete from contact_tags where contact_id = ${removal.contactId} and tag_id = ${removal.tagId}`;
      }
      for (const addition of plan.tagAdditions) {
        await tx`
          insert into contact_tags (contact_id, tag_id)
          values (${addition.contactId}, ${addition.tagId})
          on conflict (contact_id, tag_id) do nothing
        `;
      }

      const noteLines = [
        `Aplicación del ordenamiento de membresías. Huella: ${plan.fingerprint}.`,
        `Backup: ${backupPath}`,
        '',
        `Movimientos (${plan.moves.length}):`,
        ...plan.moves.map((row) => `- #${row.contactId} ${row.name}: ${row.fromStage} → ${row.toStage}${row.critical ? ' [CRÍTICO]' : ''}`),
        '',
        `Etiquetas quitadas (${plan.tagRemovals.length}):`,
        ...plan.tagRemovals.map((row) => `- #${row.contactId} ${row.name}: ${row.tag}`),
        '',
        `Etiquetas agregadas (${plan.tagAdditions.length}):`,
        ...plan.tagAdditions.map((row) => `- #${row.contactId} ${row.name}: ${row.tag} (${row.confidence})`),
      ];
      const [note] = await tx`
        insert into team_notes (team_id, title, content, tags, pinned, status, created_by, updated_by)
        values (
          ${TEAM_ID},
          ${`Log CRM membresías · ${backup.createdAt.slice(0, 10)}`},
          ${noteLines.join('\n')},
          ${tx.json(['CRM', 'membresías', 'auditoría', 'reversible'])},
          true,
          'done',
          ${ACTOR_USER_ID},
          ${ACTOR_USER_ID}
        ) returning id
      `;
      const [audit] = await tx`
        insert into activity_logs (team_id, user_id, action, ip_address)
        values (
          ${TEAM_ID}, ${ACTOR_USER_ID},
          ${`contacts.membership_funnel_reorganized:${JSON.stringify({ fingerprint: plan.fingerprint, backupPath, noteId: Number(note.id), moves: plan.moves.length, tagRemovals: plan.tagRemovals.length, tagAdditions: plan.tagAdditions.length })}`},
          'Codex/local'
        ) returning id
      `;
      return { backupPath, noteId: Number(note.id), auditId: Number(audit.id) };
    });
    console.log(JSON.stringify({ applied: true, fingerprint: plan.fingerprint, ...result, counts: {
      moves: plan.moves.length, criticalMoved: plan.moves.filter((row) => row.critical).length,
      tagRemovals: plan.tagRemovals.length, tagAdditions: plan.tagAdditions.length,
    } }, null, 2));
  }
} finally {
  await sql.end();
}
