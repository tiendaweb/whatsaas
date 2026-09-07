/**
 * Valida el catálogo de tools MCP del conector ANTES de que lo rechace la API.
 *
 * Motivo: `whatspro_finance_summary` estuvo invisible para todas las IA porque
 * su `inputSchema` se armó esparciendo un objeto de ZOD dentro de JSON Schema.
 * La tool funcionaba; simplemente no se podía ver. El fallo no lo detecta ni el
 * typecheck (el spread es válido en TS) ni el build (el schema es `unknown`):
 * sólo aparece cuando un cliente MCP carga la lista y descarta la que rompe.
 *
 * Uso: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts
 */
import { grokActionTools } from '@/lib/plugins/grok-connector/server/actions';
import { grokExtendedActionTools } from '@/lib/plugins/grok-connector/server/extended-actions';
import { automationActionTools, automationReadTools } from '@/lib/plugins/grok-connector/server/automation-actions';
import { businessOsActionTools, businessOsReadTools } from '@/lib/plugins/grok-connector/server/business-os-actions';
import { platformAdminActionTools, platformAdminReadTools } from '@/lib/plugins/grok-connector/server/platform-admin-actions';
import { radarActionTools, radarReadTools } from '@/lib/plugins/grok-connector/server/radar-actions';
import { radarEngineActionTools, radarEngineReadTools } from '@/lib/plugins/grok-connector/server/radar-engine-actions';
import { businessThemeActionTools, businessThemeReadTools } from '@/lib/plugins/grok-connector/server/business-theme-actions';
import { tasksActionTools, tasksReadTools } from '@/lib/plugins/grok-connector/server/tasks-actions';
import { knowledgeActionTools, knowledgeReadTools } from '@/lib/plugins/grok-connector/server/knowledge-actions';
import { mediaActionTools, mediaReadTools } from '@/lib/plugins/grok-connector/server/media-actions';
import { documentsPortalActionTools, documentsPortalReadTools } from '@/lib/plugins/grok-connector/server/documents-portal-actions';
import { messagingActionTools } from '@/lib/plugins/grok-connector/server/messaging-actions';
import { operationsActionTools, operationsReadTools } from '@/lib/plugins/grok-connector/server/operations-actions';
import { salesOpsActionTools, salesOpsReadTools } from '@/lib/plugins/grok-connector/server/sales-ops-actions';
import { productionActionTools, productionReadTools } from '@/lib/plugins/grok-connector/server/production-actions';
import { devCenterActionTools, devCenterReadTools } from '@/lib/plugins/grok-connector/server/dev-center-actions';
import { notifyActionTools, notifyReadTools } from '@/lib/notifications/tools';
import { financeActionTools, financeReadTools } from '@/lib/plugins/grok-connector/server/finance-actions';
import { attachmentsActionTools, attachmentsReadTools } from '@/lib/plugins/grok-connector/server/attachments-actions';
import { checklistActionTools } from '@/lib/plugins/grok-connector/server/checklist-actions';
import { transcriptionActionTools, transcriptionReadTools } from '@/lib/plugins/grok-connector/server/transcription-actions';
import { linksActionTools, linksReadTools } from '@/lib/plugins/grok-connector/server/links-actions';
import { bulkActionTools, bulkReadTools } from '@/lib/plugins/grok-connector/server/bulk-actions';
import { dealsActionTools, dealsReadTools } from '@/lib/plugins/grok-connector/server/deals-actions';
import { detailReadTools } from '@/lib/plugins/grok-connector/server/detail-actions';
import { helpReadTools } from '@/lib/plugins/grok-connector/server/help-actions';
import { chatActionTools, chatReadTools } from '@/lib/plugins/grok-connector/server/chat-actions';
import { settingsActionTools, settingsReadTools } from '@/lib/plugins/grok-connector/server/settings-actions';
import { membershipsActionTools, membershipsReadTools } from '@/lib/plugins/grok-connector/server/memberships-actions';
import { calendarActionTools, calendarReadTools } from '@/lib/plugins/grok-connector/server/calendar-actions';
import { contentActionTools, contentReadTools } from '@/lib/plugins/grok-connector/server/content-actions';
import { readOnlyResources } from '@/lib/readonly-api/catalog';
import { readOnlyResourcePolicy } from '@/lib/readonly-api/resource-policies';
import {
  commandCenterActionTools,
  commandCenterReadTools,
  desktopActionTools,
  desktopReadTools,
} from '@/lib/plugins/grok-connector/server/desktop-actions';

