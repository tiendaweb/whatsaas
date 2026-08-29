/**
 * Siembra los prompts del motor (sales-ops.classify, sales-ops.radar) en team_prompts
 * como versión 1 `active` para el equipo 2. Idempotente: si ya existe la key con
 * versión 1 actualiza el texto; si hay otra versión activa no la pisa.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-sales-ops-prompts.ts [teamId]
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPrompts } from '@/lib/db/schema';
import { SALES_OPS_DEFAULT_PROMPTS } from '@/lib/plugins/sales-ops/server/prompts';

const TEAM_ID = Number(process.argv[2] ?? process.env.SALES_OPS_TEAM ?? 2);
const CREATED_BY = Number(process.env.SALES_OPS_USER ?? 23);

async function main() {
  for (const prompt of SALES_OPS_DEFAULT_PROMPTS) {
    const active = await db.query.teamPrompts.findFirst({
      where: and(eq(teamPrompts.teamId, TEAM_ID), eq(teamPrompts.key, prompt.key), eq(teamPrompts.status, 'active')),
      columns: { id: true, version: true },
    });
    const v1 = await db.query.teamPrompts.findFirst({
      where: and(eq(teamPrompts.teamId, TEAM_ID), eq(teamPrompts.key, prompt.key), eq(teamPrompts.version, 1)),
      columns: { id: true, status: true },
    });
    const values = {
      title: prompt.title,
      purpose: prompt.purpose,
      audience: prompt.audience,
      systemPrompt: prompt.systemPrompt,
      userTemplate: prompt.userTemplate,
      outputSchema: prompt.outputSchema,
      toolChain: prompt.toolChain,
      notes: prompt.notes,
      updatedAt: new Date(),
    };
    if (v1) {
      await db.update(teamPrompts).set(values).where(eq(teamPrompts.id, v1.id));
      console.log(`= ${prompt.key} v1 actualizado (status ${v1.status}${active && active.id !== v1.id ? `, activa es v${active.version}` : ''})`);
      continue;
    }
    const status = active ? 'draft' : 'active';
    const [row] = await db
      .insert(teamPrompts)
      .values({ teamId: TEAM_ID, key: prompt.key, version: 1, status, createdBy: CREATED_BY, ...values })
      .returning({ id: teamPrompts.id });
    console.log(`+ ${prompt.key} v1 creado como ${status} (id ${row.id})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
