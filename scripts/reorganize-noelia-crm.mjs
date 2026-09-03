import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/root/whatsaas/package.json");
const postgres = require("postgres");

if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is required");

const TEAM_ID = 2;
const NOELIA_ID = 3;
const MARTIN_ID = 12;
const REORGANIZATION_DATE = "2026-07-27";
const REPORT_SLUG = "sistema-comercial-simplificado-aplicado-2026-07-27";

const SALES_GROUP_ID = 1;
const PRODUCTION_GROUP_ID = 2;
const CLIENTS_GROUP_ID = 7;
const UNANSWERED_GROUP_ID = 9;
const SALES_DEPARTMENT_ID = 1;
const PRODUCTION_DEPARTMENT_ID = 5;

const STAGES = [
  { id: 78, name: "Nuevo lead", emoji: "🆕", order: 1, primaryGroupId: SALES_GROUP_ID },
  { id: 27, name: "Conversando", emoji: "💬", order: 2, primaryGroupId: SALES_GROUP_ID },
  { id: 82, name: "Propuesta / presupuesto", emoji: "📄", order: 3, primaryGroupId: SALES_GROUP_ID },
  { id: 47, name: "Seguimiento", emoji: "⏳", order: 4, primaryGroupId: SALES_GROUP_ID },
  { id: 28, name: "Esperando seña", emoji: "💰", order: 5, primaryGroupId: SALES_GROUP_ID },
  { id: 29, name: "Pago a validar", emoji: "🧾", order: 6, primaryGroupId: SALES_GROUP_ID },
  { id: 30, name: "Perdido / no califica", emoji: "🚫", order: 7, primaryGroupId: SALES_GROUP_ID },
  { id: 21, name: "En producción", emoji: "🛠️", order: 8, primaryGroupId: PRODUCTION_GROUP_ID },
  { id: 7, name: "Esperando info del cliente", emoji: "📝", order: 9, primaryGroupId: PRODUCTION_GROUP_ID },
  { id: 86, name: "En revisión del cliente", emoji: "👀", order: 10, primaryGroupId: PRODUCTION_GROUP_ID },
  { id: 93, name: "Entregado", emoji: "✅", order: 11, primaryGroupId: PRODUCTION_GROUP_ID },
  { id: 90, name: "Mes en curso", emoji: "📆", order: 12, primaryGroupId: PRODUCTION_GROUP_ID },
  { id: 8, name: "Cliente activo", emoji: "😎", order: 13, primaryGroupId: CLIENTS_GROUP_ID },
  { id: null, name: "Cobro pendiente", emoji: "💵", order: 14, primaryGroupId: CLIENTS_GROUP_ID },
  { id: 89, name: "Renovación", emoji: "🔁", order: 15, primaryGroupId: CLIENTS_GROUP_ID },
  { id: 91, name: "Oportunidad / upsell", emoji: "⬆️", order: 16, primaryGroupId: CLIENTS_GROUP_ID },
  { id: 92, name: "Pausado / baja", emoji: "⏸️", order: 17, primaryGroupId: CLIENTS_GROUP_ID },
  { id: 94, name: "No contesto", emoji: "📭", order: 18, primaryGroupId: UNANSWERED_GROUP_ID },
  { id: 100, name: "Sin Contestar Marzo", emoji: "🗓️", order: 19, primaryGroupId: UNANSWERED_GROUP_ID },
  { id: 101, name: "Sin Contestar Abril", emoji: "🗓️", order: 20, primaryGroupId: UNANSWERED_GROUP_ID },
  { id: 102, name: "Sin Contestar Mayo", emoji: "🗓️", order: 21, primaryGroupId: UNANSWERED_GROUP_ID },
  { id: 103, name: "Sin Contestar Junio", emoji: "🗓️", order: 22, primaryGroupId: UNANSWERED_GROUP_ID },
  { id: 104, name: "Sin Contestar Julio", emoji: "🗓️", order: 23, primaryGroupId: UNANSWERED_GROUP_ID },
];

const TARGET_STAGE_BY_OLD_ID = new Map([
  [5, 93],
  [6, 27],
  [7, 7],
  [8, 8],
  [21, 21],
  [22, 21],
  [27, 27],
  [28, 28],
  [29, 29],
  [30, 30],
  [47, 47],
  [69, 21],
  [78, 78],
  [79, 27],
  [80, 27],
  [81, 82],
  [82, 82],
  [83, 47],
  [84, 47],
  [85, 47],
  [86, 86],
  [87, 86],
  [88, 93],
  [89, 89],
  [90, 90],
  [91, 91],
  [92, 92],
  [93, 93],
  [94, 94],
  [95, 78],
  [100, 100],
  [101, 101],
  [102, 102],
  [103, 103],
  [104, 104],
]);

