/**
 * Guarda el reporte del incidente/fix de las automatizaciones COMIENZO (ARS/PYG)
 * en la app Documentos, carpeta "Reportes" del equipo de Noelia.
 *
 * Idempotente: busca el documento por slug y lo actualiza si ya existe.
 *
 *   npx tsx scripts/report-comienzo-multi-moneda-fix.ts
 */
import 'dotenv/config';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocuments } from '@/lib/db/schema';
import { documentToText, parseDocumentJson } from '@/lib/plugins/documents/shared/content';
import { markdownToProseMirror } from '@/lib/plugins/documents/shared/markdown';

const TEAM_ID = 2;
const OWNER_USER_ID = 3; // Noelia
const FOLDER_ID = 16; // 📊 Reportes
const SLUG = 'incidente-reparacion-comienzo-ars-pyg-2026-08-17';
const TITLE = 'Incidente y reparación — Automatizaciones COMIENZO (ARS / PYG)';
const EMOJI = '🇦🇷🇵🇾';

const MARKDOWN = `
Cuenta: noelia@whatspro.uno
Automatizaciones: #40 COMIENZO · #225 COMIENZO Argentina (Ads) · #236 COMIENZO Paraguay (Ads)
Fecha: 17 de agosto de 2026
Síntoma informado: se probó el flujo de precios en Guaraníes enviando una palabra clave desde un número de Paraguay, y no se disparó el flujo correcto.

## Resumen ejecutivo

El motor de automatizaciones no tenía ninguna prioridad entre triggers. Cuando varias automatizaciones activas de la misma instancia podían calzar con el mismo mensaje, ganaba literalmente la primera que Postgres devolviera en una consulta sin \`ORDER BY\` — en la práctica, la de \`id\` más chico.

La automatización #40 "COMIENZO" dispara con **cualquier** primer mensaje de un contacto nuevo (trigger \`first_message\`, sin palabras clave) y tiene el id más bajo de las tres candidatas. Por eso siempre se evaluaba antes que #225 y #236, que sí tienen palabras clave específicas de cada anuncio. Resultado: un lead nuevo de Paraguay que escribía exactamente la frase del anuncio ("negocio en Paraguay", "...$230.000 Gs.", etc.) igual caía en el flujo genérico #40, con moneda ARS y el menú de Argentina — nunca llegaba a evaluarse la #236.

Con Argentina el síntoma no se notaba porque #40 y #225 hacen exactamente lo mismo (moneda ARS, mismo menú #41): la automatización equivocada ganaba, pero el resultado visible era igual de correcto por casualidad.

## Evidencia observada

- Automatización #40 "COMIENZO": \`triggerType: "first_message"\`, \`keywords: []\` → moneda \`ARS\`, redirige a #41.
- Automatización #225 "COMIENZO Argentina (Ads)": \`triggerType: "contains"\`, palabras clave del anuncio argentino → moneda \`ARS\`, redirige a #41.
- Automatización #236 "COMIENZO Paraguay (Ads)": \`triggerType: "contains"\`, palabras clave del anuncio paraguayo (incluye "...$230.000 Gs.", "...$360.000 Gs") → moneda \`PYG\`, redirige a #226.
- \`lib/automation/engine.ts\`, consulta de automatizaciones activas sin \`ORDER BY\`, y bucle \`for...break\` que corta en el primer match sin comparar especificidad.
- Los dos chats usados para la prueba manual (595991944547 de Paraguay y 5491166287503 de Argentina) ya tenían \`automation_disabled = true\` de un cierre anterior — eso corta el motor antes de evaluar cualquier trigger, así que en esos chats puntuales tampoco iba a dispararse nada aunque el bug de arriba no existiera. Además, en el chat paraguayo la frase clave se escribió dos veces desde el propio número conectado del negocio (\`fromMe: true\`), lo cual el motor ignora por diseño: solo procesa mensajes entrantes reales.
- El resto del árbol de flujos (#41→42/58/32/44/45 en ARS, espejado por #226→227/237/233/231/232 en PYG) está correctamente organizado en dos ramas paralelas — no requirió cambios.

## Causa raíz

\`processAutomation\` cargaba las automatizaciones activas con \`db.query.automations.findMany(...)\` sin orden explícito y las recorría en ese mismo orden, deteniéndose en el primer trigger que matcheara. No existía ninguna noción de "trigger específico gana sobre trigger genérico": \`first_message\` (matchea cualquier mensaje si es el primero del chat) y \`contains\` con palabras clave (matchea solo un texto específico) tenían el mismo peso, y solo el orden de iteración —dependiente del id— decidía cuál se probaba primero.

## Cambios aplicados

**Motor de automatizaciones (\`lib/automation/engine.ts\`)**

- Se agregó \`triggerSpecificityRank(data)\`: clasifica cada trigger por especificidad (0 = \`contains\`/\`exact_match\` con palabras clave, 1 = \`first_message\` o triggers sin palabras clave, 2 = \`fallback\`).
- Antes del bucle de matching, las automatizaciones candidatas se ordenan por ese rango, así los triggers con palabras clave explícitas se evalúan primero y los catch-all (\`first_message\`, \`fallback\`) quedan al final.
- No se tocó el resto del motor ni la estructura de ninguna automatización: el fix es puntual al orden de evaluación.

**Verificación**

- \`tsc --noEmit\`: sin errores.
- \`pnpm run test:automation\`: 17/17 OK (no cubre este archivo, pero confirma que no se rompió nada del resto del módulo).
- Simulación directa contra la configuración real de #40/#225/#236 (antes y después del fix), con 5 casos:
  - Lead PY por anuncio (frase exacta) → antes: #40 (❌), después: #236 (✅)
  - Lead PY por anuncio (otra frase) → antes: #40 (❌), después: #236 (✅)
  - Lead AR por anuncio (frase exacta) → antes: #40 (❌ mismo resultado por casualidad), después: #225 (✅)
  - Lead orgánico sin palabra clave → #40 en ambos casos (✅, sigue siendo el comportamiento esperado)
  - Mensaje PY que no es el primero del chat → #236 en ambos casos (✅)

**Despliegue**

- \`pnpm run deploy:saasfy\` corrido el 17 de agosto de 2026. Contenedor \`whatsaas-app\` recreado y verificado con \`HTTP 200\`.

## Pendiente / recomendación

- Los dos chats usados en la prueba manual (595991944547 y 5491166287503) siguen con \`automation_disabled = true\`. Para reprobar en esos chats puntuales hay que reactivarlos con el botón ⚡ "Disparar automatización" del chat, o probar con un número que nunca haya escrito antes, enviando el mensaje desde ese teléfono externo hacia el número del negocio (no escribiéndolo desde el WhatsApp conectado del negocio).
`;

