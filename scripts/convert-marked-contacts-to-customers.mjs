import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');

const TEAM_ID = 2;
const ACTOR_USER_ID = 3;
const CHECKBOX_KEY = 'cliente';
const SOURCE = 'crm_checkbox_cliente_v1';
const APPLY = process.argv.includes('--apply');

// Identidades confirmadas durante la auditoría por teléfono, negocio y conversación.
const CONFIRMED_EXISTING_CUSTOMER = new Map([
  [7, 3186], // Ofertas Locales: mismo WhatsApp que el contacto 49.
  [45, 194], // Matías Kamal: coincidencia exacta de teléfono.
  [171, 58], // Distribuidora Los Hermanos: coincidencia exacta de teléfono.
  [341, 60], // Paseos Devoto: segundo contacto del mismo negocio.
  [458, 16], // CB Distribución: coincidencia exacta de teléfono.
]);

const SHARED_NEW_CUSTOMER = new Map([
  [391, 356], // Xylinos: contacto secundario del mismo negocio y dominio.
]);

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
const clean = (value) => String(value ?? '').replace(/\r/g, '').trim();
const unique = (values) => [...new Set(values.filter(Boolean))];
const digits = (value) => String(value ?? '').replace(/\D/g, '');

function phoneKey(value) {
  let result = digits(value);
  if (result.startsWith('549')) result = result.slice(3);
  else if (result.startsWith('54')) result = result.slice(2);
  if (result.startsWith('0')) result = result.slice(1);
  return result;
}

function emailKey(value) {
  return clean(value).toLowerCase();
}

function readable(value) {
  const text = clean(value);
  return text && /[\p{L}]/u.test(text) ? text : '';
}

