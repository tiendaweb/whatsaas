import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { developerPrompts } from '@/lib/db/schema';
import { esMissionAgent, esMissionMode, type DevPromptRow, type MissionAgent, type MissionMode, type PromptVariable } from '../shared/types';

/**
 * Biblioteca de prompts técnicos del Centro de Desarrollo.
 *
 * Es aparte de las skills del Command Center comercial (`team_prompts`) a
 * propósito: aquéllas hablan de chats, clientes y cobros y las ejecuta el
 * motor de ventas; éstas hablan de repositorios, migraciones y despliegues y
 * las ejecuta un agente en una terminal o un conector. Mezclarlas en una sola
 * tabla hubiera hecho que el Prompt Studio comercial listara «migración
 * segura» al lado de «propuesta con precio».
 */

/**
 * Las reglas de la casa, al principio de cada prompt. Son las mismas que
 * rigen para una persona: leer antes de tocar, nada destructivo, typecheck
 * aparte, un solo despliegue, secretos jamás.
 */
export const REGLAS_DE_LA_CASA = [
  'REGLAS DE LA CASA (no negociables):',
  '1. Leé antes de tocar: `git status`, `git log -5 --oneline`, y el archivo entero antes de editarlo. No asumas rutas ni nombres: verificalos.',
  '2. Nunca `git reset --hard`, `git clean`, `rm -rf`, `DROP`, `TRUNCATE` ni `migrate:fresh`. Si hay cambios sin commitear de otra persona, no los pises.',
  '3. Typecheck aparte y con memoria: `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc --noEmit -p tsconfig.json`. El build NO chequea tipos (`NEXT_SKIP_TYPECHECK=1`).',
  '4. Migraciones con `psql` (`docker exec -i next_saas_starter_postgres psql -U postgres -d postgres`), registradas en `lib/db/migrations/meta/_journal.json`, con backfill pensado. Nunca `drizzle-kit migrate`.',
  '5. Se despliega UNA sola vez al final, con `NEXT_SKIP_TYPECHECK=1 pnpm run deploy:saasfy`; el servidor tiene 7,9 GB y el build se lleva 6: dos builds a la vez lo tiran.',
  '6. Nunca reveles ni copies secretos: `.env`, tokens, contraseñas, hashes. Si necesitás saber qué variables existen, `sed -E "s/=.*$/=***/" .env`.',
  '7. Comentarios y textos en castellano rioplatense, explicando el porqué, como el resto del repo. Sin commitear salvo que te lo pidan: reportá qué cambiaste y cómo lo verificaste.',
].join('\n');

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