const TAG_UPDATES = new Map([
  [1, { name: "Sitio Web · Membresía anual", color: "#2563eb" }],
  [2, { name: "Tienda Online · Membresía anual", color: "#2563eb" }],
  [3, { name: "Combo Sitio + Tienda · Membresía anual", color: "#2563eb" }],
  [5, { name: "Sitio Web · A medida", color: "#2563eb" }],
  [6, { name: "Tienda Online · A medida", color: "#2563eb" }],
  [7, { name: "Desarrollo a medida", color: "#2563eb" }],
  [8, { name: "ChatPro", color: "#16a34a" }],
  [9, { name: "Contenido · 3 piezas", color: "#16a34a" }],
  [10, { name: "Contenido · 6 piezas", color: "#16a34a" }],
  [11, { name: "Contenido · 9 piezas", color: "#16a34a" }],
  [12, { name: "Ads Meta", color: "#16a34a" }],
  [13, { name: "Ads Google", color: "#16a34a" }],
  [14, { name: "Carga de productos", color: "#2563eb" }],
  [20, { name: "Ficha de Google", color: "#2563eb" }],
  [21, { name: "Compra automática", color: "#2563eb" }],
  [26, { name: "Creación de redes", color: "#2563eb" }],
  [27, { name: "Origen · Visita presencial", color: "#d97706" }],
  [30, { name: "Creación de logo", color: "#2563eb" }],
  [31, { name: "Catálogo PDF", color: "#2563eb" }],
  [32, { name: "Gestión de redes sociales", color: "#16a34a" }],
  [33, { name: "Contenido para redes", color: "#16a34a" }],
]);

const DEPRECATED_TAG_IDS = [4, 16, 17, 18, 19, 23, 28, 29];
const DEPRECATED_TAG_NAMES = new Set([
  "Señado",
  "Pago Pendiente",
  "Membresía Activa",
  "Membresía Próxima a Vencer",
  "Membresía Vencida",
  "04/26",
  "Rediseño Gratis a Pro",
  "29-06",
]);
const ANNUAL_TAG_IDS = new Set([1, 2, 3]);
const ONE_OFF_TAG_IDS = new Set([5, 6, 7, 14, 20, 21, 26, 30, 31]);
const ALWAYS_MONTHLY_TAG_IDS = new Set([8, 32]);
const FLEXIBLE_RECURRING_TAG_IDS = new Set([9, 10, 11, 12, 13, 33]);
const MONTHLY_STAGE_IDS = new Set([8, 89, 90]);
const DELIVERED_STAGE_IDS = new Set([93]);
const MARTIN_STAGE_IDS = new Set([7, 21, 86, 90]);
const UNANSWERED_STAGE_IDS = new Set([94, 100, 101, 102, 103, 104]);

const GROUP_MEMBERSHIPS = new Map([
  [SALES_GROUP_ID, [78, 27, 82, 47, 28, 29, 30]],
  [PRODUCTION_GROUP_ID, [28, 21, 7, 86, 93, 90]],
  [CLIENTS_GROUP_ID, [93, 8, 90, "COBRO_STAGE_ID", 89, 91, 92]],
  [UNANSWERED_GROUP_ID, [94, 100, 101, 102, 103, 104]],
]);

const CUSTOM_FIELDS = [
  { name: "Tipo de servicio", key: "tipo_servicio", type: "text", position: 39 },
  { name: "Ciclo de cobro", key: "ciclo_cobro", type: "text", position: 40 },
  { name: "Importe mensual", key: "importe_mensual", type: "number", position: 41 },
  { name: "Fecha de alta del servicio", key: "fecha_alta_servicio", type: "date", position: 42 },
  { name: "Próxima renovación", key: "proxima_renovacion", type: "date", position: 43 },
  { name: "Origen del lead", key: "origen_lead", type: "text", position: 44 },
  { name: "Motivo de pérdida", key: "motivo_perdida", type: "text", position: 45 },
];

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

const unique = (values) => [...new Set(values.filter(Boolean))];

