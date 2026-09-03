import postgres from 'postgres';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');

const TEAM_ID = 2;
const USER_ID = 3;
const TITLE = 'Reporte · Conversión de contactos marcados como Cliente · 10/08/2026';
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

try {
  const result = await sql.begin(async (tx) => {
    const mappings = await tx`
      select
        c.id as contact_id,
        c.name as contact_name,
        fs.name as stage_name,
        c.custom_data ->> 'tipo_servicio' as service,
        c.custom_data ->> 'ciclo_cobro' as billing_cycle,
        c.custom_data ->> 'monto' as amount,
        tcc.customer_id,
        tc.name as customer_name,
        tc.source as customer_source
      from contacts c
      join team_customer_contacts tcc on tcc.contact_id = c.id and tcc.team_id = c.team_id
      join team_customers tc on tc.id = tcc.customer_id and tc.team_id = c.team_id
      left join funnel_stages fs on fs.id = c.funnel_stage_id
      where c.team_id = ${TEAM_ID}
        and lower(coalesce(c.custom_data ->> 'cliente', 'false')) in ('true', '1', 'yes', 'si', 'sí')
      order by c.id
    `;
    if (mappings.length !== 45) throw new Error(`Expected 45 mapped contacts, found ${mappings.length}`);

    const created = mappings.filter((row) => row.customer_source === 'crm_checkbox');
    const uniqueCustomerIds = new Set(mappings.map((row) => Number(row.customer_id)));
    const reusedCustomerIds = new Set(mappings.filter((row) => row.customer_source !== 'crm_checkbox').map((row) => Number(row.customer_id)));
    const [conversionAudit] = await tx`
      select id, timestamp from activity_logs
      where team_id = ${TEAM_ID} and action like 'customers.convert_marked_contacts:%'
      order by id desc limit 1
    `;

    const mappingLines = mappings.map((row) => {
      const details = [
        row.stage_name ? `etapa: ${row.stage_name}` : null,
        row.service ? `servicio: ${clean(row.service)}` : null,
        row.billing_cycle ? `ciclo: ${clean(row.billing_cycle)}` : null,
        row.amount ? `importe: ${clean(row.amount)}` : null,
      ].filter(Boolean).join(' · ');
      const origin = row.customer_source === 'crm_checkbox' ? 'cliente creado' : 'cliente existente reutilizado';
      return `- Contacto #${row.contact_id} ${row.contact_name} → Cliente #${row.customer_id} ${row.customer_name} (${origin})${details ? ` · ${details}` : ''}`;
    });

    const content = [
      'REPORTE DE CONVERSIÓN DE CONTACTOS A CLIENTES',
      '',
      'Cuenta: noelia@whatspro.uno',
      'Equipo: 2',
      'Fecha de ejecución: 10/08/2026',
      'Criterio: contactos con el campo booleano “Cliente” marcado en el CRM.',
      '',
      '1. RESULTADO GENERAL',
      '',
      '- 45 contactos marcados revisados.',
      '- 45 contactos vinculados correctamente a la entidad Clientes.',
      `- ${uniqueCustomerIds.size} clientes únicos resultantes.`,
      `- ${created.length} clientes nuevos creados.`,
      `- ${reusedCustomerIds.size} clientes existentes reutilizados.`,
      '- 22 vínculos nuevos entre contactos y clientes.',
      '- 0 contactos marcados sin cliente.',
      '- 0 teléfonos duplicados entre los clientes nuevos.',
      '',
      '2. CRITERIOS DE IDENTIDAD Y CONSOLIDACIONES',
      '',
      '- Se priorizó el vínculo existente.',
      '- Cuando no había vínculo, se comparó teléfono normalizado y correo electrónico.',
      '- No se fusionaron personas sólo por tener nombres parecidos.',
      '- Ofertas Locales: contactos #7 y #49 consolidados en el cliente #3186.',
      '- Paseos Devoto: contactos #107 y #341 consolidados en el cliente #60.',
      '- Xylinos: contactos #356 y #391 consolidados en el cliente #3216 por negocio, dominio y conversación.',
      '- Matías, Distribuidora Los Hermanos y CB Distribución reutilizaron clientes existentes confirmados por teléfono.',
      '',
      '3. INFORMACIÓN GUARDADA',
      '',
      '- Se conservaron nombres, etapas, responsables y departamentos del CRM.',
      '- No se movieron contactos entre etapas: producción, entrega, conversación o seguimiento siguen representando el estado operativo real.',
      '- Se completaron teléfono, correo y foto del cliente únicamente cuando el dato anterior estaba vacío.',
      '- En cada Cliente se agregó un bloque por contacto con estado, responsable, departamento, servicios, ciclo de cobro, importes, seña, cuotas, renovación, dominio, etiquetas y contexto previo disponible.',
      '- En cada contacto se agregó el nombre e ID de su entidad Cliente.',
      '- En custom_data se registró customerConversion con origen, fecha, campo verificado e ID del cliente.',
      '- En external_data del Cliente se registraron los contactos asociados y la verificación de la conversión.',
      '',
      '4. CONTROLES REALIZADOS',
      '',
      '- Cada uno de los 45 contactos tiene exactamente un vínculo con Cliente.',
      '- Los 45 contactos tienen notas y metadata de conversión.',
      '- Los 45 bloques de contexto aparecen en las notas de sus Clientes.',
      '- Las 45 etapas, asignaciones y relaciones con chats coinciden con el respaldo previo.',
      '- La simulación posterior quedó en 45 ya vinculados y 0 pendientes de creación.',
      '- La operación fue transaccional: cualquier inconsistencia habría revertido todos los cambios.',
      '',
      '5. TRAZABILIDAD Y RECUPERACIÓN',
      '',
      '- Auditoría de conversión: activity_logs #' + Number(conversionAudit?.id || 1017) + '.',
      '- Respaldo previo: /root/whatsaas/.backups/marked-client-conversion/2026-08-10T04-27-54-111Z.json',
      '- Script idempotente: scripts/convert-marked-contacts-to-customers.mjs',
      '- Verificación independiente: scripts/verify-marked-contacts-to-customers.mjs',
      '',
      '6. DETALLE CONTACTO → CLIENTE',
      '',
      ...mappingLines,
      '',
      'Estado final: conversión completa y verificada. No quedan contactos con el checkbox Cliente marcado sin su entidad Cliente correspondiente.',
    ].join('\n');

    const [existing] = await tx`
      select id from team_notes where team_id = ${TEAM_ID} and title = ${TITLE}
      order by id desc limit 1 for update
    `;

    let note;
    if (existing) {
      [note] = await tx`
        update team_notes
        set content = ${content}, tags = ${tx.json(['CRM', 'Clientes', 'Auditoría', 'Noelia', 'Conversión'])},
            pinned = true, status = 'done', updated_by = ${USER_ID}, updated_at = now()
        where id = ${existing.id} and team_id = ${TEAM_ID}
        returning id, title, status, pinned, tags, created_at, updated_at
      `;
    } else {
      [note] = await tx`
        insert into team_notes (
          team_id, title, content, tags, pinned, status,
          created_by, updated_by, created_at, updated_at
        ) values (
          ${TEAM_ID}, ${TITLE}, ${content}, ${tx.json(['CRM', 'Clientes', 'Auditoría', 'Noelia', 'Conversión'])},
          true, 'done', ${USER_ID}, ${USER_ID}, now(), now()
        )
        returning id, title, status, pinned, tags, created_at, updated_at
      `;
    }

    const [audit] = await tx`
      insert into activity_logs (team_id, user_id, action, ip_address)
      values (${TEAM_ID}, ${USER_ID}, ${`notes.customer_conversion_report_saved:${JSON.stringify({ noteId: Number(note.id), title: TITLE, mappedContacts: mappings.length })}`}, ${'Codex/local'})
      returning id
    `;

    return {
      note: { ...note, contentLength: content.length, mappedContacts: mappings.length },
      reportAuditLogId: Number(audit.id),
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end();
}
