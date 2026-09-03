import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');

const TEAM_ID = 2;
const EXPECTED_MARKED = 45;
const EXPECTED_UNIQUE_CUSTOMERS = 42;
const EXPECTED_CREATED = 16;
const SOURCE = 'crm_checkbox_cliente_v1';
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

try {
  const backupDirectory = path.join(process.cwd(), '.backups', 'marked-client-conversion');
  const backupFiles = (await readdir(backupDirectory)).filter((name) => name.endsWith('.json')).sort();
  if (!backupFiles.length) throw new Error('No conversion backup found');
  const backupPath = path.join(backupDirectory, backupFiles.at(-1));
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));

  const [marked, linked, createdCustomers, auditRows, duplicateCreatedPhones] = await Promise.all([
    sql`
      select id, chat_id, name, notes, custom_data, funnel_stage_id, assigned_user_id, assigned_department_id
      from contacts
      where team_id = ${TEAM_ID}
        and lower(coalesce(custom_data ->> 'cliente', 'false')) in ('true', '1', 'yes', 'si', 'sí')
      order by id
    `,
    sql`
      select c.id as contact_id, tcc.customer_id, tc.name as customer_name,
        tc.notes as customer_notes, tc.source, tc.external_id, tc.external_data
      from contacts c
      join team_customer_contacts tcc on tcc.contact_id = c.id and tcc.team_id = c.team_id
      join team_customers tc on tc.id = tcc.customer_id and tc.team_id = c.team_id
      where c.team_id = ${TEAM_ID}
        and lower(coalesce(c.custom_data ->> 'cliente', 'false')) in ('true', '1', 'yes', 'si', 'sí')
      order by c.id, tcc.id
    `,
    sql`
      select id, name, phone, email, source, external_id, external_data, notes
      from team_customers
      where team_id = ${TEAM_ID} and source = 'crm_checkbox'
        and external_data -> 'crmCustomerConversion' ->> 'source' = ${SOURCE}
      order by id
    `,
    sql`
      select id, action, timestamp
      from activity_logs
      where team_id = ${TEAM_ID} and action like 'customers.convert_marked_contacts:%'
      order by id desc limit 1
    `,
    sql`
      select regexp_replace(phone, '\\D', '', 'g') as phone, count(*)::int as total
      from team_customers
      where team_id = ${TEAM_ID} and source = 'crm_checkbox' and coalesce(phone, '') <> ''
      group by regexp_replace(phone, '\\D', '', 'g')
      having count(*) > 1
    `,
  ]);

  const beforeById = new Map(backup.contacts.map((contact) => [Number(contact.id), contact]));
  const linkedByContact = new Map();
  for (const row of linked) {
    const id = Number(row.contact_id);
    linkedByContact.set(id, [...(linkedByContact.get(id) ?? []), row]);
  }

  const invalid = [];
  for (const contact of marked) {
    const id = Number(contact.id);
    const before = beforeById.get(id);
    const links = linkedByContact.get(id) ?? [];
    if (!before) invalid.push({ id, issue: 'missing_in_backup' });
    if (links.length !== 1) invalid.push({ id, issue: `links_${links.length}` });
    if (!String(contact.notes ?? '').includes('Cliente del sistema:')) invalid.push({ id, issue: 'contact_note_missing_link' });
    if (!contact.custom_data?.customerConversion?.customerId) invalid.push({ id, issue: 'conversion_metadata_missing' });
    if (links[0] && !String(links[0].customer_notes ?? '').includes(`[CRM Cliente · contacto #${id}]`)) {
      invalid.push({ id, issue: 'customer_note_missing_contact' });
    }

    for (const key of ['chat_id', 'name', 'funnel_stage_id', 'assigned_user_id', 'assigned_department_id']) {
      if (before && comparable(before[key]) !== comparable(contact[key])) {
        invalid.push({ id, issue: `unexpected_change_${key}` });
      }
    }
  }

  const uniqueCustomerIds = new Set(linked.map((row) => Number(row.customer_id)));
  if (marked.length !== EXPECTED_MARKED) invalid.push({ issue: `marked_${marked.length}` });
  if (linked.length !== EXPECTED_MARKED) invalid.push({ issue: `linked_rows_${linked.length}` });
  if (uniqueCustomerIds.size !== EXPECTED_UNIQUE_CUSTOMERS) invalid.push({ issue: `unique_customers_${uniqueCustomerIds.size}` });
  if (createdCustomers.length !== EXPECTED_CREATED) invalid.push({ issue: `created_${createdCustomers.length}` });
  if (duplicateCreatedPhones.length) invalid.push({ issue: 'duplicate_created_phones', values: duplicateCreatedPhones });
  if (!auditRows.length) invalid.push({ issue: 'audit_log_missing' });

  if (invalid.length) throw new Error(`Verification failed: ${JSON.stringify(invalid)}`);

  console.log(JSON.stringify({
    verified: true,
    backupPath,
    markedContacts: marked.length,
    linkedContacts: linked.length,
    uniqueCustomers: uniqueCustomerIds.size,
    createdCustomers: createdCustomers.length,
    reusedCustomers: uniqueCustomerIds.size - createdCustomers.length,
    contactsWithLinkNotes: marked.length,
    customersWithContextNotes: linked.length,
    preservedStagesAndAssignments: marked.length,
    duplicateCreatedPhones: 0,
    auditLogId: Number(auditRows[0].id),
  }, null, 2));
} finally {
  await sql.end();
}
