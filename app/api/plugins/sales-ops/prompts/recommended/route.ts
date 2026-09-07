import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPrompts } from '@/lib/db/schema';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { rowToSkill } from '@/lib/plugins/sales-ops/server/skills';
import { getChatSuggestions } from '@/lib/plugins/sales-ops/server/suggestions';
import { esWorkKind } from '@/lib/plugins/tasks/shared/produccion';

export const dynamic = 'force-dynamic';
/** Regenerar llama al modelo dentro del request. */
export const maxDuration = 120;

/**
 * Skills que un pedido de producción de ese tipo puede usar.
 *
 * El `recommendFor` de una skill comercial habla de gates y señales; el de una
 * skill de producción (`prod.*`, sembradas por `scripts/seed-production-skills.ts`)
 * habla de tipos de trabajo, que no están en `SkillRecommendFor` porque no son
 * vocabulario del Command Center. Por eso se lee el JSON crudo de la fila en vez
 * de `skill.recommendFor`, que lo descarta al normalizar.
 *
 * Las `pinned` entran igual aunque no declaren tipo: son las que el equipo dejó
 * a mano para todo, y la pantalla nunca puede quedarse sin nada que ofrecer.
 */
async function recomendadasPorTipo(teamId: number, workKind: string) {
  const rows = await db.query.teamPrompts.findMany({
    where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.purpose, 'custom'), inArray(teamPrompts.status, ['active', 'draft'])),
    orderBy: (t, { asc, desc }) => [desc(t.pinned), desc(t.usageCount), asc(t.title), desc(t.version)],
  });

  const vistas = new Set<string>();
  const recommendations: Array<{ skill: ReturnType<typeof rowToSkill>; reason: string; score: number }> = [];
  for (const row of rows) {
    // Una key puede tener varias versiones vivas: vale la primera, que por el
    // orden de arriba es la más nueva.
    if (vistas.has(row.key)) continue;
    vistas.add(row.key);
    const declarados = (row.recommendFor as { workKinds?: unknown } | null)?.workKinds;
    const coincide = Array.isArray(declarados) && declarados.map(String).includes(workKind);
    if (coincide) recommendations.push({ skill: rowToSkill(row), reason: `hecha para ${workKind}`, score: 100 });
    else if (row.pinned) recommendations.push({ skill: rowToSkill(row), reason: 'Fijada por el equipo', score: 1 });
  }
  recommendations.sort((a, b) => b.score - a.score || b.skill.usageCount - a.skill.usageCount);
  return recommendations;
}

/**
 * GET ?chatId=&force=1 → siguientes acciones para ese chat.
 * GET ?workKind=demo_tienda_aapp → skills para ese tipo de trabajo de producción.
 *
 * Por chat devuelve las dos fuentes juntas porque en la ficha se muestran en una
 * sola fila: las que la IA eligió leyendo el expediente de ESE cliente
 * (`suggestions`, con el formulario ya pre-llenado) y las que coinciden por
 * regla con su gate o su última señal (`recommendations`). Sin `force` no se
 * gasta una llamada de IA: se sirve lo cacheado.
 *
 * Por tipo de trabajo no hay expediente que leer ni IA que gastar: es una
 * coincidencia declarada, así que `suggestions` viene vacío y sólo hay
 * `recommendations`.
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const ctx = await getSalesOpsContext(sp.get('force') ? 'salesOpsWrite' : 'salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const workKind = sp.get('workKind');
  if (workKind) {
    if (!esWorkKind(workKind)) return NextResponse.json({ error: 'workKind inválido' }, { status: 400 });
    try {
      return NextResponse.json({ workKind, suggestions: [], generatedAt: null, situation: null, unavailable: null, recommendations: await recomendadasPorTipo(ctx.team.id, workKind) });
    } catch (error) {
      console.error('[sales-ops/prompts/recommended workKind]', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
    }
  }

  const chatId = Number(sp.get('chatId'));
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  try {
    return NextResponse.json(await getChatSuggestions(ctx.team.id, chatId, { force: sp.get('force') === '1' }));
  } catch (error) {
    console.error('[sales-ops/prompts/recommended]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
