/**
 * Saca de las correcciones pendientes la etapa que YA quedó aplicada.
 *
 * Las etapas se movieron pasando un `fix` propio, que a propósito NO borra la
 * propuesta guardada por la clasificación: así las etiquetas y los campos que
 * también proponía siguen esperando revisión. El efecto colateral es que la
 * lista de correcciones muestra una etapa que ya está puesta, y una corrección
 * que sigue ahí después de aplicarla invita a aplicarla dos veces.
 *
 * Sólo toca la clave `stage`, y sólo cuando la etapa actual del contacto es
 * exactamente la propuesta. Si no queda nada accionable (ni etiquetas ni
 * campos), la propuesta se da por cumplida entera.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/limpiar-fix-etapa-aplicada.mts [--apply]
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, contacts, funnelStages, teamCommercialAnalysis } from '@/lib/db/schema';

const TEAM_ID = Number(process.env.CRM_TEAM_ID ?? 2);
const USER_ID = Number(process.env.CRM_USER_ID ?? 3);
const APPLY = process.argv.includes('--apply');
const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function main() {
  const etapas = await db.select({ id: funnelStages.id, name: funnelStages.name }).from(funnelStages).where(eq(funnelStages.teamId, TEAM_ID));
  const porId = new Map(etapas.map((e) => [e.id, e.name]));

  const filas = await db
    .select({ chatId: teamCommercialAnalysis.chatId, fix: teamCommercialAnalysis.crmFix, stageId: contacts.funnelStageId })
    .from(teamCommercialAnalysis)
    .innerJoin(contacts, and(eq(contacts.teamId, TEAM_ID), eq(contacts.chatId, teamCommercialAnalysis.chatId)))
    .where(and(eq(teamCommercialAnalysis.teamId, TEAM_ID), isNotNull(teamCommercialAnalysis.crmFix)));

  const cumplidos = filas.filter((f) => {
    const propuesta = (f.fix as { stage?: string | null } | null)?.stage;
    const actual = porId.get(f.stageId ?? -1);
    return typeof propuesta === 'string' && !!actual && igual(actual, propuesta);
  });

  let vaciados = 0;
  let recortados = 0;
  for (const f of cumplidos) {
    const fix = { ...(f.fix as Record<string, unknown>) };
    delete fix.stage;
    const quedaAlgo = ['addTags', 'removeTags', 'fields'].some((k) => {
      const v = fix[k];
      return Array.isArray(v) ? v.length > 0 : v != null && Object.keys(v as object).length > 0;
    });
    if (quedaAlgo) recortados += 1; else vaciados += 1;
    if (!APPLY) continue;
    await db
      .update(teamCommercialAnalysis)
      .set({ crmFix: quedaAlgo ? (fix as never) : null, updatedAt: new Date() })
      .where(and(eq(teamCommercialAnalysis.teamId, TEAM_ID), eq(teamCommercialAnalysis.chatId, f.chatId)));
  }

  console.log(`Correcciones con la etapa ya aplicada: ${cumplidos.length}`);
  console.log(`  se les saca sólo la etapa (siguen con etiquetas o campos): ${recortados}`);
  console.log(`  quedan cumplidas por completo: ${vaciados}`);

  if (!APPLY) {
    console.log('\nDRY-RUN. Nada escrito.');
    process.exit(0);
  }
  await db.insert(activityLogs).values({
    teamId: TEAM_ID,
    userId: USER_ID,
    action: 'SALES_OPS_CRM_FIX_STAGE_CLEARED',
    metadata: { chats: cumplidos.map((c) => c.chatId), recortados, vaciados },
    ipAddress: null,
  });
  console.log('\nListo, y queda auditado.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