function synchronizeNote(notes, stageName, ownerName) {
  let value = String(notes ?? "").trim();
  const stageLine = `Estado actual: ${stageName}.`;
  const ownerLine = `Responsable actual: ${ownerName}.`;

  if (/^(?:Estado actual|Estado):.*$/im.test(value)) {
    value = value.replace(/^(?:Estado actual|Estado):.*$/im, stageLine);
  } else {
    value = `${value}\n${stageLine}`.trim();
  }

  if (/^Responsable actual:.*$/im.test(value)) {
    value = value.replace(/^Responsable actual:.*$/im, ownerLine);
  } else {
    value = `${value}\n${ownerLine}`.trim();
  }

  return value;
}

function cycleForContact(tagIds, targetStageId) {
  const cycles = [];
  if (tagIds.some((id) => ANNUAL_TAG_IDS.has(id)) || targetStageId === 89) cycles.push("Anual");
  if (tagIds.some((id) => ONE_OFF_TAG_IDS.has(id))) cycles.push("Único");
  if (tagIds.some((id) => ALWAYS_MONTHLY_TAG_IDS.has(id))) cycles.push("Mensual");
  if (tagIds.some((id) => FLEXIBLE_RECURRING_TAG_IDS.has(id))) {
    if (MONTHLY_STAGE_IDS.has(targetStageId)) cycles.push("Mensual");
    else if (DELIVERED_STAGE_IDS.has(targetStageId)) cycles.push("Único");
    else cycles.push("Por definir");
  }
  return unique(cycles).join(" + ") || null;
}

const text = (value, marks) => marks ? { type: "text", text: value, marks } : { type: "text", text: value };
const paragraph = (...content) => ({ type: "paragraph", content });
const heading = (level, value) => ({ type: "heading", attrs: { level }, content: [text(value)] });
const bold = (value) => text(value, [{ type: "bold" }]);
const bulletList = (items) => ({
  type: "bulletList",
  content: items.map((item) => ({ type: "listItem", content: [paragraph(text(item))] })),
});

function buildReport(stageCounts, totals) {
  const stageLines = STAGES.map((stage) => {
    const id = stage.id;
    return `${stage.emoji} ${stage.name}: ${stageCounts.get(id) ?? 0} contactos`;
  });

  const content = {
    type: "doc",
    content: [
      heading(1, "Sistema comercial simplificado — configuración aplicada"),
      paragraph(bold("Cuenta: "), text("noelia@whatspro.uno")),
      paragraph(bold("Fecha: "), text("27 de julio de 2026")),
      paragraph(text("Esta configuración reemplaza el embudo anterior. La etapa indica la próxima acción, la etiqueta indica el servicio y el responsable indica quién debe actuar.")),
      heading(2, "Resultado"),
      bulletList([
        `${totals.total} contactos organizados.`,
        "0 contactos sin etapa.",
        "0 contactos sin responsable.",
        "0 contactos sin grupo operativo.",
        "4 grupos de etapas, 23 etapas accionables y 2 grupos operativos.",
      ]),
      heading(2, "Grupos de trabajo"),
      bulletList([
        "🟦 Ventas · Noelia: nuevo lead, conversación, propuesta, seguimiento, seña, validación de pago y pérdida.",
        "🟨 Producción · Martín: trabajos aceptados, materiales, desarrollo, revisión, entrega y trabajo recurrente del mes.",
        "🟩 Clientes y renovaciones · Noelia: clientes activos, cobros, renovaciones, oportunidades y pausas.",
        "🗓️ Sin contestar por mes · Noelia: contactos sin respuesta separados por marzo, abril, mayo, junio, julio o sin mes definido.",
      ]),
      heading(2, "Etapas y contactos"),
      bulletList(stageLines),
      heading(2, "Reglas de uso"),
      bulletList([
        "Noelia conserva ventas, cobros, clientes y renovaciones. Martín recibe sólo tareas de producción o desarrollo.",
        "Nada pasa a En producción sin seña o aprobación comercial.",
        "Esperando info del cliente significa que Martín no puede continuar hasta recibir material o acceso.",
        "Mes en curso se usa para Ads Meta, contenido, mantenimiento u otro trabajo recurrente que Martín debe ejecutar.",
        "Cliente activo es la casa de una membresía anual o servicio mensual cuando no existe una acción pendiente.",
        "Renovación se usa antes del vencimiento; Cobro pendiente sólo después del vencimiento.",
        "La modalidad Anual, Mensual, Único o Por definir vive en el campo Ciclo de cobro; no se mezcla con la etapa.",
        "Las etapas mensuales conservan la cohorte original de contactos sin respuesta; Seguimiento queda reservado para oportunidades con conversación comercial previa.",
      ]),
      heading(2, "Servicios"),
      bulletList([
        "Membresías anuales: Sitio Web, Tienda Online y Combo Sitio + Tienda.",
        "Trabajos a medida: Sitio Web a medida, Tienda Online a medida, Desarrollo a medida y complementos puntuales.",
        "Ads Meta: una sola etiqueta de servicio; el campo Ciclo de cobro distingue mensual, único o todavía por definir.",
      ]),
      heading(2, "Rutina diaria"),
      bulletList([
        "Noelia: revisar Pago a validar → Esperando seña → Renovación → Seguimiento → Nuevo lead.",
        "Martín: revisar Esperando info → Mes en curso → En producción → En revisión del cliente.",
      ]),
      paragraph(text("Los documentos Reporte del sistema actual, Comparación actual vs propuesto y Embudo propuesto (2 personas) quedan como antecedente histórico. Este documento describe lo que está vigente.")),
    ],
  };

  const contentText = [
    "Sistema comercial simplificado — configuración aplicada",
    "Cuenta: noelia@whatspro.uno",
    "Fecha: 27 de julio de 2026",
    `${totals.total} contactos organizados; 0 sin etapa; 0 sin responsable; 0 sin grupo operativo.`,
    "Grupos: Ventas · Noelia; Producción · Martín; Clientes y renovaciones · Noelia; Sin contestar por mes · Noelia.",
    ...stageLines,
    "La etapa indica la próxima acción. La etiqueta indica el servicio. Ciclo de cobro distingue Anual, Mensual, Único o Por definir.",
  ].join("\n");

  return { content, contentText };
}

