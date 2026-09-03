import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { convertContactToCustomer } from '@/lib/customers/service';
import { convertLeadToDeal } from '@/lib/deals/conversions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const convertSchema = z.object({
  contactId: z.number().int().positive(),
  target: z.enum(['customer', 'deal', 'customer_and_deal']),
  customer: z
    .object({
      name: z.string().max(200).optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().max(80).nullable().optional(),
    })
    .optional(),
  deal: z
    .object({
      title: z.string().min(1).max(200),
      value: z.number().int().min(0).optional(),
      currency: z.string().length(3).optional(),
      stage: z.enum(['qualified', 'proposal', 'negotiation']).optional(),
      probability: z.number().int().min(0).max(100).optional(),
      expectedCloseDate: z.string().datetime().nullable().optional(),
      ownerId: z.number().int().positive().nullable().optional(),
    })
    .optional(),
});

/** Prospecto → Cliente y/o Oportunidad. Ver docs/escritorio-pulze/09 §3. */
export async function POST(request: Request) {
  const parsed = convertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', issues: parsed.error.issues }, { status: 400 });
  }
  const { contactId, target } = parsed.data;

  // El permiso pedido depende de lo que se vaya a tocar. Convertir sólo a
  // cliente no debería exigir permisos de Oportunidades.
  const needsDeal = target !== 'customer';
  const ctx = await getPluginRequestContext(needsDeal ? 'dealsWrite' : 'customersWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (needsDeal) {
    const isPrivileged = ctx.membership.role === 'owner' || ctx.membership.role === 'admin';
    if (!isPrivileged && ctx.membership.permissions?.customersWrite !== true) {
      return NextResponse.json({ error: 'Falta permiso sobre clientes' }, { status: 403 });
    }
    if (!parsed.data.deal) {
      return NextResponse.json({ error: 'Faltan los datos de la oportunidad' }, { status: 400 });
    }
    const result = await convertLeadToDeal(
      ctx.team.id,
      {
        contactId,
        ...parsed.data.deal,
        expectedCloseDate: parsed.data.deal.expectedCloseDate
          ? new Date(parsed.data.deal.expectedCloseDate)
          : null,
      },
      ctx.user.id,
    );
    return NextResponse.json(result, { status: 201 });
  }

  const result = await convertContactToCustomer(
    ctx.team.id,
    contactId,
    parsed.data.customer ?? {},
    ctx.user.id,
  );
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
}