function rowToPrompt(r: typeof developerPrompts.$inferSelect): DevPromptRow {
  return {
    id: r.id,
    key: r.key,
    title: r.title,
    body: r.body,
    description: r.description,
    agentDefault: esMissionAgent(r.agentDefault) ? r.agentDefault : 'claude',
    projectDefault: r.projectDefault,
    modeDefault: esMissionMode(r.modeDefault) ? r.modeDefault : 'editar',
    variables: Array.isArray(r.variables) ? (r.variables as PromptVariable[]).filter((v) => v && typeof v.key === 'string') : [],
    pinned: r.pinned,
    usageCount: r.usageCount,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listDevPrompts(teamId: number): Promise<DevPromptRow[]> {
  const rows = await db.select().from(developerPrompts).where(eq(developerPrompts.teamId, teamId)).orderBy(desc(developerPrompts.pinned), desc(developerPrompts.usageCount), desc(developerPrompts.updatedAt));
  return rows.map(rowToPrompt);
}

export async function getDevPrompt(teamId: number, ref: { id?: number; key?: string }): Promise<DevPromptRow | null> {
  const row = await db.query.developerPrompts.findFirst({
    where: and(eq(developerPrompts.teamId, teamId), ref.id ? eq(developerPrompts.id, ref.id) : eq(developerPrompts.key, ref.key ?? '')),
  });
  return row ? rowToPrompt(row) : null;
}

export type UpsertDevPromptInput = {
  id?: number;
  key?: string;
  title: string;
  body: string;
  description?: string | null;
  agentDefault?: MissionAgent;
  projectDefault?: string | null;
  modeDefault?: MissionMode;
  variables?: PromptVariable[];
  pinned?: boolean;
};

export async function upsertDevPrompt(teamId: number, userId: number, input: UpsertDevPromptInput): Promise<DevPromptRow> {
  const title = input.title.trim().slice(0, 160);
  if (title.length < 2) throw new Error('El título es obligatorio.');
  const body = input.body.trim().slice(0, 20000);
  if (body.length < 5) throw new Error('El prompt es obligatorio (mínimo 5 caracteres).');
  const variables = (input.variables ?? []).filter((v) => /^[a-zA-Z0-9_]+$/.test(v.key)).map((v) => ({ key: v.key, label: (v.label || v.key).slice(0, 80), ...(v.placeholder ? { placeholder: v.placeholder.slice(0, 160) } : {}) }));
  const base = {
    title,
    body,
    description: input.description?.trim().slice(0, 2000) || null,
    agentDefault: input.agentDefault ?? 'claude',
    projectDefault: input.projectDefault?.trim() || null,
    modeDefault: input.modeDefault ?? 'editar',
    variables,
    pinned: input.pinned ?? false,
    updatedAt: new Date(),
  };
  if (input.id) {
    const [row] = await db.update(developerPrompts).set(base).where(and(eq(developerPrompts.teamId, teamId), eq(developerPrompts.id, input.id))).returning();
    if (!row) throw new Error('No existe el prompt.');
    return rowToPrompt(row);
  }
  // La clave es estable y única por equipo: si el título ya se usó, se numera
  // en vez de fallar (una biblioteca no debería rechazar «Corregir bug» dos veces).
  let key = (input.key?.trim() || `dev.${slug(title)}`).slice(0, 64);
  const existing = await db.query.developerPrompts.findFirst({ where: and(eq(developerPrompts.teamId, teamId), eq(developerPrompts.key, key)), columns: { id: true } });
  if (existing) {
    if (input.key) {
      const [row] = await db.update(developerPrompts).set(base).where(eq(developerPrompts.id, existing.id)).returning();
      return rowToPrompt(row);
    }
    key = `${key.slice(0, 58)}-${Date.now().toString(36).slice(-4)}`;
  }
  const [row] = await db.insert(developerPrompts).values({ teamId, key, createdBy: userId, ...base }).returning();
  return rowToPrompt(row);
}

export async function deleteDevPrompt(teamId: number, id: number): Promise<{ id: number }> {
  const [row] = await db.delete(developerPrompts).where(and(eq(developerPrompts.teamId, teamId), eq(developerPrompts.id, id))).returning({ id: developerPrompts.id });
  if (!row) throw new Error('No existe el prompt.');
  return row;
}

export async function touchDevPrompt(teamId: number, id: number): Promise<void> {
  await db.update(developerPrompts).set({ usageCount: sql`${developerPrompts.usageCount} + 1`, lastUsedAt: new Date() }).where(and(eq(developerPrompts.teamId, teamId), eq(developerPrompts.id, id)));
}

// ── Semilla ──────────────────────────────────────────────────────────────────

type Semilla = Omit<UpsertDevPromptInput, 'id'> & { key: string };

const SEMILLA: Semilla[] = [
  {
    key: 'dev.auditoria-seguridad',
    title: 'Auditoría de seguridad de un módulo',
    description: 'Rutas, permisos, secretos y aislamiento de equipo de un módulo. No cambia nada: informa.',
    agentDefault: 'claude', projectDefault: 'whatspro', modeDefault: 'analizar', pinned: true,
    variables: [{ key: 'modulo', label: 'Módulo o carpeta', placeholder: 'lib/plugins/finance' }],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: auditar la seguridad del módulo {{modulo}} sin modificar nada.

Revisá, en este orden, y anotá archivo:línea de cada hallazgo:
1. Rutas HTTP (app/api/**): ¿todas pasan por getPluginRequestContext / assertPermission con el permiso correcto? ¿Alguna lee teamId del body o de la query en vez de la sesión?
2. Aislamiento de equipo: cada consulta a la base filtra por team_id. Buscá selects sin where de equipo.
3. Tools MCP: assertPermission antes de cualquier escritura; inputSchema JSON Schema puro (un z.object adentro hace desaparecer la tool).
4. Secretos: tokens o claves en texto plano en la base o en logs; console.log con payloads sensibles.
5. Entradas: zod en todo lo que viene del cliente; límites de tamaño; enums cerrados.
6. Acciones irreversibles (borrar, enviar, cobrar) con confirmación o idempotencia.

Entregá una tabla: severidad (alta/media/baja) · dónde · qué pasa · cómo se arregla, y al final los tres arreglos que harías primero. No toques código en esta misión.`,
  },
  {
    key: 'dev.corregir-bug',
    title: 'Corregir un bug',
    description: 'Reproducir, entender la causa, arreglar lo mínimo y verificar. Sin desplegar.',
    agentDefault: 'claude', projectDefault: 'whatspro', modeDefault: 'editar', pinned: true,
    variables: [{ key: 'sintoma', label: 'Qué se ve', placeholder: 'La pantalla X se queda en blanco al…' }, { key: 'donde', label: 'Dónde (ruta, pantalla o módulo)', placeholder: '/plugins/tasks › Producción' }],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: corregir este bug.
SÍNTOMA: {{sintoma}}
DÓNDE: {{donde}}

Método:
1. Reproducilo o encontrá la evidencia (logs del contenedor: \`docker logs whatsaas-app --since 1h\`, consultas a la base). No arregles lo que no entendés.
2. Encontrá la causa raíz, no el síntoma. Explicala en dos líneas antes de tocar nada.
3. El arreglo más chico que resuelve la causa. Si el mismo error puede estar en otro lado del repo, buscalo (grep) y anotalo, pero no lo arregles en esta misión salvo que sea idéntico.
4. Verificación: typecheck aparte; si hay un smoke del módulo (scripts/smoke-*.mts), corrélo. Si no hay, escribí el chequeo mínimo que pruebe que quedó bien.
5. No despliegues. Reportá: causa, archivos tocados, cómo lo verificaste, y qué falta para desplegar.`,
  },
  {
    key: 'dev.revisar-diff',
    title: 'Revisar el diff antes de commitear',
    description: 'Lee lo que hay sin commitear y dice qué está mal, qué falta y qué no debería ir.',
    agentDefault: 'claude', projectDefault: 'whatspro', modeDefault: 'analizar',
    variables: [],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: revisar todo lo que hay sin commitear (\`git status\`, \`git diff\`, archivos nuevos) como si fueras quien lo va a aprobar.

Para cada archivo: ¿qué cambia y por qué? ¿Rompe algo que lo importa (grep de los símbolos que cambiaron)? ¿Se coló algo que no debería ir (secretos, archivos de prueba, node_modules, .env.*)? ¿Faltan tipos, validaciones zod o filtros por team_id? ¿Los comentarios explican el porqué o repiten el código?

Entregá: (1) lista de problemas con archivo:línea y severidad, (2) lo que hay que agregar antes de commitear, (3) un mensaje de commit propuesto en castellano, con el porqué en el cuerpo. No commitees.`,
  },
  {
    key: 'dev.preparar-deploy',
    title: 'Preparar y ejecutar un despliegue',
    description: 'Typecheck, smokes, un solo build, verificación del contenedor y commit.',
    agentDefault: 'claude', projectDefault: 'whatspro', modeDefault: 'desplegar', pinned: true,
    variables: [],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: llevar a producción lo que hay en el árbol de trabajo, con la secuencia de la casa y sin saltear pasos.

1. \`git status\`: si hay cambios, resumí qué son. Si no hay nada, no despliegues.
2. Matá workers huérfanos de builds anteriores: \`pkill -f "[p]rocessChild.js"\` (con el corchete, o el pkill se mata a sí mismo).
3. Typecheck aparte: \`NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc --noEmit -p tsconfig.json\`. Si falla, arreglá y repetí; no despliegues con tipos rotos.
4. Tools MCP: \`NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts\`.
5. Smokes del módulo tocado (scripts/smoke-*.mts, con \`--env-file=.env\`).
6. UN solo despliegue: \`NEXT_SKIP_TYPECHECK=1 pnpm run deploy:saasfy\` (tarda ~7 min; no corras nada pesado mientras tanto).
7. Verificá: \`docker ps\` (whatsaas-app Up), \`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/es/sign-in\` = 200, y la ruta que cambiaste.
8. Commit con mensaje en castellano explicando el porqué. Reportá cada paso con su resultado real; si algo falló, decilo tal cual.`,
  },
  {
    key: 'dev.smoke-contra-base',
    title: 'Escribir un smoke contra la base',
    description: 'Un script que prueba el módulo con datos reales, deja todo limpio y sale con 1 si algo falla.',
    agentDefault: 'claude', projectDefault: 'whatspro', modeDefault: 'probar',
    variables: [{ key: 'modulo', label: 'Módulo a probar', placeholder: 'lib/plugins/tasks/server/production-os.ts' }],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: escribir \`scripts/smoke-<modulo>.mts\` para {{modulo}}, con el patrón de \`scripts/smoke-produccion-horas.mts\`.

Requisitos: se corre con \`NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/smoke-….mts\`; equipo 2, usuario 3; crea sus propios datos con prefijo \`[SMOKE]\` y los borra al final (también si falla, con try/finally); imprime ✓/✗ por chequeo y \`process.exit(1)\` si alguno falla; NO gasta cuota de IA; prueba las reglas de negocio (transiciones que deben fallar, cálculos con números conocidos) y no sólo que «no explota». Corrélo y pegá la salida completa en el reporte.`,
  },
  {
    key: 'dev.documentar-modulo',
    title: 'Documentar un módulo para la IA',
    description: 'Escribe la ficha que un agente necesita leer antes de tocar el módulo: objetivo, archivos, reglas, trampas.',
    agentDefault: 'claude', projectDefault: 'whatspro', modeDefault: 'analizar',
    variables: [{ key: 'modulo', label: 'Módulo', placeholder: 'lib/plugins/finance' }],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: escribir \`docs/<modulo>/LEEME-IA.md\` para {{modulo}}, pensado para que un agente lo lea ANTES de actuar (doc «03 · Agentes IA» §6: documentación neutral, no atada a un proveedor).

Contenido, en este orden y sin relleno: objetivo del módulo en dos líneas; mapa de archivos (qué vive dónde y por qué); tablas que toca y sus invariantes (qué nunca puede pasar); rutas HTTP y tools MCP con su permiso; reglas de negocio que no se ven en el código; trampas conocidas (buscá en docs/ y en los comentarios «TRAMPA», «🚨», «a propósito»); cómo se prueba (smokes) y cómo se despliega; qué NO tocar sin motivo. Cada afirmación con archivo:línea. Si algo no lo pudiste verificar, decilo en vez de inventarlo.`,
  },
  {
    key: 'dev.migracion-segura',
    title: 'Migración segura de base de datos',
    description: 'Columna o tabla nueva con psql, journal, schema de drizzle y backfill, sin romper lo que corre.',
    agentDefault: 'claude', projectDefault: 'whatspro', modeDefault: 'editar',
    variables: [{ key: 'tabla', label: 'Tabla', placeholder: 'team_task_items' }, { key: 'cambio', label: 'Qué hay que agregar o cambiar', placeholder: 'columna handoff jsonb' }],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: migrar {{tabla}}: {{cambio}}.

Secuencia de la casa, sin saltear:
1. Mirá la tabla real: \`docker exec next_saas_starter_postgres psql -U postgres -d postgres -c "\\\\d {{tabla}}"\` y cuántas filas tiene.
2. Escribí \`lib/db/migrations/NNNN_<nombre>.sql\` (el siguiente número libre) con \`ADD COLUMN IF NOT EXISTS\` / \`CREATE TABLE IF NOT EXISTS\`, comentario arriba explicando el porqué, y el BACKFILL de lo existente (lo que hoy está en producción no puede quedar en un estado que las reglas nuevas rechacen).
3. Registrala en \`lib/db/migrations/meta/_journal.json\` (idx siguiente, tag igual al nombre del archivo).
4. Reflejala en \`lib/db/schema.ts\` con \`$type<>\` en los jsonb y comentarios.
5. Aplicala con \`docker exec -i next_saas_starter_postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 < lib/db/migrations/NNNN_….sql\` y verificá con \\\\d. NUNCA \`drizzle-kit migrate\` (el journal y la tabla de drizzle están desincronizados a propósito).
6. Typecheck aparte. Reportá el SQL aplicado, cuántas filas tocó el backfill y qué código lo consume.`,
  },
  {
    key: 'dev.demo-aapp-space',
    title: 'Producir una demo en AAPP SPACE (conector)',
    description: 'Para un conector con las tools gobiz_*: toma un pedido de la cola de producción y lo entrega con enlace.',
    agentDefault: 'connector', projectDefault: null, modeDefault: 'editar', pinned: true,
    variables: [{ key: 'task_id', label: 'Id del pedido (vacío = el primero de la cola)', placeholder: '1322' }],
    body: `MISIÓN: producir UNA demo de AAPP SPACE y entregarla con enlace.

1. Si te dieron un pedido, \`whatspro_production_get {task_id: {{task_id}}}\`; si no, \`whatspro_production_work_queue {family: "demo", limit: 1}\` y tomá el primero. El ítem trae el brief, el prompt, el checklist y la CADENA EXACTA de tools de su tipo: seguila tal cual. Los productos de AAPP SPACE no se convierten entre sí (un sitio de una página es gobiz_sites_create, una tienda es gobiz_stores_create, un profesional es gobiz_prosites_create, un HTML es gobiz_html_create): elegir mal obliga a rehacer.
2. Antes de escribir en AAPP SPACE, \`gobiz_catalog_get\` o el \`*.list\` que corresponda para trabajar con identificadores reales. Usá \`dry_run: true\` la primera vez.
3. Textos en el tono del negocio, sin relleno ni datos inventados: lo que no está en el brief se deja fuera o se anota como faltante.
4. Registrá el tiempo: \`whatspro_production_log_time {task_id, minutes}\`.
5. Cerrá con \`whatspro_production_update {task_id, work_status: "entregado", delivery_url}\`. Sin enlace no se entrega. Si falta material del cliente → \`work_status: "espera_cliente"\` con \`blocked_reason\`, y NO le escribas al cliente: eso sale por el Command Center.
6. Cerrá esta misión con \`whatspro_sales_prompt_result {run_id, status: "completed", summary}\` diciendo qué entregaste y el enlace.`,
  },
  {
    key: 'dev.tomar-mision',
    title: 'Tomar la próxima misión (Claude Desktop)',
    description: 'Para Claude Desktop conectado por MCP: pide su cola, toma la primera, la marca en curso, trabaja y la cierra con resultado.',
    agentDefault: 'claude_desktop', projectDefault: 'whatspro', modeDefault: 'editar', pinned: true,
    variables: [],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: tomar y resolver la próxima misión del Centro de Desarrollo que sea para vos.

1. whatspro_dev_missions {for_agent: "claude_desktop"}: devuelve las misiones para Claude Desktop y las de cualquier conector, abiertas primero, cada una con sus steps. Si no hay ninguna abierta, decilo y terminá.
2. Tomá la primera: whatspro_dev_mission_manage {action: "update", mission_id, status: "running"}.
3. Leé la ficha del proyecto que viene en la misión (carpeta, stack, comandos) y trabajá con las tools de WhatsPro y AAPP SPACE. Lo que no puedas hacer desde acá (editar archivos del servidor, correr builds), no lo simules: anotalo como pendiente para una terminal.
4. Cerrá SIEMPRE: whatspro_dev_mission_manage {action: "result", mission_id, status: "completed" | "failed" | "blocked", result_summary} con qué hiciste, qué verificaste y qué queda. Si necesitás una decisión de la persona, status "blocked" y la pregunta concreta en result_summary.`,
  },
  {
    key: 'dev.revisar-pr',
    title: 'Revisar una rama antes de mezclarla (Codex de escritorio)',
    description: 'Para Codex: revisa una rama contra main como quien la va a aprobar, con hallazgos por archivo y línea.',
    agentDefault: 'codex_desktop', projectDefault: 'whatspro', modeDefault: 'analizar',
    variables: [{ key: 'rama', label: 'Rama a revisar', placeholder: 'feat/tareas-rediseno' }],
    body: `${REGLAS_DE_LA_CASA}

MISIÓN: revisar la rama {{rama}} contra main como si fueras quien la va a aprobar. No cambies nada.

1. \`git fetch\`, \`git log main..{{rama}} --oneline\`, \`git diff main...{{rama}} --stat\` y después el diff completo por archivo.
2. Para cada archivo: qué cambia y por qué; qué lo importa y si se rompe (grep de los símbolos que cambiaron); filtros por team_id en cada consulta; zod en lo que viene del cliente; secretos o archivos que no deberían ir; comentarios que explican el porqué.
3. Corré lo que se pueda sin desplegar: typecheck aparte y los smokes del módulo tocado.
4. Entregá: tabla de hallazgos (severidad · archivo:línea · qué pasa · cómo se arregla), lo que falta antes de mezclar, y un veredicto en una línea: mezclar / mezclar con cambios / no mezclar.
5. Si sos un cliente MCP, cerrá con whatspro_dev_mission_manage {action: "result", …}.`,
  },
];

/** Idempotente por clave: lo que ya existe no se pisa (la persona pudo haberlo editado). */
export async function seedDevPrompts(teamId: number, userId: number): Promise<{ creados: number; existentes: number }> {
  let creados = 0; let existentes = 0;
  for (const semilla of SEMILLA) {
    const existing = await db.query.developerPrompts.findFirst({ where: and(eq(developerPrompts.teamId, teamId), eq(developerPrompts.key, semilla.key)), columns: { id: true } });
    if (existing) { existentes += 1; continue; }
    await db.insert(developerPrompts).values({
      teamId,
      key: semilla.key,
      title: semilla.title,
      body: semilla.body,
      description: semilla.description ?? null,
      agentDefault: semilla.agentDefault ?? 'claude',
      projectDefault: semilla.projectDefault ?? null,
      modeDefault: semilla.modeDefault ?? 'editar',
      variables: semilla.variables ?? [],
      pinned: semilla.pinned ?? false,
      createdBy: userId,
    });
    creados += 1;
  }
  return { creados, existentes };
}