async function createBackup() {
  const [
    groups,
    stages,
    stageMembers,
    departments,
    departmentMembers,
    tags,
    contactTags,
    contacts,
    automations,
    customFields,
  ] = await Promise.all([
    sql`select * from funnel_stage_groups where team_id = ${TEAM_ID} order by id`,
    sql`select * from funnel_stages where team_id = ${TEAM_ID} order by id`,
    sql`
      select m.* from funnel_stage_group_members m
      join funnel_stage_groups g on g.id = m.group_id
      where g.team_id = ${TEAM_ID}
      order by m.id
    `,
    sql`select * from departments where team_id = ${TEAM_ID} order by id`,
    sql`
      select dm.* from department_members dm
      join departments d on d.id = dm.department_id
      where d.team_id = ${TEAM_ID}
      order by dm.id
    `,
    sql`select * from tags where team_id = ${TEAM_ID} order by id`,
    sql`
      select ct.* from contact_tags ct
      join contacts c on c.id = ct.contact_id
      where c.team_id = ${TEAM_ID}
      order by ct.id
    `,
    sql`
      select id, chat_id, name, assigned_user_id, assigned_department_id, funnel_stage_id,
        notes, custom_data, show_time_in_stage, created_at, updated_at
      from contacts
      where team_id = ${TEAM_ID}
      order by id
    `,
    sql`select id, name, nodes, edges, is_active, updated_at from automations where team_id = ${TEAM_ID} order by id`,
    sql`select * from custom_fields where team_id = ${TEAM_ID} order by id`,
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    purpose: "Backup previo a la reorganización del CRM de Noelia",
    teamId: TEAM_ID,
    groups,
    stages,
    stageMembers,
    departments,
    departmentMembers,
    tags,
    contactTags,
    contacts,
    automations,
    customFields,
  };

  const backupDirectory = path.join(process.cwd(), ".backups", "noelia-crm-reorganization");
  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `${stamp}.json`);
  await writeFile(backupPath, JSON.stringify(payload, null, 2), "utf8");
  await chmod(backupPath, 0o600);
  return backupPath;
}

