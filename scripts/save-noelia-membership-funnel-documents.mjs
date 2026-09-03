import postgres from 'postgres';
import { ACTOR_USER_ID, buildNoeliaMembershipPlan, TEAM_ID } from './lib/noelia-membership-funnel.mjs';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');

const REPORT_DATE = '2026-08-10';
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

const text = (value) => ({ type: 'text', text: String(value) });
const paragraph = (value) => ({ type: 'paragraph', content: [text(value)] });
const heading = (level, value) => ({ type: 'heading', attrs: { level }, content: [text(value)] });
const bulletList = (items) => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
});
const documentContent = (title, intro, items, footer = []) => ({
  type: 'doc',
  content: [
    heading(1, title),
    ...intro.map(paragraph),
    ...(items.length ? [bulletList(items)] : [paragraph('No se encontraron registros para este listado.')]),
    ...footer.map(paragraph),
  ],
});
const contentText = (title, intro, items, footer = []) => [
  title,
  ...intro,
  ...items.map((item) => `• ${item}`),
  ...footer,
].join('\n');

function doc(slug, title, emoji, intro, items, footer = []) {
  return {
    slug,
    title,
    emoji,
    content: documentContent(title, intro, items, footer),
    contentText: contentText(title, intro, items, footer),
  };
}

