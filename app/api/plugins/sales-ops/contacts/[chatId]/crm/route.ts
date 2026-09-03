import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { CUSTOM_FIELD_TYPES, CrmError, createCustomField, getCrm, updateCrm } from '@/lib/plugins/sales-ops/server/crm';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ chatId: string }> };

async function resolveChatId(params: Params['params']): Promise<number | null> {
  const id = Number((await params).chatId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET → etapa, etiquetas, campos personalizados y notas del contacto de este chat. */
export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const chatId = await resolveChatId(params);
  if (!chatId) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  const payload = await getCrm(ctx.team.id, chatId);
  if (!payload) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json(payload);
}

const schema = z.object({
  notes: z.string().max(10000).nullable().optional(),
  funnelStageId: z.number().int().positive().nullable().optional(),
  tagIds: z.array(z.number().int().positive()).max(60).optional(),
  fields: z.record(z.string().max(100), z.string().max(2000).nullable()).optional(),
});

/** PATCH → guarda cualquier subconjunto. Las etiquetas se reemplazan por la lista completa. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const chatId = await resolveChatId(params);
  if (!chatId) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { notes?, funnelStageId?, tagIds?, fields? }' }, { status: 400 });
  try {
    return NextResponse.json(await updateCrm(ctx.team.id, ctx.user.id, chatId, parsed.data));
  } catch (error) {
    if (error instanceof CrmError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.error('[sales-ops/crm]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const fieldSchema = z.object({ name: z.string().min(2).max(100), type: z.enum(CUSTOM_FIELD_TYPES).optional() });

/**
 * POST → crea un campo personalizado del equipo y devuelve el CRM actualizado.
 *
 * Es del equipo, no de este contacto: los campos personalizados son un esquema
 * compartido. Se crea desde acá porque es donde uno descubre que falta.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const chatId = await resolveChatId(params);
  if (!chatId) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  const parsed = fieldSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { name, type? }' }, { status: 400 });
  try {
    const campo = await createCustomField(ctx.team.id, ctx.user.id, parsed.data);
    return NextResponse.json({ campo, crm: await getCrm(ctx.team.id, chatId) }, { status: 201 });
  } catch (error) {
    if (error instanceof CrmError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.error('[sales-ops/crm/fields]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
