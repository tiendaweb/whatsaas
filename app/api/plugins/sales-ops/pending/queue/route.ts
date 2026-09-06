import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { LaunchError, launchRun } from '@/lib/plugins/sales-ops/server/prompt-queue';
import { getSkill } from '@/lib/plugins/sales-ops/server/skills';

export const dynamic = 'force-dynamic';

const schema = z.object({ chatIds: z.array(z.number().int().positive()).min(1).max(50) });

/** Skill de auditoría del equipo; si no existe, va la instrucción por defecto. */
const SKILL_AUDITORIA = 'qa.p2-auditar-chat';

const INSTRUCCION = `Auditá este chat y guardá la clasificación.

whatspro_sales_dossier {chat_id} para leer el expediente y los RULE_FACTS. Aplicá las reglas R1–R5 del Command Center (cliente existente → G11; entrada muerta → G0; nunca contestado → G0 "Responder ya"; rechazo explícito → GX; pago pendiente → mínimo G9, o G10 si el bloqueo es nuestro). Si ninguna decide, elegí entre G1 y G8 por el punto más alto con evidencia DEL CLIENTE. Si el CRM contradice lo que leíste (etapa, etiquetas o campos del contacto), corregilo en el mismo paso con whatspro_change_crm_stage / whatspro_set_contact_tags / whatspro_set_custom_fields usando nombres del crmCatalog del expediente, y dejá el detalle en crm_fix; sólo este contacto, nunca en lote. Cerrá con whatspro_sales_classification_write {chat_id, classification, connector}.`;

/**
 * POST { chatIds } → deja el análisis de esos chats en la cola de conectores.
 *
 * Los chats sin analizar ya aparecían solos en `whatspro_sales_work_queue`
 * (kind `classify`), pero eso es una cola que el servidor arma sola: no había
 * forma de decir "estos, y quiero verlo". Cada corrida creada acá queda visible
 * en la Actividad del Prompt Studio con su resultado.
 *
 * Usa la skill de auditoría del equipo si existe, así el texto sigue las reglas
 * que el equipo editó, y cae a la instrucción por defecto si la retiraron.
 */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { chatIds }' }, { status: 400 });

  const skill = await getSkill(ctx.team.id, { key: SKILL_AUDITORIA });

  const resultados: Array<{ chatId: number; runId: number | null; error?: string }> = [];
  for (const chatId of parsed.data.chatIds) {
    try {
      const { run } = await launchRun(ctx.team.id, ctx.user.id, {
        skillId: skill?.id ?? null,
        text: skill ? null : INSTRUCCION,
        title: `Auditar chat ${chatId}`,
        targetKind: 'chat',
        targetId: chatId,
        // Siempre a la cola: clasificar necesita tools, y el motor API no las tiene.
        mode: 'queue',
      });
      resultados.push({ chatId, runId: run.id });
    } catch (error) {
      resultados.push({ chatId, runId: null, error: error instanceof LaunchError ? error.message : 'No se pudo encolar.' });
    }
  }

  const encolados = resultados.filter((r) => r.runId !== null).length;
  return NextResponse.json({ encolados, fallidos: resultados.length - encolados, resultados }, { status: 201 });
}