try {
  const plan = await buildNoeliaMembershipPlan(sql);
  const documents = [
    doc(
      `crm-membresias-resumen-${REPORT_DATE}`,
      'CRM de membresías · Resumen del dry-run',
      '📊',
      [
        `Equipo de Noelia · teamId ${TEAM_ID}.`,
        `Generado el ${plan.generatedAt}. Huella del plan: ${plan.fingerprint}.`,
        'Estado: dry-run. No se aplicaron movimientos ni cambios de etiquetas.',
      ],
      [
        `Tarea 1: ${plan.task1.length} contactos con membresía en etapa lead/perdido.`,
        `Tarea 2: ${plan.moves.length} movimientos propuestos: Combo Full ${plan.moves.filter((row) => row.toStage === 'Combo Full').length}; Clientes Sitios Web ${plan.moves.filter((row) => row.toStage === 'Clientes Sitios Web').length}; Tienda Online ${plan.moves.filter((row) => row.toStage === 'Tienda Online').length}.`,
        `Tarea 3: ${plan.task3.length} críticos: ${plan.task3.filter((row) => row.action.startsWith('move:')).length} movimientos y ${plan.task3.filter((row) => row.action === 'exclude_cleanup').length} exclusión por limpieza.`,
        `Tarea 4: ${plan.task4.length} contactos sin ninguna etiqueta y ${plan.tagAdditions.length} etiquetas propuestas.`,
        `Tarea 5: ${plan.task5.length} internos/basura y ${plan.tagRemovals.length} asociaciones de membresía a retirar.`,
      ],
      [
        'Seguridad prevista para la aplicación: backup de contactos y contact-tags, transacción, validación por huella, nota de auditoría y script de reversión.',
        'Observación: no existe una etiqueta independiente Perdido/Sin contestar; esos valores son etapas del embudo.',
      ],
    ),
    doc(
      `crm-membresias-tarea-1-${REPORT_DATE}`,
      'Tarea 1 · Membresías en etapas de lead o perdido',
      '📋',
      [`Total: ${plan.task1.length}. Listado de solo lectura; no se aplicaron cambios.`],
      plan.task1.map((row) => `#${row.contactId} · ${row.name} — Etapa: ${row.stage} — Membresía: ${row.memberTags.join(' + ')}`),
    ),
    doc(
      `crm-membresias-tarea-2-${REPORT_DATE}`,
      'Tarea 2 · Movimientos propuestos al embudo de Clientes',
      '➡️',
      [
        `Movimientos efectivos propuestos: ${plan.moves.length}.`,
        'Los contactos de limpieza quedan excluidos. El script bloquea cualquier contacto que haya pasado a En producción o Esperando seña después del dry-run.',
      ],
      plan.task2.map((row) => {
        const action = row.action.startsWith('move:') ? `Mover a ${row.targetStage}` : row.action === 'exclude_cleanup' ? 'NO MOVER · limpiar membresía' : 'Revisión manual';
        return `#${row.contactId} · ${row.name} — ${row.stage} → ${action}. ${row.reason}`;
      }),
    ),
    doc(
      `crm-membresias-tarea-3-${REPORT_DATE}`,
      'Tarea 3 · Casos críticos en Perdido o Sin contestar',
      '🚨',
      [
        `Críticos detectados: ${plan.task3.length}.`,
        'Ejecutiva de Ventas aparece en este cruce, pero la limpieza tiene prioridad para no convertir un contacto interno en cliente.',
      ],
      plan.task3.map((row) => {
        const action = row.action.startsWith('move:') ? `Mover a ${row.targetStage}` : 'NO MOVER · retirar membresías por ser contacto interno';
        return `#${row.contactId} · ${row.name} — Desde ${row.stage} — ${action} — Etiquetas: ${row.memberTags.join(' + ')}`;
      }),
      ['No hay una etiqueta separada de “perdido” para retirar: el estado se representa mediante la etapa actual.'],
    ),
    doc(
      `crm-membresias-tarea-4-${REPORT_DATE}`,
      'Tarea 4 · Clientes sin etiqueta de servicio',
      '🏷️',
      [
        `Contactos sin ninguna etiqueta en Entregado, En producción o Esperando seña: ${plan.task4.length}.`,
        'GoBiz aportó dos coincidencias exactas. Los demás se resolvieron con conversación, etapa histórica o etiqueta genérica cuando no había evidencia concluyente.',
      ],
      plan.task4.map((row) => `#${row.contactId} · ${row.name} — Etapa: ${row.stage} — Propuesta: ${row.proposal?.tag ?? 'Revisión manual'} — Confianza: ${row.proposal?.confidence ?? 'sin propuesta'} — Evidencia: ${row.proposal?.evidence ?? 'Sin regla segura.'}`),
    ),
    doc(
      `crm-membresias-tarea-5-${REPORT_DATE}`,
      'Tarea 5 · Limpieza de contactos internos o basura',
      '🧹',
      [`Contactos detectados: ${plan.task5.length}. Asociaciones de membresía a retirar: ${plan.tagRemovals.length}.`],
      plan.task5.map((row) => `#${row.contactId} · ${row.name} — Etapa: ${row.stage} — Quitar: ${row.memberTags.join(' + ')}`),
    ),
  ];

  const result = await sql.begin(async (tx) => {
    let [parentFolder] = await tx`
      select id from team_document_folders
      where team_id = ${TEAM_ID} and parent_id is null and name = 'Reportes'
      order by id limit 1
    `;
    if (!parentFolder) {
      [parentFolder] = await tx`
        insert into team_document_folders (team_id, parent_id, name, emoji, depth, position, created_by, updated_at)
        values (${TEAM_ID}, null, 'Reportes', '📊', 1, 0, ${ACTOR_USER_ID}, now())
        returning id
      `;
    }

    let [folder] = await tx`
      select id from team_document_folders
      where team_id = ${TEAM_ID} and parent_id = ${parentFolder.id} and name = 'CRM · Membresías'
      order by id limit 1
    `;
    if (!folder) {
      [folder] = await tx`
        insert into team_document_folders (team_id, parent_id, name, emoji, depth, position, created_by, updated_at)
        values (${TEAM_ID}, ${parentFolder.id}, 'CRM · Membresías', '🗂️', 2, 0, ${ACTOR_USER_ID}, now())
        returning id
      `;
    }

    const saved = [];
    for (const [position, entry] of documents.entries()) {
      const [existing] = await tx`
        select id, version from team_documents
        where team_id = ${TEAM_ID} and slug = ${entry.slug}
        limit 1
      `;
      if (existing) {
        const [updated] = await tx`
          update team_documents
          set folder_id = ${folder.id}, title = ${entry.title}, emoji = ${entry.emoji},
            content = ${tx.json(entry.content)}, content_text = ${entry.contentText},
            position = ${position}, version = ${Number(existing.version) + 1},
            updated_by = ${ACTOR_USER_ID}, updated_at = now()
          where id = ${existing.id}
          returning id, title, version
        `;
        saved.push({ id: Number(updated.id), title: updated.title, version: Number(updated.version), action: 'updated' });
      } else {
        const [created] = await tx`
          insert into team_documents (
            team_id, folder_id, title, slug, emoji, content, content_text,
            version, position, created_by, updated_by
          ) values (
            ${TEAM_ID}, ${folder.id}, ${entry.title}, ${entry.slug}, ${entry.emoji},
            ${tx.json(entry.content)}, ${entry.contentText}, 1, ${position}, ${ACTOR_USER_ID}, ${ACTOR_USER_ID}
          ) returning id, title, version
        `;
        saved.push({ id: Number(created.id), title: created.title, version: Number(created.version), action: 'created' });
      }
    }

    const [audit] = await tx`
      insert into activity_logs (team_id, user_id, action, ip_address)
      values (
        ${TEAM_ID}, ${ACTOR_USER_ID},
        ${`documents.membership_funnel_reports_saved:${JSON.stringify({ fingerprint: plan.fingerprint, parentFolderId: Number(parentFolder.id), folderId: Number(folder.id), documentIds: saved.map((item) => item.id) })}`},
        'Codex/local'
      ) returning id
    `;
    return { parentFolderId: Number(parentFolder.id), folderId: Number(folder.id), documents: saved, auditId: Number(audit.id) };
  });

  console.log(JSON.stringify({ saved: true, fingerprint: plan.fingerprint, ...result }, null, 2));
} finally {
  await sql.end();
}