async function main() {
  const backupPath = await createBackup();

  const result = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${TEAM_ID}, ${20260727})`;

    const members = await tx`
      select u.id, u.email
      from team_members tm
      join users u on u.id = tm.user_id
      where tm.team_id = ${TEAM_ID} and u.id in (${NOELIA_ID}, ${MARTIN_ID})
      order by u.id
    `;
    if (members.length !== 2 || members[0].id !== NOELIA_ID || members[1].id !== MARTIN_ID) {
      throw new Error("Noelia and Martin are not both members of team 2");
    }

    const [baseline] = await tx`
      select
        count(*)::int as total,
        count(*) filter (where funnel_stage_id is null)::int as without_stage
      from contacts
      where team_id = ${TEAM_ID}
    `;
    if (baseline.total < 1) throw new Error("No contacts found for team 2");

    await tx`
      insert into funnel_stage_groups (id, team_id, name, description, "order")
      values (
        ${UNANSWERED_GROUP_ID},
        ${TEAM_ID},
        ${"🗓️ Sin contestar por mes · Noelia"},
        ${"Contactos que no avanzaron, conservados por el mes de su consulta original."},
        4
      )
      on conflict (id) do nothing
    `;
    await tx`
      update funnel_stage_groups
      set name = ${"🟦 Ventas · Noelia"},
          description = ${"Leads, propuestas, seguimiento, cobros iniciales y cierres comerciales."},
          "order" = 1
      where id = ${SALES_GROUP_ID} and team_id = ${TEAM_ID}
    `;
    await tx`
      update funnel_stage_groups
      set name = ${"🟨 Producción · Martín"},
          description = ${"Trabajo aceptado: desarrollo, materiales, revisión, entrega y ejecución mensual."},
          "order" = 2
      where id = ${PRODUCTION_GROUP_ID} and team_id = ${TEAM_ID}
    `;
    await tx`
      update funnel_stage_groups
      set name = ${"🟩 Clientes y renovaciones · Noelia"},
          description = ${"Clientes activos, cobros, renovaciones, oportunidades y pausas."},
          "order" = 3
      where id = ${CLIENTS_GROUP_ID} and team_id = ${TEAM_ID}
    `;
    await tx`
      update funnel_stage_groups
      set name = ${"🗓️ Sin contestar por mes · Noelia"},
          description = ${"Contactos que no avanzaron, conservados por el mes de su consulta original."},
          "order" = 4
      where id = ${UNANSWERED_GROUP_ID} and team_id = ${TEAM_ID}
    `;

    const requiredGroupIds = [SALES_GROUP_ID, PRODUCTION_GROUP_ID, CLIENTS_GROUP_ID, UNANSWERED_GROUP_ID];
    const existingGroups = await tx`
      select id from funnel_stage_groups
      where team_id = ${TEAM_ID} and id in ${tx(requiredGroupIds)}
    `;
    if (existingGroups.length !== requiredGroupIds.length) {
      throw new Error("The four funnel groups were not found");
    }

    await tx`
      update departments
      set name = ${"Ventas y Clientes"},
          description = ${"Noelia: ventas, cobros, renovaciones y relación con clientes."}
      where id = ${SALES_DEPARTMENT_ID} and team_id = ${TEAM_ID}
    `;
    await tx`
      update departments
      set name = ${"Producción y Desarrollo"},
          description = ${"Martín: sitios, tiendas, desarrollos, revisiones y entregas."}
      where id = ${PRODUCTION_DEPARTMENT_ID} and team_id = ${TEAM_ID}
    `;

    let [cobroStage] = await tx`
      select id from funnel_stages
      where team_id = ${TEAM_ID} and name = ${"Cobro pendiente"}
      order by id
      limit 1
    `;
    if (!cobroStage) {
      [cobroStage] = await tx`
        insert into funnel_stages (team_id, group_id, name, emoji, "order")
        values (${TEAM_ID}, ${CLIENTS_GROUP_ID}, ${"Cobro pendiente"}, ${"💵"}, 14)
        returning id
      `;
    }
    const COBRO_STAGE_ID = cobroStage.id;
    STAGES.find((stage) => stage.id === null).id = COBRO_STAGE_ID;
    TARGET_STAGE_BY_OLD_ID.set(COBRO_STAGE_ID, COBRO_STAGE_ID);

    for (const stage of STAGES.filter((entry) => UNANSWERED_STAGE_IDS.has(entry.id))) {
      await tx`
        insert into funnel_stages (id, team_id, group_id, name, emoji, "order")
        values (
          ${stage.id},
          ${TEAM_ID},
          ${stage.primaryGroupId},
          ${stage.name},
          ${stage.emoji},
          ${stage.order}
        )
        on conflict (id) do nothing
      `;
    }

    for (const stage of STAGES) {
      const updated = await tx`
        update funnel_stages
        set name = ${stage.name},
            emoji = ${stage.emoji},
            "order" = ${stage.order},
            group_id = ${stage.primaryGroupId}
        where id = ${stage.id} and team_id = ${TEAM_ID}
        returning id
      `;
      if (updated.length !== 1) throw new Error(`Expected stage ${stage.id} was not found`);
    }

    const contacts = await tx`
      select
        c.id,
        c.funnel_stage_id,
        c.notes,
        c.custom_data,
        s.name as old_stage_name,
        coalesce(array_agg(distinct t.id) filter (where t.id is not null), array[]::int[]) as tag_ids,
        coalesce(array_agg(distinct t.name) filter (where t.id is not null), array[]::varchar[]) as tag_names
      from contacts c
      left join funnel_stages s on s.id = c.funnel_stage_id
      left join contact_tags ct on ct.contact_id = c.id
      left join tags t on t.id = ct.tag_id
      where c.team_id = ${TEAM_ID}
      group by c.id, c.funnel_stage_id, c.notes, c.custom_data, s.name
      order by c.id
    `;

    const stageById = new Map(STAGES.map((stage) => [stage.id, stage]));
    const contactTargets = new Map();
    const stageCounts = new Map(STAGES.map((stage) => [stage.id, 0]));

    for (const contact of contacts) {
      let targetStageId;
      const previousStageId = Number(contact.custom_data?.crmReorganization?.previousStageId);
      if (contact.funnel_stage_id === null) {
        targetStageId = 30;
      } else if (
        contact.funnel_stage_id === 47
        && UNANSWERED_STAGE_IDS.has(previousStageId)
      ) {
        targetStageId = previousStageId;
      } else if (
        contact.funnel_stage_id === 29
        && contact.custom_data?.comprobante_enviado !== true
        && contact.custom_data?.comprobante_enviado !== "true"
      ) {
        targetStageId = 86;
      } else {
        targetStageId = TARGET_STAGE_BY_OLD_ID.get(contact.funnel_stage_id);
      }
      if (!targetStageId || !stageById.has(targetStageId)) {
        throw new Error(`No target stage for contact ${contact.id}, old stage ${contact.funnel_stage_id}`);
      }

      const targetStage = stageById.get(targetStageId);
      const martinOwns = MARTIN_STAGE_IDS.has(targetStageId);
      const ownerId = martinOwns ? MARTIN_ID : NOELIA_ID;
      const ownerName = martinOwns ? "Martín" : "Noelia";
      const departmentId = martinOwns ? PRODUCTION_DEPARTMENT_ID : SALES_DEPARTMENT_ID;
      const tagIds = contact.tag_ids.map(Number);
      const deprecatedTags = contact.tag_names.filter((name) => DEPRECATED_TAG_NAMES.has(name));
      const serviceNames = tagIds
        .filter((id) => TAG_UPDATES.has(id))
        .map((id) => TAG_UPDATES.get(id).name)
        .filter((name) => !name.startsWith("Origen ·"));

      const origins = [];
      if (tagIds.includes(23)) origins.push("Importación 04/26");
      if (tagIds.includes(29)) origins.push("Importación 29-06");
      if (tagIds.includes(27)) origins.push("Visita presencial");

      const existingCustomData = contact.custom_data ?? {};
      const priorReorganization = existingCustomData.crmReorganization;
      const customData = {
        ...existingCustomData,
        ...(serviceNames.length ? { tipo_servicio: unique(serviceNames).join(" · ") } : {}),
        ...(cycleForContact(tagIds, targetStageId) ? { ciclo_cobro: cycleForContact(tagIds, targetStageId) } : {}),
        ...(origins.length && !existingCustomData.origen_lead ? { origen_lead: unique(origins).join(" + ") } : {}),
        ...(deprecatedTags.length ? {
          legacy_crm_tags: unique([
            ...(Array.isArray(existingCustomData.legacy_crm_tags) ? existingCustomData.legacy_crm_tags : []),
            ...deprecatedTags,
          ]),
        } : {}),
        ...(contact.funnel_stage_id === null && !existingCustomData.motivo_perdida
          ? { motivo_perdida: "Contacto interno o no comercial" }
          : {}),
        crmReorganization: priorReorganization ?? {
          date: REORGANIZATION_DATE,
          previousStageId: contact.funnel_stage_id,
          previousStageName: contact.old_stage_name,
        },
      };

      const notes = synchronizeNote(contact.notes, targetStage.name, ownerName);
      await tx`
        update contacts
        set funnel_stage_id = ${targetStageId},
            assigned_user_id = ${ownerId},
            assigned_department_id = ${departmentId},
            notes = ${notes},
            custom_data = ${tx.json(customData)},
            show_time_in_stage = true,
            updated_at = now()
        where id = ${contact.id} and team_id = ${TEAM_ID}
      `;
      contactTargets.set(contact.id, targetStageId);
      stageCounts.set(targetStageId, (stageCounts.get(targetStageId) ?? 0) + 1);
    }

    for (const [tagId, update] of TAG_UPDATES) {
      await tx`
        update tags
        set name = ${update.name}, color = ${update.color}
        where id = ${tagId} and team_id = ${TEAM_ID}
      `;
    }

    let [genericAnnualTag] = await tx`
      select id from tags
      where team_id = ${TEAM_ID} and name = ${"Membresía web/tienda · anual"}
      limit 1
    `;
    if (!genericAnnualTag) {
      [genericAnnualTag] = await tx`
        insert into tags (team_id, name, color)
        values (${TEAM_ID}, ${"Membresía web/tienda · anual"}, ${"#2563eb"})
        returning id
      `;
    }

    const renewalContactsWithoutProduct = await tx`
      select c.id
      from contacts c
      where c.team_id = ${TEAM_ID}
        and c.funnel_stage_id = ${89}
        and not exists (
          select 1
          from contact_tags ct
          where ct.contact_id = c.id
            and ct.tag_id in ${tx([...TAG_UPDATES.keys()].filter((id) => id !== 27))}
        )
    `;
    for (const contact of renewalContactsWithoutProduct) {
      await tx`
        insert into contact_tags (contact_id, tag_id)
        values (${contact.id}, ${genericAnnualTag.id})
        on conflict (contact_id, tag_id) do nothing
      `;
      await tx`
        update contacts
        set custom_data = coalesce(custom_data, ${tx.json({})})
          || ${tx.json({
            tipo_servicio: "Membresía web/tienda · anual",
            ciclo_cobro: "Anual",
          })}
        where id = ${contact.id} and team_id = ${TEAM_ID}
      `;
    }

    await tx`delete from tags where team_id = ${TEAM_ID} and id in ${tx(DEPRECATED_TAG_IDS)}`;

    for (const field of CUSTOM_FIELDS) {
      const updated = await tx`
        update custom_fields
        set name = ${field.name}, type = ${field.type}, position = ${field.position}
        where team_id = ${TEAM_ID} and key = ${field.key}
        returning id
      `;
      if (!updated.length) {
        await tx`
          insert into custom_fields (team_id, name, key, type, position)
          values (${TEAM_ID}, ${field.name}, ${field.key}, ${field.type}, ${field.position})
        `;
      }
    }

    const automationRows = await tx`
      select id, nodes
      from automations
      where team_id = ${TEAM_ID}
      for update
    `;
    let automationsUpdated = 0;
    for (const automation of automationRows) {
      const nodes = Array.isArray(automation.nodes) ? automation.nodes : [];
      let changed = false;
      const nextNodes = nodes.map((node) => {
        if (!node?.data || node.type !== "save_contact") return node;
        const data = { ...node.data };
        if (String(data.funnelStageId) === "79") {
          data.funnelStageId = "27";
          changed = true;
        }
        if (["2", "3", "4", "6"].includes(String(data.departmentId))) {
          data.departmentId = "1";
          changed = true;
        }
        if (String(data.tagId) === "16") {
          data.tagId = "null";
          changed = true;
        }
        return changed ? { ...node, data } : node;
      });
      if (changed) {
        await tx`
          update automations
          set nodes = ${tx.json(nextNodes)}, updated_at = now()
          where id = ${automation.id} and team_id = ${TEAM_ID}
        `;
        automationsUpdated += 1;
      }
    }

    await tx`
      delete from funnel_stage_group_members
      where group_id in (
        select id from funnel_stage_groups where team_id = ${TEAM_ID}
      )
    `;
    for (const [groupId, rawStageIds] of GROUP_MEMBERSHIPS) {
      const stageIds = rawStageIds.map((id) => id === "COBRO_STAGE_ID" ? COBRO_STAGE_ID : id);
      for (const [index, stageId] of stageIds.entries()) {
        await tx`
          insert into funnel_stage_group_members (group_id, stage_id, "order")
          values (${groupId}, ${stageId}, ${index + 1})
        `;
      }
    }

    const keepStageIds = STAGES.map((stage) => stage.id);
    await tx`
      delete from funnel_stages
      where team_id = ${TEAM_ID} and id not in ${tx(keepStageIds)}
    `;
    await tx`
      delete from funnel_stage_groups
      where team_id = ${TEAM_ID} and id not in ${tx(requiredGroupIds)}
    `;

    await tx`
      delete from department_members
      where department_id in (select id from departments where team_id = ${TEAM_ID})
    `;
    await tx`
      insert into department_members (department_id, user_id)
      values (${SALES_DEPARTMENT_ID}, ${NOELIA_ID}),
             (${PRODUCTION_DEPARTMENT_ID}, ${MARTIN_ID})
    `;
    await tx`
      delete from departments
      where team_id = ${TEAM_ID} and id not in (${SALES_DEPARTMENT_ID}, ${PRODUCTION_DEPARTMENT_ID})
    `;

    for (const stage of STAGES) {
      const actual = await tx`
        select count(*)::int as count
        from contacts
        where team_id = ${TEAM_ID} and funnel_stage_id = ${stage.id}
      `;
      stageCounts.set(stage.id, actual[0].count);
    }

    const [totals] = await tx`
      select
        count(*)::int as total,
        count(*) filter (where funnel_stage_id is null)::int as without_stage,
        count(*) filter (where assigned_user_id is null)::int as without_owner,
        count(*) filter (where assigned_department_id is null)::int as without_department,
        count(*) filter (where notes is null or btrim(notes) = '')::int as without_notes
      from contacts
      where team_id = ${TEAM_ID}
    `;
    const [structure] = await tx`
      select
        (select count(*)::int from funnel_stage_groups where team_id = ${TEAM_ID}) as groups,
        (select count(*)::int from funnel_stages where team_id = ${TEAM_ID}) as stages,
        (select count(*)::int from departments where team_id = ${TEAM_ID}) as departments
    `;
    if (
      totals.without_stage !== 0
      || totals.without_owner !== 0
      || totals.without_department !== 0
      || totals.without_notes !== 0
      || structure.groups !== 4
      || structure.stages !== 23
      || structure.departments !== 2
    ) {
      throw new Error(`Postcondition failed: ${JSON.stringify({ totals, structure })}`);
    }

    let [reportFolder] = await tx`
      select id from team_document_folders
      where team_id = ${TEAM_ID} and name = ${"Reportes"}
      order by id
      limit 1
    `;
    if (!reportFolder) {
      [reportFolder] = await tx`
        insert into team_document_folders (
          team_id, name, emoji, depth, position, created_by, updated_at
        )
        values (${TEAM_ID}, ${"Reportes"}, ${"📊"}, 1, 0, ${NOELIA_ID}, now())
        returning id
      `;
    }

    const report = buildReport(stageCounts, totals);
    const [existingReport] = await tx`
      select id, version
      from team_documents
      where team_id = ${TEAM_ID} and slug = ${REPORT_SLUG}
      limit 1
    `;
    let reportId;
    if (existingReport) {
      await tx`
        update team_documents
        set folder_id = ${reportFolder.id},
            title = ${"Sistema comercial simplificado — configuración aplicada"},
            emoji = ${"🧭"},
            content = ${tx.json(report.content)},
            content_text = ${report.contentText},
            version = ${existingReport.version + 1},
            updated_by = ${NOELIA_ID},
            updated_at = now()
        where id = ${existingReport.id}
      `;
      reportId = existingReport.id;
    } else {
      const [createdReport] = await tx`
        insert into team_documents (
          team_id, folder_id, title, slug, emoji, content, content_text,
          position, created_by, updated_by
        )
        values (
          ${TEAM_ID},
          ${reportFolder.id},
          ${"Sistema comercial simplificado — configuración aplicada"},
          ${REPORT_SLUG},
          ${"🧭"},
          ${tx.json(report.content)},
          ${report.contentText},
          0,
          ${NOELIA_ID},
          ${NOELIA_ID}
        )
        returning id
      `;
      reportId = createdReport.id;
    }

    const auditPayload = {
      source: "scripts/reorganize-noelia-crm.mjs",
      account: "noelia@whatspro.uno",
      date: REORGANIZATION_DATE,
      baseline,
      totals,
      structure,
      automationsUpdated,
      reportId,
      stageCounts: Object.fromEntries(
        STAGES.map((stage) => [stage.name, stageCounts.get(stage.id) ?? 0]),
      ),
      contactTargetHash: createHash("sha256")
        .update([...contactTargets.entries()].map(([id, stageId]) => `${id}:${stageId}`).join(","))
        .digest("hex"),
    };
    const [audit] = await tx`
      insert into activity_logs (team_id, user_id, action, ip_address)
      values (
        ${TEAM_ID},
        ${NOELIA_ID},
        ${`crm.simplified_for_two_people:${JSON.stringify(auditPayload)}`},
        ${"Codex/local"}
      )
      returning id
    `;

    return {
      backupPath,
      totals,
      structure,
      automationsUpdated,
      reportId,
      auditId: audit.id,
      stageCounts: auditPayload.stageCounts,
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} finally {
  await sql.end();
}
