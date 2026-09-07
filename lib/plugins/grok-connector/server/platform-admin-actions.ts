import 'server-only';

import { and, asc, eq, gte, ilike, isNotNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  teamCustomerContacts,
  teamCustomerStores,
  teamCustomers,
  teamDomains,
  teamSiteFiles,
  teamSites,
} from '@/lib/db/schema';
import { addCustomerNote, listCustomerNotes } from '@/lib/plugins/customers/server/notes';
import { listCustomersPendingPayment } from '@/lib/plugins/customers/server/pending-payment';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from './actions';
import { SITE_MAX_FILE_BYTES } from '@/lib/plugins/sites/server/constants';
import { mimeForPath } from '@/lib/plugins/sites/server/mime';
import { joinSitePath, normalizeSitePath, siteParentPath } from '@/lib/plugins/sites/server/paths';
import {
  createSite,
  getOwnedSite,
  listSites,
  updateSite,
} from '@/lib/plugins/sites/server/service';
import { applyExactTextPatches } from '@/lib/plugins/sites/server/text-patch';

const positiveId = { type: 'integer', minimum: 1 } as const;
const nullablePositiveId = { type: ['integer', 'null'], minimum: 1 } as const;
const siteFields = {
  name: { type: 'string', minLength: 1, maxLength: 120 },
  category: { type: ['string', 'null'], maxLength: 80 },
  slug: { type: 'string', minLength: 1, maxLength: 63 },
  subdomain: { type: ['string', 'null'], maxLength: 63 },
  custom_domain: { type: ['string', 'null'], maxLength: 253 },
  published: { type: 'boolean' },
  settings: { type: 'object', maxProperties: 100, additionalProperties: true },
} as const;