const grupos: Array<[string, Array<{ name: string; description: string; inputSchema: unknown }>]> = [
  ['actions', grokActionTools],
  ['deals', [...dealsReadTools, ...dealsActionTools]],
  ['detail', detailReadTools],
  ['help', helpReadTools],
  ['extended', grokExtendedActionTools],
  ['automation', [...automationReadTools, ...automationActionTools]],
  ['business-os', [...businessOsReadTools, ...businessOsActionTools]],
  ['platform-admin', [...platformAdminReadTools, ...platformAdminActionTools]],
  ['radar', [...radarReadTools, ...radarActionTools]],
  ['radar-engine', [...radarEngineReadTools, ...radarEngineActionTools]],
  ['business-theme', [...businessThemeReadTools, ...businessThemeActionTools]],
  ['tasks', [...tasksReadTools, ...tasksActionTools]],
  ['knowledge', [...knowledgeReadTools, ...knowledgeActionTools]],
  ['media', [...mediaReadTools, ...mediaActionTools]],
  ['documents-portal', [...documentsPortalReadTools, ...documentsPortalActionTools]],
  ['messaging', messagingActionTools],
  ['operations', [...operationsReadTools, ...operationsActionTools]],
  ['sales-ops', [...salesOpsReadTools, ...salesOpsActionTools]],
  ['produccion', [...productionReadTools, ...productionActionTools]],
  ['dev-center', [...devCenterReadTools, ...devCenterActionTools]],
  ['notificaciones', [...notifyReadTools, ...notifyActionTools]],
  ['finance', [...financeReadTools, ...financeActionTools]],
  ['attachments', [...attachmentsReadTools, ...attachmentsActionTools]],
  ['checklist', checklistActionTools],
  ['transcription', [...transcriptionReadTools, ...transcriptionActionTools]],
  ['links', [...linksReadTools, ...linksActionTools]],
  ['bulk', [...bulkReadTools, ...bulkActionTools]],
  ['desktop', [...desktopReadTools, ...desktopActionTools]],
  ['command-center', [...commandCenterReadTools, ...commandCenterActionTools]],
  ['chat', [...chatReadTools, ...chatActionTools]],
  ['settings', [...settingsReadTools, ...settingsActionTools]],
  ['memberships', [...membershipsReadTools, ...membershipsActionTools]],
  ['calendar', [...calendarReadTools, ...calendarActionTools]],
  ['content', [...contentReadTools, ...contentActionTools]],
];

/** Palabras clave de JSON Schema cuyo valor DEBE ser numérico. */
const NUMERICAS = new Set([
  'maxLength', 'minLength', 'maxItems', 'minItems', 'maximum', 'minimum',
  'maxProperties', 'minProperties', 'multipleOf', 'exclusiveMaximum', 'exclusiveMinimum',
]);

const fallos: string[] = [];

function revisar(ruta: string, nodo: unknown, profundidad = 0) {
  if (profundidad > 30) return;
  if (nodo === null || typeof nodo !== 'object') return;
  if (Array.isArray(nodo)) {
    nodo.forEach((hijo, i) => revisar(`${ruta}[${i}]`, hijo, profundidad + 1));
    return;
  }

  for (const [clave, valor] of Object.entries(nodo as Record<string, unknown>)) {
    const aqui = `${ruta}.${clave}`;
    // Los internos de zod (`_def`, `~standard`, `_zod`) delatan que acá se
    // esparció un esquema de validación dentro de la descripción de la tool.
    if (clave.startsWith('_') || clave.startsWith('~')) {
      fallos.push(`${aqui}: clave interna de zod dentro del JSON Schema`);
    }
    if (typeof valor === 'function') {
      fallos.push(`${aqui}: función dentro del JSON Schema (no es serializable)`);
    }
    if (NUMERICAS.has(clave) && typeof valor !== 'number') {
      fallos.push(`${aqui}: "${clave}" debe ser número y es ${typeof valor}`);
    }
    revisar(aqui, valor, profundidad + 1);
  }
}

const vistos = new Set<string>();
let total = 0;

for (const [grupo, tools] of grupos) {
  for (const tool of tools) {
    total++;
    const ruta = `${grupo}/${tool.name}`;

    if (vistos.has(tool.name)) fallos.push(`${ruta}: nombre duplicado`);
    vistos.add(tool.name);

    if (!tool.description?.trim()) fallos.push(`${ruta}: sin descripción`);

    const schema = tool.inputSchema as Record<string, unknown> | undefined;
    if (!schema || schema.type !== 'object') {
      fallos.push(`${ruta}: inputSchema debe ser un objeto con type "object"`);
      continue;
    }

    // Round-trip: si al serializar y volver a parsear cambia, hay algo que no
    // es JSON puro (undefined, Date, Map, un esquema de zod…).
    let round: unknown;
    try {
      round = JSON.parse(JSON.stringify(schema));
    } catch (error) {
      fallos.push(`${ruta}: el schema no es serializable (${error instanceof Error ? error.message : error})`);
      continue;
    }
    if (JSON.stringify(round) !== JSON.stringify(schema)) {
      fallos.push(`${ruta}: el schema pierde información al serializarse`);
    }

    revisar(ruta, schema);
  }
}

/**
 * Todo recurso del catálogo de sólo lectura tiene que tener política declarada.
 * El chequeo es fail-closed: sin política no se sirve, así que un recurso nuevo
 * sin mapear se rompe de entrada en vez de quedar legible sin permiso.
 */
const sinPolitica = readOnlyResources.filter((recurso) => !readOnlyResourcePolicy(recurso.key));
for (const recurso of sinPolitica) {
  fallos.push(`recurso "${recurso.key}" sin política de lectura: agregalo a lib/readonly-api/resource-policies.ts`);
}

console.log(`Tools revisadas: ${total} (${vistos.size} nombres únicos)`);
console.log(`Recursos de sólo lectura: ${readOnlyResources.length} (todos con política: ${sinPolitica.length === 0 ? 'sí' : 'NO'})`);
if (fallos.length === 0) {
  console.log('✓ Todos los inputSchema son JSON Schema válido y serializable.');
  process.exit(0);
}
console.error(`\n✗ ${fallos.length} problema(s):`);
for (const fallo of fallos) console.error(`  - ${fallo}`);
process.exit(1);