function titleCaseWords(value) {
  const normalized = clean(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  return normalized ? `${normalized[0].toLocaleUpperCase('es-AR')}${normalized.slice(1)}` : '';
}

function presentName(value) {
  const normalized = clean(value);
  if (!normalized || normalized !== normalized.toLocaleLowerCase('es-AR')) return normalized;
  return normalized.replace(/(^|\s)(\p{L})/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-AR')}`);
}

function domainLabel(value) {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.replace(/^www\./i, '');
    const parts = hostname.split('.');
    let first = parts[0];
    if (['www', 'booking', 'shop', 'store'].includes(first.toLowerCase())) first = parts[1] || '';
    if (['aapp', 'static', 'tiendaweb'].includes(first.toLowerCase())) {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      first = pathParts.find((part) => !['store', 'tienda', 'site'].includes(part.toLowerCase())) || '';
    }
    return first ? titleCaseWords(first) : '';
  } catch {
    return '';
  }
}

function customerName(contact) {
  const custom = contact.custom_data ?? {};
  const contactName = presentName(readable(contact.name).replace(/^[^\p{L}\p{N}]+/u, '').trim());
  const brand = readable(custom.marca);
  const domain = domainLabel(custom.dominio || custom.sitio_web || custom.tienda_online || custom.link_demo);
  const comparableName = contactName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const comparableBrand = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const comparableDomain = domain.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (brand && (!comparableName || !comparableName.includes(comparableBrand))) {
    return `${titleCaseWords(brand)} / ${contactName || contact.push_name || phoneKey(contact.remote_jid)}`;
  }
  if (domain && (!comparableName || !comparableName.includes(comparableDomain))) {
    return `${domain} / ${contactName || contact.push_name || phoneKey(contact.remote_jid)}`;
  }
  if (contactName && !/^\d+$/.test(contactName)) return contactName;
  if (domain) return `${domain} / ${readable(contact.push_name) || phoneKey(contact.remote_jid)}`;

  const service = readable(custom.tipo_servicio || custom.plan_contratado);
  return `${service || 'Cliente WhatsApp'} / ${phoneKey(contact.remote_jid)}`;
}

function normalizedPhone(contact) {
  const raw = digits(contact.remote_jid);
  return raw ? `+${raw}` : null;
}

function contactEmail(contact) {
  const value = emailKey(contact.custom_data?.email);
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function customerNoteBlock(contact, generatedAt) {
  const custom = contact.custom_data ?? {};
  const lines = [
    `[CRM Cliente · contacto #${contact.id}]`,
    `Cliente confirmado mediante el checkbox “Cliente” el ${generatedAt.slice(0, 10)}.`,
    `Contacto: ${contact.name || contact.push_name || normalizedPhone(contact)}.`,
    contact.stage_name ? `Estado operativo: ${contact.stage_name}.` : null,
    contact.owner_name || contact.owner_email ? `Responsable: ${contact.owner_name || contact.owner_email}.` : null,
    contact.department_name ? `Departamento: ${contact.department_name}.` : null,
    custom.tipo_servicio || custom.plan_contratado ? `Servicios: ${clean(custom.tipo_servicio || custom.plan_contratado)}.` : null,
    custom.ciclo_cobro || custom.frecuencia ? `Ciclo de cobro: ${clean(custom.ciclo_cobro || custom.frecuencia)}.` : null,
    custom.monto ? `Importe registrado: ${clean(custom.monto)}.` : null,
    custom.sena ? `Seña registrada: ${clean(custom.sena)}.` : null,
    custom.cuotas ? `Cuotas registradas: ${clean(custom.cuotas)}.` : null,
    custom.proxima_renovacion ? `Próxima renovación: ${clean(custom.proxima_renovacion)}.` : null,
    custom.dominio || custom.sitio_web || custom.tienda_online || custom.link_demo
      ? `Sitio o dominio: ${clean(custom.dominio || custom.sitio_web || custom.tienda_online || custom.link_demo)}.`
      : null,
    contact.tags?.length ? `Etiquetas de servicio: ${contact.tags.join(', ')}.` : null,
    clean(contact.notes) ? `Contexto del CRM:\n${clean(contact.notes)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function appendUniqueBlock(existing, block, marker) {
  const value = clean(existing);
  if (value.includes(marker)) return value;
  return value ? `${value}\n\n${block}` : block;
}

function contactNote(contact, customer) {
  const marker = `Cliente del sistema: ${customer.name} (#${customer.id}).`;
  const existing = clean(contact.notes);
  if (existing.includes(`(#${customer.id})`)) return existing;
  const custom = contact.custom_data ?? {};
  const inferred = [
    !existing && (custom.tipo_servicio || custom.plan_contratado)
      ? `Servicios contratados: ${clean(custom.tipo_servicio || custom.plan_contratado)}.`
      : null,
    !existing && (custom.ciclo_cobro || custom.frecuencia)
      ? `Ciclo de cobro: ${clean(custom.ciclo_cobro || custom.frecuencia)}.`
      : null,
    !existing && custom.monto ? `Importe registrado: ${clean(custom.monto)}.` : null,
    !existing && (custom.dominio || custom.sitio_web || custom.tienda_online)
      ? `Sitio o dominio: ${clean(custom.dominio || custom.sitio_web || custom.tienda_online)}.`
      : null,
  ].filter(Boolean);
  return [existing, ...inferred, marker].filter(Boolean).join('\n');
}

async function fetchMarkedContacts(db) {
  return db`
    select
      c.id, c.team_id, c.chat_id, c.name, c.notes, c.custom_data, c.funnel_stage_id,
      c.assigned_user_id, c.assigned_department_id,
      ch.remote_jid, ch.push_name, ch.profile_pic_url,
      fs.name as stage_name,
      u.name as owner_name, u.email as owner_email,
      d.name as department_name,
      coalesce(array_agg(distinct t.name order by t.name) filter (where t.id is not null), array[]::varchar[]) as tags,
      coalesce(array_agg(distinct tcc.customer_id) filter (where tcc.customer_id is not null), array[]::integer[]) as linked_customer_ids
    from contacts c
    join chats ch on ch.id = c.chat_id
    left join funnel_stages fs on fs.id = c.funnel_stage_id
    left join users u on u.id = c.assigned_user_id
    left join departments d on d.id = c.assigned_department_id
    left join contact_tags ct on ct.contact_id = c.id
    left join tags t on t.id = ct.tag_id
    left join team_customer_contacts tcc on tcc.contact_id = c.id and tcc.team_id = c.team_id
    where c.team_id = ${TEAM_ID}
      and lower(coalesce(c.custom_data ->> ${CHECKBOX_KEY}, 'false')) in ('true', '1', 'yes', 'si', 'sí')
    group by c.id, ch.id, fs.id, u.id, d.id
    order by c.id
  `;
}

async function createBackup() {
  const [contacts, customers, links] = await Promise.all([
    fetchMarkedContacts(sql),
    sql`select * from team_customers where team_id = ${TEAM_ID} order by id`,
    sql`select * from team_customer_contacts where team_id = ${TEAM_ID} order by id`,
  ]);
  const directory = path.join(process.cwd(), '.backups', 'marked-client-conversion');
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(directory, `${stamp}.json`);
  await writeFile(filePath, JSON.stringify({ generatedAt: new Date().toISOString(), teamId: TEAM_ID, contacts, customers, links }, null, 2), 'utf8');
  await chmod(filePath, 0o600);
  return filePath;
}

async function buildPreview() {
  const contacts = await fetchMarkedContacts(sql);
  const customers = await sql`select id, name, email, phone from team_customers where team_id = ${TEAM_ID} order by id`;
  return {
    mode: 'dry-run',
    markedContacts: contacts.length,
    alreadyLinked: contacts.filter((contact) => contact.linked_customer_ids.length > 0).length,
    confirmedExistingLinks: [...CONFIRMED_EXISTING_CUSTOMER.entries()].map(([contactId, customerId]) => ({ contactId, customerId })),
    sharedBusinessLinks: [...SHARED_NEW_CUSTOMER.entries()].map(([contactId, primaryContactId]) => ({ contactId, primaryContactId })),
    toCreate: contacts
      .filter((contact) => contact.linked_customer_ids.length === 0 && !CONFIRMED_EXISTING_CUSTOMER.has(Number(contact.id)) && !SHARED_NEW_CUSTOMER.has(Number(contact.id)))
      .map((contact) => ({ contactId: Number(contact.id), name: customerName(contact), phone: normalizedPhone(contact), email: contactEmail(contact) })),
    currentCustomers: customers.length,
  };
}

async function applyConversion(backupPath) {
  const generatedAt = new Date().toISOString();
  return sql.begin(async (tx) => {
    const contacts = await fetchMarkedContacts(tx);
    if (contacts.length !== 45) throw new Error(`Expected 45 marked contacts, found ${contacts.length}`);

    const customers = await tx`select * from team_customers where team_id = ${TEAM_ID} order by id for update`;
    const customerById = new Map(customers.map((customer) => [Number(customer.id), customer]));
    const customerIdsByPhone = new Map();
    const customerIdsByEmail = new Map();
    for (const customer of customers) {
      const pk = phoneKey(customer.phone);
      const ek = emailKey(customer.email);
      if (pk) customerIdsByPhone.set(pk, unique([...(customerIdsByPhone.get(pk) ?? []), Number(customer.id)]));
      if (ek) customerIdsByEmail.set(ek, unique([...(customerIdsByEmail.get(ek) ?? []), Number(customer.id)]));
    }

    const resolvedByContact = new Map();
    let created = 0;
    let newlyLinked = 0;
    let reusedExisting = 0;
    let enrichedCustomers = 0;
    let updatedContactNotes = 0;

    for (const contact of contacts) {
      const contactId = Number(contact.id);
      const linkedIds = contact.linked_customer_ids.map(Number);
      if (linkedIds.length > 1) throw new Error(`Contact ${contactId} has multiple customer links: ${linkedIds.join(', ')}`);

      let customerId = linkedIds[0] ?? null;
      if (!customerId && CONFIRMED_EXISTING_CUSTOMER.has(contactId)) {
        customerId = CONFIRMED_EXISTING_CUSTOMER.get(contactId);
      }
      if (!customerId && SHARED_NEW_CUSTOMER.has(contactId)) {
        customerId = resolvedByContact.get(SHARED_NEW_CUSTOMER.get(contactId));
        if (!customerId) throw new Error(`Primary contact not resolved before contact ${contactId}`);
      }

      if (!customerId) {
        const phoneMatches = customerIdsByPhone.get(phoneKey(contact.remote_jid)) ?? [];
        const emailMatches = customerIdsByEmail.get(contactEmail(contact)) ?? [];
        const exactMatches = unique([...phoneMatches, ...emailMatches]);
        if (exactMatches.length === 1) customerId = exactMatches[0];
        if (exactMatches.length > 1) throw new Error(`Ambiguous exact customer match for contact ${contactId}: ${exactMatches.join(', ')}`);
      }

      if (customerId && !customerById.has(Number(customerId))) {
        throw new Error(`Confirmed customer ${customerId} for contact ${contactId} does not exist`);
      }

      if (!customerId) {
        const [newCustomer] = await tx`
          insert into team_customers (
            team_id, name, email, phone, source, external_id, external_data,
            profile_image, status, notes, created_by, updated_by, created_at, updated_at
          ) values (
            ${TEAM_ID}, ${customerName(contact)}, ${contactEmail(contact)}, ${normalizedPhone(contact)},
            ${'crm_checkbox'}, ${`contact:${contactId}`},
            ${tx.json({ crmCustomerConversion: { source: SOURCE, convertedAt: generatedAt, checkboxField: CHECKBOX_KEY, contactIds: [contactId] } })},
            ${contact.profile_pic_url || null}, ${'active'}, ${''}, ${ACTOR_USER_ID}, ${ACTOR_USER_ID}, now(), now()
          )
          returning *
        `;
        customerId = Number(newCustomer.id);
        customerById.set(customerId, newCustomer);
        const pk = phoneKey(newCustomer.phone);
        const ek = emailKey(newCustomer.email);
        if (pk) customerIdsByPhone.set(pk, [customerId]);
        if (ek) customerIdsByEmail.set(ek, [customerId]);
        created += 1;
      } else if (!linkedIds.length) {
        reusedExisting += 1;
      }

      resolvedByContact.set(contactId, customerId);
      const customer = customerById.get(customerId);
      const marker = `[CRM Cliente · contacto #${contactId}]`;
      const block = customerNoteBlock(contact, generatedAt);
      const nextCustomerNotes = appendUniqueBlock(customer.notes, block, marker);
      const conversionData = customer.external_data?.crmCustomerConversion ?? {};
      const nextExternalData = {
        ...(customer.external_data ?? {}),
        crmCustomerConversion: {
          ...conversionData,
          source: SOURCE,
          convertedAt: conversionData.convertedAt || generatedAt,
          lastVerifiedAt: generatedAt,
          checkboxField: CHECKBOX_KEY,
          contactIds: unique([...(conversionData.contactIds ?? []), contactId]).map(Number).sort((a, b) => a - b),
        },
      };
      const nextEmail = customer.email || contactEmail(contact);
      const nextPhone = customer.phone || normalizedPhone(contact);
      const nextProfileImage = customer.profile_image || contact.profile_pic_url || null;

      await tx`
        update team_customers
        set email = ${nextEmail}, phone = ${nextPhone}, profile_image = ${nextProfileImage},
            notes = ${nextCustomerNotes}, external_data = ${tx.json(nextExternalData)},
            updated_by = ${ACTOR_USER_ID}, updated_at = now()
        where id = ${customerId} and team_id = ${TEAM_ID}
      `;
      customerById.set(customerId, { ...customer, email: nextEmail, phone: nextPhone, profile_image: nextProfileImage, notes: nextCustomerNotes, external_data: nextExternalData });
      enrichedCustomers += 1;

      const insertedLink = await tx`
        insert into team_customer_contacts (team_id, customer_id, contact_id)
        values (${TEAM_ID}, ${customerId}, ${contactId})
        on conflict (customer_id, contact_id) do nothing
        returning id
      `;
      if (insertedLink.length) newlyLinked += 1;

      const nextContactNotes = contactNote(contact, { id: customerId, name: customerById.get(customerId).name });
      if (nextContactNotes !== clean(contact.notes)) updatedContactNotes += 1;
      const nextCustomData = {
        ...(contact.custom_data ?? {}),
        customerConversion: {
          source: SOURCE,
          convertedAt: generatedAt,
          customerId,
          checkboxField: CHECKBOX_KEY,
        },
      };
      await tx`
        update contacts
        set notes = ${nextContactNotes}, custom_data = ${tx.json(nextCustomData)}, updated_at = now()
        where id = ${contactId} and team_id = ${TEAM_ID}
      `;
    }

    const verification = await tx`
      select c.id as contact_id, count(tcc.id)::int as links,
        c.notes, c.custom_data, max(tc.notes) as customer_notes
      from contacts c
      left join team_customer_contacts tcc on tcc.contact_id = c.id and tcc.team_id = c.team_id
      left join team_customers tc on tc.id = tcc.customer_id and tc.team_id = c.team_id
      where c.team_id = ${TEAM_ID}
        and lower(coalesce(c.custom_data ->> ${CHECKBOX_KEY}, 'false')) in ('true', '1', 'yes', 'si', 'sí')
      group by c.id
      order by c.id
    `;
    const invalid = verification.filter((row) => Number(row.links) !== 1 || !clean(row.notes) || !row.custom_data?.customerConversion?.customerId || !clean(row.customer_notes));
    if (verification.length !== 45 || invalid.length) {
      throw new Error(`Verification failed: ${verification.length} marked contacts, invalid IDs ${invalid.map((row) => row.contact_id).join(', ') || 'none'}`);
    }

    const uniqueCustomerIds = new Set([...resolvedByContact.values()]);
    const [audit] = await tx`
      insert into activity_logs (team_id, user_id, action, ip_address)
      values (
        ${TEAM_ID}, ${ACTOR_USER_ID},
        ${`customers.convert_marked_contacts:${JSON.stringify({ source: SOURCE, marked: contacts.length, uniqueCustomers: uniqueCustomerIds.size, created, reusedExisting, newlyLinked, enrichedCustomers, updatedContactNotes, backupPath })}`},
        ${'Codex/local'}
      )
      returning id
    `;

    return {
      mode: 'applied',
      backupPath,
      markedContacts: contacts.length,
      uniqueCustomers: uniqueCustomerIds.size,
      createdCustomers: created,
      reusedExistingCustomers: reusedExisting,
      newlyLinkedContacts: newlyLinked,
      enrichedCustomerNotes: enrichedCustomers,
      updatedContactNotes,
      auditLogId: Number(audit.id),
      mapping: [...resolvedByContact.entries()].map(([contactId, customerId]) => ({ contactId, customerId })),
    };
  });
}

try {
  if (!APPLY) {
    console.log(JSON.stringify(await buildPreview(), null, 2));
  } else {
    const backupPath = await createBackup();
    console.log(JSON.stringify(await applyConversion(backupPath), null, 2));
  }
} finally {
  await sql.end();
}