export const platformAdminReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_customer_notes',
    description:
      'Bitácora de un CLIENTE: notas internas del equipo y partes de trabajo que dejan las IA, con fecha y autor. action="list" (por defecto) devuelve el historial de más nuevo a más viejo. action="add" agrega una entrada; usá kind="report" cuando estés documentando tu propio trabajo sobre ese cliente (qué hiciste, qué encontraste, qué queda pendiente) y kind="note" cuando le estés dejando un mensaje al equipo. Podés dejar tantas como haga falta: no se pisan entre sí. Sirve especialmente para los clientes importados de AAPP SPACE que NO tienen conversación de WhatsApp: para esos, las notas internas del chat no existen y ésta es la única bitácora disponible. Para el id del cliente usá whatspro_list_records con resource="customers". OJO: no confundir con la nota suelta del contacto del CRM (whatspro_add_contact_note), que es un texto único que se va acumulando dentro de la ficha del contacto.',
    inputSchema: {
      type: 'object',
      required: ['customer_id'],
      properties: {
        action: { type: 'string', enum: ['list', 'add'], default: 'list', description: 'list = leer la bitácora. add = agregar una entrada (requiere text).' },
        customer_id: { type: 'integer', minimum: 1, description: 'Id del cliente (resource="customers").' },
        text: { type: 'string', minLength: 1, maxLength: 10000, description: 'Texto de la entrada. Obligatorio con action="add".' },
        kind: { type: 'string', enum: ['note', 'report'], default: 'note', description: 'report = parte de trabajo tuyo; note = nota para el equipo.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Sólo con list: cuántas entradas traer. Por defecto 100.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_customers_pending_payment',
    description:
      'Clientes que están ESPERANDO PAGO O SEÑA: los que tienen ventas cargadas sin cobrar (en borrador o confirmadas, no pagadas). De cada uno devuelve cuántas ventas pendientes tiene, el total adeudado POR MONEDA (nunca suma monedas distintas entre sí) y la fecha de vencimiento más próxima, ordenados por lo que vence primero. Es lo que responde "¿a quién hay que cobrarle?", "¿quién me debe?", "armá los mensajes de cobranza de esta semana" o "¿qué está por vencer?". Los importes vienen en la unidad menor de cada moneda (centavos). Ojo: sale de las VENTAS cargadas en el sistema, así que un cliente que debe pero cuya venta nunca se registró no aparece acá; y las ventas cuyo contacto no está vinculado a ningún cliente quedan afuera porque no hay a quién atribuirlas. Después de esto podés usar whatspro_contact_graph para ver el historial del cliente antes de escribirle.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Cuántos clientes devolver, de vencimiento más próximo a más lejano. Por defecto todos.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_list_sites',
    description: 'Lista los sitios/proyectos del equipo con slug, subdominio, dominio personalizado, publicación, configuración y métricas de archivos.',
    inputSchema: {
      type: 'object',
      properties: { q: { type: 'string', maxLength: 120 }, include_unpublished: { type: 'boolean', default: true } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_list_site_files',
    description: 'Lista el árbol de archivos de un sitio. Puede limitarse a una carpeta o prefijo.',
    inputSchema: {
      type: 'object',
      required: ['site_id'],
      properties: { site_id: positiveId, path_prefix: { type: 'string', maxLength: 800 } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_read_site_file',
    description: 'Lee el contenido completo y devuelve expected_updated_at con precisión de base de datos para editar o parchar sin pisar cambios concurrentes. Acepta file_id o path.',
    inputSchema: {
      type: 'object',
      required: ['site_id'],
      properties: { site_id: positiveId, file_id: positiveId, path: { type: 'string', minLength: 1, maxLength: 800 } },
      anyOf: [{ required: ['file_id'] }, { required: ['path'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_domains_expiring',
    description:
      'Dominios por vencer (o ya vencidos) en una ventana de días, ordenados por fecha de vencimiento, con registrador, precio de renovación, auto-renovación y el cliente vinculado con su nombre resuelto. Es la tool para "¿qué dominios se vencen antes de fin de mes y de quién son?" — la pregunta que decide a quién hay que cobrarle la renovación. Los dominios sin fecha de vencimiento no aparecen (cargásela con whatspro_manage_domain).',
    inputSchema: {
      type: 'object',
      properties: {
        within_days: { type: 'integer', minimum: 0, maximum: 365, default: 45, description: 'Ventana hacia adelante en días.' },
        include_expired: { type: 'boolean', default: true, description: 'Incluir los que ya vencieron.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Solo los dominios de ese cliente.' },
        status: { type: 'string', maxLength: 30, description: 'Filtra por estado del dominio (ej. "active").' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sites_list_by_domain',
    description:
      'Resuelve el triángulo dominio ↔ sitio/tienda ↔ cliente: para un dominio dice qué sitio del equipo o qué tienda de cliente (AAPP) responde ahí y de qué cliente es; para un cliente lista todos sus dominios, sitios y tiendas con sus URLs. Es la tool para "¿de quién es tal dominio?", "¿qué responde en esa URL?" o "¿qué presencia web tiene este cliente?". Sin parámetros lista todos los cruces del equipo.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', maxLength: 253, description: 'Dominio a resolver (con o sin www).' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa: todos los dominios/sitios/tiendas de ese cliente.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_list_domains',
    description: 'Lista los dominios administrados del equipo, con registrador, renovación, cliente y vencimiento.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', maxLength: 255 },
        status: { type: 'string', enum: ['active', 'expiring_soon', 'expired', 'transferred'] },
      },
      additionalProperties: false,
    },
  },
];

export const platformAdminActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_manage_site',
    description: 'Crea, configura, publica, cambia slug/subdominio/dominio personalizado o elimina un sitio. delete requiere confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        site_id: positiveId,
        ...siteFields,
        initial_files: {
          type: 'array',
          maxItems: 200,
          description: 'Archivos de texto iniciales para crear el proyecto sin depender de una plantilla.',
          items: {
            type: 'object',
            required: ['path', 'content'],
            properties: {
              path: { type: 'string', minLength: 1, maxLength: 800 },
              content: { type: 'string', maxLength: SITE_MAX_FILE_BYTES },
            },
            additionalProperties: false,
          },
        },
        confirm: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_site_file',
    description: 'Crea archivos/carpetas, reemplaza contenido completo, renombra, mueve o elimina nodos del sitio. Para cambios parciales usa whatspro_patch_site_file.',
    inputSchema: {
      type: 'object',
      required: ['action', 'site_id'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        site_id: positiveId,
        file_id: positiveId,
        path: { type: 'string', minLength: 1, maxLength: 800 },
        kind: { type: 'string', enum: ['file', 'folder'] },
        name: { type: 'string', minLength: 1, maxLength: 180 },
        parent_path: { type: 'string', maxLength: 800 },
        content: { type: 'string', maxLength: SITE_MAX_FILE_BYTES },
        expected_updated_at: { type: 'string', format: 'date-time' },
        confirm: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_patch_site_file',
    description: 'Aplica reemplazos exactos y parciales a un archivo de código. Exige expected_updated_at para evitar sobrescribir cambios concurrentes y valida el número de coincidencias.',
    inputSchema: {
      type: 'object',
      required: ['site_id', 'expected_updated_at', 'patches'],
      properties: {
        site_id: positiveId,
        file_id: positiveId,
        path: { type: 'string', minLength: 1, maxLength: 800 },
        expected_updated_at: { type: 'string', format: 'date-time' },
        patches: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            required: ['search', 'replace'],
            properties: {
              search: { type: 'string', minLength: 1, maxLength: SITE_MAX_FILE_BYTES },
              replace: { type: 'string', maxLength: SITE_MAX_FILE_BYTES },
              expected_occurrences: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
            },
            additionalProperties: false,
          },
        },
      },
      anyOf: [{ required: ['file_id'] }, { required: ['path'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_domain',
    description: 'Crea, edita o elimina un dominio del equipo, incluida su configuración de renovación, estado, cliente, precio y notas.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        domain_id: positiveId,
        name: { type: 'string', minLength: 1, maxLength: 255 },
        registrar: { type: ['string', 'null'], maxLength: 100 },
        expires_at: { type: ['string', 'null'], format: 'date-time' },
        registered_at: { type: ['string', 'null'], format: 'date-time' },
        auto_renew: { type: 'boolean' },
        status: { type: 'string', enum: ['active', 'expiring_soon', 'expired', 'transferred'] },
        contact_id: nullablePositiveId,
        customer_id: nullablePositiveId,
        notes: { type: 'string', maxLength: 20000 },
        price: { type: ['integer', 'null'], minimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        tags: { type: 'array', maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 80 } },
        notify_days_before: { type: 'integer', minimum: 1, maximum: 3650 },
        confirm: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_customer',
    description:
      'Crea, edita, archiva o elimina un cliente del equipo, con su ficha de empresa (rubro, sitio, tamaño, facturación anual, ubicación y desde cuándo es cliente). '
      + 'Mantiene el aislamiento de tenant y delete requiere confirm=true. Mandá sólo los campos que querés cambiar: lo que no viaja se conserva.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'archive', 'delete'] },
        customer_id: positiveId,
        name: { type: 'string', minLength: 1, maxLength: 200 },
        email: { type: ['string', 'null'], format: 'email', maxLength: 255 },
        phone: { type: ['string', 'null'], maxLength: 80 },
        status: { type: 'string', enum: ['active', 'inactive', 'archived'] },
        notes: { type: 'string', maxLength: 10000 },
        profile_image: { type: ['string', 'null'], maxLength: 2000 },
        industry: { type: ['string', 'null'], maxLength: 60, description: 'Rubro o industria.' },
        website: { type: ['string', 'null'], maxLength: 255 },
        employees: { type: ['integer', 'null'], minimum: 0, description: 'Cantidad de empleados.' },
        annual_revenue: { type: ['integer', 'null'], minimum: 0, description: 'Facturación anual, en unidades enteras de la moneda con la que trabaja el equipo. No se convierte ni se suma con otras monedas.' },
        location: { type: ['string', 'null'], maxLength: 160 },
        customer_since: { type: ['string', 'null'], format: 'date-time', description: 'Desde cuándo es cliente. ISO 8601; null lo borra.' },
        confirm: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_link_customer_contact',
    description: 'Vincula o desvincula un contacto CRM y un cliente del mismo equipo.',
    inputSchema: {
      type: 'object',
      required: ['action', 'customer_id', 'contact_id'],
      properties: {
        action: { type: 'string', enum: ['link', 'unlink'] },
        customer_id: positiveId,
        contact_id: positiveId,
      },
      additionalProperties: false,
    },
  },
];

const siteListSchema = z.object({ q: z.string().trim().max(120).optional(), include_unpublished: z.boolean().default(true) });
const siteFileReferenceShape = {
  site_id: z.number().int().positive(),
  file_id: z.number().int().positive().optional(),
  path: z.string().min(1).max(800).optional(),
};
const siteFileReferenceSchema = z.object(siteFileReferenceShape)
  .refine((value) => value.file_id != null || value.path != null, 'file_id or path is required');
const siteFileListSchema = z.object({ site_id: z.number().int().positive(), path_prefix: z.string().max(800).optional() });
const settingsSchema = z.record(z.string(), z.unknown()).refine(
  (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 32 * 1024,
  'settings cannot exceed 32 KB',
);
const manageSiteSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  site_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  slug: z.string().trim().min(1).max(63).optional(),
  subdomain: z.string().trim().max(63).nullable().optional(),
  custom_domain: z.string().trim().max(253).nullable().optional(),
  published: z.boolean().optional(),
  settings: settingsSchema.optional(),
  initial_files: z.array(z.object({
    path: z.string().min(1).max(800),
    content: z.string().max(SITE_MAX_FILE_BYTES),
  })).max(200).optional(),
  confirm: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action !== 'create' && !data.site_id) ctx.addIssue({ code: 'custom', message: 'site_id is required', path: ['site_id'] });
  if (data.action === 'delete' && data.confirm !== true) ctx.addIssue({ code: 'custom', message: 'confirm=true is required for delete', path: ['confirm'] });
});
const manageFileSchema = z.object({
  ...siteFileReferenceShape,
  action: z.enum(['create', 'update', 'delete']),
  kind: z.enum(['file', 'folder']).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  parent_path: z.string().max(800).optional(),
  content: z.string().max(SITE_MAX_FILE_BYTES).optional(),
  expected_updated_at: z.string().datetime().optional(),
  confirm: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create') {
    if (!data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
    if (!data.kind) ctx.addIssue({ code: 'custom', message: 'kind is required for create', path: ['kind'] });
  } else if (data.file_id == null && data.path == null) {
    ctx.addIssue({ code: 'custom', message: 'file_id or path is required', path: ['file_id'] });
  }
  if (data.action === 'delete' && data.confirm !== true) ctx.addIssue({ code: 'custom', message: 'confirm=true is required for delete', path: ['confirm'] });
});
const patchFileSchema = z.object({
  ...siteFileReferenceShape,
  expected_updated_at: z.string().datetime(),
  patches: z.array(z.object({
    search: z.string().min(1).max(SITE_MAX_FILE_BYTES),
    replace: z.string().max(SITE_MAX_FILE_BYTES),
    expected_occurrences: z.number().int().min(1).max(1000).default(1),
  })).min(1).max(50),
}).refine((value) => value.file_id != null || value.path != null, 'file_id or path is required');
const domainListSchema = z.object({
  q: z.string().trim().max(255).optional(),
  status: z.enum(['active', 'expiring_soon', 'expired', 'transferred']).optional(),
});
const nullableDate = z.string().datetime().nullable().optional();
const manageDomainSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  domain_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  registrar: z.string().trim().max(100).nullable().optional(),
  expires_at: nullableDate,
  registered_at: nullableDate,
  auto_renew: z.boolean().optional(),
  status: z.enum(['active', 'expiring_soon', 'expired', 'transferred']).optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(20000).optional(),
  price: z.number().int().min(0).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  notify_days_before: z.number().int().min(1).max(3650).optional(),
  confirm: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action !== 'create' && !data.domain_id) ctx.addIssue({ code: 'custom', message: 'domain_id is required', path: ['domain_id'] });
  if (data.action === 'delete' && data.confirm !== true) ctx.addIssue({ code: 'custom', message: 'confirm=true is required for delete', path: ['confirm'] });
});
const manageCustomerSchema = z.object({
  action: z.enum(['create', 'update', 'archive', 'delete']),
  customer_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  notes: z.string().max(10000).optional(),
  profile_image: z.string().trim().max(2000).nullable().optional(),
  industry: z.string().trim().max(60).nullable().optional(),
  website: z.string().trim().max(255).nullable().optional(),
  employees: z.number().int().min(0).nullable().optional(),
  annual_revenue: z.number().int().min(0).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  customer_since: z.string().datetime().nullable().optional(),
  confirm: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action !== 'create' && !data.customer_id) ctx.addIssue({ code: 'custom', message: 'customer_id is required', path: ['customer_id'] });
  if (data.action === 'delete' && data.confirm !== true) ctx.addIssue({ code: 'custom', message: 'confirm=true is required for delete', path: ['confirm'] });
});
const customerContactSchema = z.object({
  action: z.enum(['link', 'unlink']),
  customer_id: z.number().int().positive(),
  contact_id: z.number().int().positive(),
});

async function ownedFile(context: GrokActionContext, data: { site_id: number; file_id?: number; path?: string }) {
  const path = data.path ? normalizeSitePath(data.path) : undefined;
  const file = await db.query.teamSiteFiles.findFirst({
    where: and(
      eq(teamSiteFiles.teamId, context.teamId),
      eq(teamSiteFiles.siteId, data.site_id),
      data.file_id != null ? eq(teamSiteFiles.id, data.file_id) : eq(teamSiteFiles.path, path!),
    ),
  });
  if (!file) throw new Error('Site file not found.');
  return file;
}

function assertExpectedVersion(updatedAt: Date, expected?: string) {
  if (expected && updatedAt.getTime() !== new Date(expected).getTime()) {
    throw new Error('El archivo cambió desde la última lectura. Volvé a leerlo antes de editar.');
  }
}

async function touchSite(context: GrokActionContext, siteId: number) {
  await db.update(teamSites).set({ updatedBy: context.userId, updatedAt: new Date() })
    .where(and(eq(teamSites.id, siteId), eq(teamSites.teamId, context.teamId)));
}

async function listSiteFiles(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'sitesRead', 'sites');
  const data = parse(siteFileListSchema, input);
  if (!(await getOwnedSite(data.site_id, context.teamId))) throw new Error('Site not found.');
  const prefix = data.path_prefix ? normalizeSitePath(data.path_prefix, true) : '';
  const rows = await db.select({
    id: teamSiteFiles.id,
    path: teamSiteFiles.path,
    kind: teamSiteFiles.kind,
    mimeType: teamSiteFiles.mimeType,
    encoding: teamSiteFiles.encoding,
    sizeBytes: teamSiteFiles.sizeBytes,
    updatedAt: teamSiteFiles.updatedAt,
  }).from(teamSiteFiles).where(and(
    eq(teamSiteFiles.teamId, context.teamId),
    eq(teamSiteFiles.siteId, data.site_id),
    ...(prefix ? [ilike(teamSiteFiles.path, `${prefix}%`)] : []),
  )).orderBy(asc(teamSiteFiles.path));
  return { site_id: data.site_id, files: rows };
}

async function readSiteFile(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'sitesRead', 'sites');
  const data = parse(siteFileReferenceSchema, input);
  const file = await ownedFile(context, data);
  if (file.kind !== 'file') throw new Error('The selected node is a folder.');
  const [version] = await db.select({
    expectedUpdatedAt: sql<string>`to_char(${teamSiteFiles.updatedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(teamSiteFiles).where(and(
    eq(teamSiteFiles.id, file.id),
    eq(teamSiteFiles.teamId, context.teamId),
  )).limit(1);
  return {
    ...file,
    expected_updated_at: version.expectedUpdatedAt,
    editable: file.encoding === 'utf8',
    content: file.encoding === 'utf8' ? file.content ?? '' : null,
  };
}

async function manageSite(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'sitesWrite', 'sites');
  const data = parse(manageSiteSchema, input);
  if (data.action === 'create') {
    const normalizedInitialFiles = data.initial_files?.map((file) => ({
      ...file,
      path: normalizeSitePath(file.path),
    })) ?? [];
    if (new Set(normalizedInitialFiles.map((file) => file.path)).size !== normalizedInitialFiles.length) {
      throw new Error('initial_files contains duplicate paths.');
    }
    const created = await createSite({
      teamId: context.teamId,
      userId: context.userId,
      name: data.name!,
      category: data.category,
      requestedSlug: data.slug,
    });
    const needsUpdate = data.subdomain !== undefined || data.custom_domain !== undefined || data.published !== undefined || data.settings !== undefined;
    const site = needsUpdate ? await updateSite({
      siteId: created.id,
      teamId: context.teamId,
      userId: context.userId,
      subdomain: data.subdomain,
      customDomain: data.custom_domain,
      published: data.published,
      settings: data.settings,
    }) : created;
    if (normalizedInitialFiles.length) {
      for (const file of normalizedInitialFiles) {
        await db.insert(teamSiteFiles).values({
          teamId: context.teamId,
          siteId: created.id,
          path: file.path,
          kind: 'file',
          mimeType: mimeForPath(file.path),
          encoding: 'utf8',
          content: file.content,
          sizeBytes: Buffer.byteLength(file.content),
          createdBy: context.userId,
          updatedBy: context.userId,
        }).onConflictDoUpdate({
          target: [teamSiteFiles.siteId, teamSiteFiles.path],
          set: {
            kind: 'file',
            mimeType: mimeForPath(file.path),
            encoding: 'utf8',
            content: file.content,
            sizeBytes: Buffer.byteLength(file.content),
            updatedBy: context.userId,
            updatedAt: new Date(),
          },
        });
      }
      await touchSite(context, created.id);
      await audit(context, 'connector.site.initial_files.created', created.id);
    }
    return { success: true, created: true, site };
  }
  if (data.action === 'delete') {
    const [deleted] = await db.delete(teamSites).where(and(
      eq(teamSites.id, data.site_id!), eq(teamSites.teamId, context.teamId),
    )).returning({ id: teamSites.id });
    if (!deleted) throw new Error('Site not found.');
    await audit(context, 'connector.site.deleted', deleted.id);
    return { success: true, deleted: true, site_id: deleted.id };
  }
  const site = await updateSite({
    siteId: data.site_id!, teamId: context.teamId, userId: context.userId,
    name: data.name, category: data.category, slug: data.slug, subdomain: data.subdomain,
    customDomain: data.custom_domain, published: data.published, settings: data.settings,
  });
  if (!site) throw new Error('Site not found.');
  return { success: true, created: false, site };
}

async function moveSiteNode(
  context: GrokActionContext,
  node: typeof teamSiteFiles.$inferSelect,
  nextPath: string,
) {
  if (node.kind === 'folder' && (nextPath.startsWith(`${node.path}/`) || nextPath === node.path)) {
    throw new Error('No podés mover una carpeta dentro de sí misma.');
  }
  if (nextPath === node.path) return;
  const allNodes = await db.select().from(teamSiteFiles).where(and(
    eq(teamSiteFiles.teamId, context.teamId), eq(teamSiteFiles.siteId, node.siteId),
  ));
  const moving = allNodes.filter((item) => item.path === node.path || (node.kind === 'folder' && item.path.startsWith(`${node.path}/`)));
  const movingIds = new Set(moving.map((item) => item.id));
  const targetPaths = new Map(moving.map((item) => [
    item.id,
    item.path === node.path ? nextPath : `${nextPath}${item.path.slice(node.path.length)}`,
  ]));
  const occupied = new Set(allNodes.filter((item) => !movingIds.has(item.id)).map((item) => item.path));
  if ([...targetPaths.values()].some((target) => occupied.has(target))) throw new Error('Ya existe un archivo en la ruta de destino.');
  for (const item of moving) {
    const target = targetPaths.get(item.id)!;
    await db.update(teamSiteFiles).set({
      path: target,
      mimeType: item.kind === 'file' ? mimeForPath(target) : null,
      updatedBy: context.userId,
      updatedAt: new Date(),
    }).where(and(eq(teamSiteFiles.id, item.id), eq(teamSiteFiles.teamId, context.teamId)));
  }
}

async function manageSiteFile(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'sitesWrite', 'sites');
  const data = parse(manageFileSchema, input);
  if (!(await getOwnedSite(data.site_id, context.teamId))) throw new Error('Site not found.');
  if (data.action === 'create') {
    const nodePath = joinSitePath(data.parent_path ?? '', data.name!);
    const content = data.kind === 'file' ? data.content ?? '' : null;
    const [node] = await db.insert(teamSiteFiles).values({
      teamId: context.teamId,
      siteId: data.site_id,
      path: nodePath,
      kind: data.kind!,
      mimeType: data.kind === 'file' ? mimeForPath(nodePath) : null,
      encoding: 'utf8',
      content,
      sizeBytes: content == null ? 0 : Buffer.byteLength(content),
      createdBy: context.userId,
      updatedBy: context.userId,
    }).returning();
    await touchSite(context, data.site_id);
    await audit(context, 'connector.site_file.created', node.id);
    return { success: true, created: true, file: node };
  }
  const node = await ownedFile(context, data);
  assertExpectedVersion(node.updatedAt, data.expected_updated_at);
  if (data.action === 'delete') {
    const descendants = await db.select({ id: teamSiteFiles.id, path: teamSiteFiles.path }).from(teamSiteFiles).where(and(
      eq(teamSiteFiles.teamId, context.teamId), eq(teamSiteFiles.siteId, data.site_id),
    ));
    const ids = descendants.filter((item) => item.path === node.path || item.path.startsWith(`${node.path}/`)).map((item) => item.id);
    for (const id of ids) await db.delete(teamSiteFiles).where(and(eq(teamSiteFiles.id, id), eq(teamSiteFiles.teamId, context.teamId)));
    await touchSite(context, data.site_id);
    await audit(context, 'connector.site_file.deleted', node.id);
    return { success: true, deleted: true, file_id: node.id, deleted_nodes: ids.length };
  }
  if (data.content !== undefined && (node.kind !== 'file' || node.encoding !== 'utf8')) throw new Error('This node cannot be edited as text.');
  const nextName = data.name ?? node.path.split('/').pop()!;
  const nextParent = data.parent_path ?? siteParentPath(node.path);
  const nextPath = joinSitePath(nextParent, nextName);
  await moveSiteNode(context, node, nextPath);
  const [updated] = await db.update(teamSiteFiles).set({
    ...(data.content !== undefined ? { content: data.content, sizeBytes: Buffer.byteLength(data.content) } : {}),
    updatedBy: context.userId,
    updatedAt: new Date(),
  }).where(and(eq(teamSiteFiles.id, node.id), eq(teamSiteFiles.teamId, context.teamId))).returning();
  await touchSite(context, data.site_id);
  await audit(context, 'connector.site_file.updated', node.id);
  return { success: true, created: false, file: updated };
}

async function patchSiteFile(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'sitesWrite', 'sites');
  const data = parse(patchFileSchema, input);
  const node = await ownedFile(context, data);
  if (node.kind !== 'file' || node.encoding !== 'utf8') throw new Error('This node cannot be patched as text.');
  assertExpectedVersion(node.updatedAt, data.expected_updated_at);
  const content = applyExactTextPatches(node.content ?? '', data.patches.map((patch) => ({
    search: patch.search,
    replace: patch.replace,
    expectedOccurrences: patch.expected_occurrences,
  })));
  const [updated] = await db.update(teamSiteFiles).set({
    content,
    sizeBytes: Buffer.byteLength(content),
    updatedBy: context.userId,
    updatedAt: new Date(),
  }).where(and(
    eq(teamSiteFiles.id, node.id),
    eq(teamSiteFiles.teamId, context.teamId),
    sql`${teamSiteFiles.updatedAt} = (${data.expected_updated_at}::timestamptz AT TIME ZONE 'UTC')`,
  )).returning();
  if (!updated) throw new Error('El archivo cambió durante el parche. Volvé a leerlo antes de reintentar.');
  await touchSite(context, data.site_id);
  await audit(context, 'connector.site_file.patched', node.id);
  return { success: true, file: updated, patches_applied: data.patches.length };
}

async function listDomains(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'domainsRead', 'domains');
  const data = parse(domainListSchema, input);
  const conditions = [eq(teamDomains.teamId, context.teamId)];
  if (data.q) conditions.push(ilike(teamDomains.name, `%${data.q}%`));
  if (data.status) conditions.push(eq(teamDomains.status, data.status));
  const domains = await db.select().from(teamDomains).where(and(...conditions)).orderBy(asc(teamDomains.name));
  return { domains };
}

const domainsExpiringSchema = z.object({
  within_days: z.number().int().min(0).max(365).default(45),
  include_expired: z.boolean().default(true),
  customer_id: z.number().int().positive().optional(),
  status: z.string().trim().max(30).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

async function domainsExpiring(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'domainsRead', 'domains');
  const data = parse(domainsExpiringSchema, input);

  const horizon = new Date(Date.now() + data.within_days * 86400000);
  const now = new Date();
  // Comparaciones de fecha con los helpers de drizzle, no con SQL crudo: un
  // Date como parámetro crudo revienta en runtime (el build no lo detecta).
  const conditions = [
    eq(teamDomains.teamId, context.teamId),
    isNotNull(teamDomains.expiresAt),
    lte(teamDomains.expiresAt, horizon),
  ];
  if (!data.include_expired) conditions.push(gte(teamDomains.expiresAt, now));
  if (data.customer_id) conditions.push(eq(teamDomains.customerId, data.customer_id));
  if (data.status) conditions.push(eq(teamDomains.status, data.status));

  const rows = await db.select({
    domain: teamDomains,
    customerName: teamCustomers.name,
  })
    .from(teamDomains)
    .leftJoin(teamCustomers, eq(teamDomains.customerId, teamCustomers.id))
    .where(and(...conditions))
    .orderBy(asc(teamDomains.expiresAt))
    .limit(data.limit);

  const today = Date.now();
  return {
    object: 'domains_expiring',
    count: rows.length,
    within_days: data.within_days,
    domains: rows.map(({ domain, customerName }) => {
      const expiresAt = domain.expiresAt!;
      const daysLeft = Math.ceil((expiresAt.getTime() - today) / 86400000);
      return {
        id: domain.id,
        name: domain.name,
        registrar: domain.registrar,
        expires_at: expiresAt.toISOString().slice(0, 10),
        days_left: daysLeft,
        expired: daysLeft < 0,
        auto_renew: domain.autoRenew,
        status: domain.status,
        price: domain.price,
        currency: domain.currency,
        customer: domain.customerId ? { id: domain.customerId, name: customerName } : null,
        contact_id: domain.contactId,
        source: domain.source,
      };
    }),
  };
}

const sitesByDomainSchema = z.object({
  domain: z.string().trim().max(253).optional(),
  customer_id: z.number().int().positive().optional(),
});

/** Normaliza un dominio para comparar: minúsculas y sin "www.". */
function bareDomain(value: string) {
  return value.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

async function sitesListByDomain(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'domainsRead', 'domains');
  await assertPermission(context, 'sitesRead', 'sites');
  const data = parse(sitesByDomainSchema, input);

  const [domainRows, siteRows, storeRows] = await Promise.all([
    db.select({
      id: teamDomains.id,
      name: teamDomains.name,
      status: teamDomains.status,
      expiresAt: teamDomains.expiresAt,
      customerId: teamDomains.customerId,
      customerName: teamCustomers.name,
    }).from(teamDomains)
      .leftJoin(teamCustomers, eq(teamDomains.customerId, teamCustomers.id))
      .where(eq(teamDomains.teamId, context.teamId)),
    db.select({
      id: teamSites.id,
      title: teamSites.name,
      slug: teamSites.slug,
      subdomain: teamSites.subdomain,
      customDomain: teamSites.customDomain,
    }).from(teamSites).where(eq(teamSites.teamId, context.teamId)),
    db.select({
      id: teamCustomerStores.id,
      title: teamCustomerStores.title,
      cardUrl: teamCustomerStores.cardUrl,
      customDomain: teamCustomerStores.customDomain,
      customerId: teamCustomerStores.customerId,
      customerName: teamCustomers.name,
    }).from(teamCustomerStores)
      .leftJoin(teamCustomers, eq(teamCustomerStores.customerId, teamCustomers.id))
      .where(eq(teamCustomerStores.teamId, context.teamId)),
  ]);

  const wanted = data.domain ? bareDomain(data.domain) : null;

  const matches = domainRows
    .filter((row) => (wanted ? bareDomain(row.name) === wanted : true))
    .filter((row) => (data.customer_id ? row.customerId === data.customer_id : true))
    .map((row) => {
      const bare = bareDomain(row.name);
      const site = siteRows.find((candidate) => candidate.customDomain && bareDomain(candidate.customDomain) === bare) ?? null;
      const store = storeRows.find((candidate) => candidate.customDomain && bareDomain(candidate.customDomain) === bare) ?? null;
      return {
        domain: {
          id: row.id,
          name: row.name,
          status: row.status,
          expires_at: row.expiresAt ? row.expiresAt.toISOString().slice(0, 10) : null,
        },
        customer: row.customerId
          ? { id: row.customerId, name: row.customerName }
          : store?.customerId
            ? { id: store.customerId, name: store.customerName }
            : null,
        site: site ? { id: site.id, title: site.title, slug: site.slug, subdomain: site.subdomain } : null,
        store: store ? { id: store.id, title: store.title, card_url: store.cardUrl } : null,
      };
    });

  // Un cliente puede tener tiendas con dominio propio que no están cargadas en
  // teamDomains: se listan igual para que el triángulo cierre.
  const extraStores = data.customer_id
    ? storeRows.filter((store) => store.customerId === data.customer_id
      && !matches.some((match) => match.store?.id === store.id))
    : wanted
      ? storeRows.filter((store) => store.customDomain && bareDomain(store.customDomain) === wanted
        && !matches.some((match) => match.store?.id === store.id))
      : [];

  return {
    object: 'sites_by_domain',
    count: matches.length,
    matches,
    stores_without_domain_record: extraStores.map((store) => ({
      id: store.id,
      title: store.title,
      custom_domain: store.customDomain,
      card_url: store.cardUrl,
      customer: store.customerId ? { id: store.customerId, name: store.customerName } : null,
    })),
  };
}

async function assertDomainRelations(context: GrokActionContext, contactId?: number | null, customerId?: number | null) {
  if (contactId != null) {
    const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.id, contactId), eq(contacts.teamId, context.teamId)), columns: { id: true } });
    if (!contact) throw new Error('Contact not found.');
  }
  if (customerId != null) {
    const customer = await db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, context.teamId)), columns: { id: true } });
    if (!customer) throw new Error('Customer not found.');
  }
}

async function manageDomain(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'domainsWrite', 'domains');
  const data = parse(manageDomainSchema, input);
  if (data.action === 'delete') {
    const [deleted] = await db.delete(teamDomains).where(and(eq(teamDomains.id, data.domain_id!), eq(teamDomains.teamId, context.teamId))).returning({ id: teamDomains.id });
    if (!deleted) throw new Error('Domain not found.');
    await audit(context, 'connector.domain.deleted', deleted.id);
    return { success: true, deleted: true, domain_id: deleted.id };
  }
  await assertDomainRelations(context, data.contact_id, data.customer_id);
  const values = {
    ...(data.name !== undefined ? { name: data.name.toLowerCase() } : {}),
    ...(data.registrar !== undefined ? { registrar: data.registrar } : {}),
    ...(data.expires_at !== undefined ? { expiresAt: data.expires_at ? new Date(data.expires_at) : null } : {}),
    ...(data.registered_at !== undefined ? { registeredAt: data.registered_at ? new Date(data.registered_at) : null } : {}),
    ...(data.auto_renew !== undefined ? { autoRenew: data.auto_renew } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.contact_id !== undefined ? { contactId: data.contact_id } : {}),
    ...(data.customer_id !== undefined ? { customerId: data.customer_id } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.price !== undefined ? { price: data.price } : {}),
    ...(data.currency !== undefined ? { currency: data.currency.toUpperCase() } : {}),
    ...(data.tags !== undefined ? { tags: data.tags } : {}),
    ...(data.notify_days_before !== undefined ? { notifyDaysBefore: data.notify_days_before } : {}),
    updatedBy: context.userId,
    updatedAt: new Date(),
  };
  if (data.action === 'create') {
    const [domain] = await db.insert(teamDomains).values({
      teamId: context.teamId,
      name: data.name!.toLowerCase(),
      registrar: data.registrar ?? null,
      expiresAt: data.expires_at ? new Date(data.expires_at) : null,
      registeredAt: data.registered_at ? new Date(data.registered_at) : null,
      autoRenew: data.auto_renew ?? false,
      status: data.status ?? 'active',
      contactId: data.contact_id ?? null,
      customerId: data.customer_id ?? null,
      notes: data.notes ?? '',
      price: data.price ?? null,
      currency: (data.currency ?? 'USD').toUpperCase(),
      tags: data.tags ?? [],
      notifyDaysBefore: data.notify_days_before ?? 30,
      source: 'connector',
      createdBy: context.userId,
      updatedBy: context.userId,
    }).returning();
    await audit(context, 'connector.domain.created', domain.id);
    return { success: true, created: true, domain };
  }
  const [domain] = await db.update(teamDomains).set(values).where(and(
    eq(teamDomains.id, data.domain_id!), eq(teamDomains.teamId, context.teamId),
  )).returning();
  if (!domain) throw new Error('Domain not found.');
  await audit(context, 'connector.domain.updated', domain.id);
  return { success: true, created: false, domain };
}

async function manageCustomer(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'customersWrite', 'customers');
  const data = parse(manageCustomerSchema, input);
  if (data.action === 'delete') {
    const [deleted] = await db.delete(teamCustomers).where(and(eq(teamCustomers.id, data.customer_id!), eq(teamCustomers.teamId, context.teamId))).returning({ id: teamCustomers.id });
    if (!deleted) throw new Error('Customer not found.');
    await audit(context, 'connector.customer.deleted', deleted.id);
    return { success: true, deleted: true, customer_id: deleted.id };
  }
  if (data.action === 'create') {
    const [customer] = await db.insert(teamCustomers).values({
      teamId: context.teamId,
      name: data.name!,
      email: data.email ?? null,
      phone: data.phone ?? null,
      source: 'connector',
      status: data.status ?? 'active',
      notes: data.notes ?? '',
      profileImage: data.profile_image ?? null,
      industry: data.industry ?? null,
      website: data.website ?? null,
      employees: data.employees ?? null,
      annualRevenue: data.annual_revenue ?? null,
      location: data.location ?? null,
      customerSince: data.customer_since ? new Date(data.customer_since) : null,
      createdBy: context.userId,
      updatedBy: context.userId,
    }).returning();
    await audit(context, 'connector.customer.created', customer.id);
    return { success: true, created: true, customer };
  }
  const [customer] = await db.update(teamCustomers).set({
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.email !== undefined ? { email: data.email } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.action === 'archive' ? { status: 'archived' } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.profile_image !== undefined ? { profileImage: data.profile_image } : {}),
    ...(data.industry !== undefined ? { industry: data.industry } : {}),
    ...(data.website !== undefined ? { website: data.website } : {}),
    ...(data.employees !== undefined ? { employees: data.employees } : {}),
    ...(data.annual_revenue !== undefined ? { annualRevenue: data.annual_revenue } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.customer_since !== undefined
      ? { customerSince: data.customer_since ? new Date(data.customer_since) : null }
      : {}),
    updatedBy: context.userId,
    updatedAt: new Date(),
  }).where(and(eq(teamCustomers.id, data.customer_id!), eq(teamCustomers.teamId, context.teamId))).returning();
  if (!customer) throw new Error('Customer not found.');
  await audit(context, data.action === 'archive' ? 'connector.customer.archived' : 'connector.customer.updated', customer.id);
  return { success: true, created: false, customer };
}

async function linkCustomerContact(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'customersWrite', 'customers');
  const data = parse(customerContactSchema, input);
  const [customer, contact] = await Promise.all([
    db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.id, data.customer_id), eq(teamCustomers.teamId, context.teamId)), columns: { id: true } }),
    db.query.contacts.findFirst({ where: and(eq(contacts.id, data.contact_id), eq(contacts.teamId, context.teamId)), columns: { id: true } }),
  ]);
  if (!customer) throw new Error('Customer not found.');
  if (!contact) throw new Error('Contact not found.');
  if (data.action === 'link') {
    await db.insert(teamCustomerContacts).values({ teamId: context.teamId, customerId: customer.id, contactId: contact.id })
      .onConflictDoNothing({ target: [teamCustomerContacts.customerId, teamCustomerContacts.contactId] });
  } else {
    await db.delete(teamCustomerContacts).where(and(
      eq(teamCustomerContacts.teamId, context.teamId),
      eq(teamCustomerContacts.customerId, customer.id),
      eq(teamCustomerContacts.contactId, contact.id),
    ));
  }
  await audit(context, `connector.customer_contact.${data.action}`, `${customer.id}:${contact.id}`);
  return { success: true, linked: data.action === 'link', customer_id: customer.id, contact_id: contact.id };
}

export async function executePlatformAdminTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_customer_notes') {
    const data = parse(z.object({
      action: z.enum(['list', 'add']).default('list'),
      customer_id: z.number().int().positive(),
      text: z.string().trim().min(1).max(10000).optional(),
      kind: z.enum(['note', 'report']).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }), input);

    if (data.action === 'list') {
      await assertPermission(context, 'customersRead', 'customers');
      const notas = await listCustomerNotes(context.teamId, data.customer_id, data.limit ?? 100);
      return {
        action: 'list' as const,
        customer_id: data.customer_id,
        count: notas.length,
        notes: notas.map((nota) => ({
          id: nota.id,
          text: nota.text,
          kind: nota.kind,
          author: nota.source === 'connector' ? 'IA' : 'equipo',
          created_at: nota.createdAt,
        })),
      };
    }

    await assertPermission(context, 'customersWrite', 'customers');
    if (!data.text) throw new Error('Con action="add" tenés que mandar "text".');
    const nota = await addCustomerNote({
      teamId: context.teamId,
      customerId: data.customer_id,
      userId: context.userId,
      text: data.text,
      kind: data.kind ?? 'note',
      // Todo lo que entra por MCP lo escribió un conector, aunque createdBy
      // guarde al usuario que lo autorizó.
      source: 'connector',
    });
    if (!nota) throw new Error(`No existe el cliente ${data.customer_id} en este equipo.`);
    await audit(context, 'connector.customer.note_added', nota.id);
    return { action: 'add' as const, customer_id: data.customer_id, note: { id: nota.id, kind: nota.kind, created_at: nota.createdAt } };
  }
  if (name === 'whatspro_customers_pending_payment') {
    await assertPermission(context, 'customersRead', 'customers');
    const data = parse(z.object({ limit: z.number().int().min(1).max(200).optional() }), input);
    const rows = await listCustomersPendingPayment(context.teamId);
    const items = data.limit ? rows.slice(0, data.limit) : rows;
    return {
      total: rows.length,
      returned: items.length,
      note: 'Importes en la unidad menor de cada moneda (centavos). Los totales NO se suman entre monedas distintas. `totalsByCurrency` es lo que hay para cobrar; `cancelledByCurrency` son suscripciones dadas de baja y nunca cobradas: hay que procesarlas, pero NO son plata que vaya a entrar y no se suman al total.',
      customers: items,
    };
  }
  if (name === 'whatspro_list_sites') {
    await assertPermission(context, 'sitesRead', 'sites');
    const data = parse(siteListSchema, input);
    const q = data.q?.toLowerCase();
    const sites = (await listSites(context.teamId)).filter((site) =>
      (data.include_unpublished || site.published) &&
      (!q || [site.name, site.slug, site.subdomain, site.customDomain, site.category].some((value) => value?.toLowerCase().includes(q))),
    );
    return { sites };
  }
  if (name === 'whatspro_list_site_files') return listSiteFiles(input, context);
  if (name === 'whatspro_read_site_file') return readSiteFile(input, context);
  if (name === 'whatspro_list_domains') return listDomains(input, context);
  if (name === 'whatspro_domains_expiring') return domainsExpiring(input, context);
  if (name === 'whatspro_sites_list_by_domain') return sitesListByDomain(input, context);
  if (name === 'whatspro_manage_site') return manageSite(input, context);
  if (name === 'whatspro_manage_site_file') return manageSiteFile(input, context);
  if (name === 'whatspro_patch_site_file') return patchSiteFile(input, context);
  if (name === 'whatspro_manage_domain') return manageDomain(input, context);
  if (name === 'whatspro_manage_customer') return manageCustomer(input, context);
  if (name === 'whatspro_link_customer_contact') return linkCustomerContact(input, context);
  throw new Error(`Unknown platform administration tool: ${name}`);
}