async function main() {
  const node = parseDocumentJson(markdownToProseMirror(MARKDOWN));
  if (!node) throw new Error('El contenido del reporte no pasó la validación del esquema.');

  const content = node.toJSON() as Record<string, unknown>;
  const contentText = documentToText(node);

  const [existing] = await db
    .select({ id: teamDocuments.id, version: teamDocuments.version })
    .from(teamDocuments)
    .where(and(eq(teamDocuments.teamId, TEAM_ID), eq(teamDocuments.slug, SLUG)))
    .limit(1);

  if (existing) {
    await db
      .update(teamDocuments)
      .set({
        title: TITLE,
        emoji: EMOJI,
        folderId: FOLDER_ID,
        content,
        contentText,
        version: existing.version + 1,
        updatedBy: OWNER_USER_ID,
        updatedAt: new Date(),
      })
      .where(eq(teamDocuments.id, existing.id));

    console.log(`Actualizado: ${EMOJI} ${TITLE} (id ${existing.id})`);
    process.exit(0);
  }

  const [maxPositionRow] = await db
    .select({ position: teamDocuments.position })
    .from(teamDocuments)
    .where(eq(teamDocuments.folderId, FOLDER_ID))
    .orderBy(desc(teamDocuments.position))
    .limit(1);

  const [created] = await db
    .insert(teamDocuments)
    .values({
      teamId: TEAM_ID,
      folderId: FOLDER_ID,
      title: TITLE,
      slug: SLUG,
      emoji: EMOJI,
      content,
      contentText,
      position: (maxPositionRow?.position ?? 0) + 1,
      createdBy: OWNER_USER_ID,
      updatedBy: OWNER_USER_ID,
    })
    .returning({ id: teamDocuments.id });

  console.log(`Creado: ${EMOJI} ${TITLE} (id ${created.id})`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
