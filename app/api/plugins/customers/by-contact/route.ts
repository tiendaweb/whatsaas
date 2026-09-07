import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/drizzle';
import { teamCustomers } from '@/lib/db/schema';
import { resolverCliente } from '@/lib/customers/es-cliente';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

/**
 * ¿Qué ficha de Clientes le corresponde a este contacto, y es cliente de verdad?
 *
 * Antes esta ruta hacía su propia versión de la pregunta: primero el vínculo y,
 * si no había, la ficha con el mismo teléfono — y devolvía un `customerId` a
 * secas, sin decir cuál de las dos cosas había pasado. La UI mostraba "Cliente"
 * para alguien que el motor comercial trataba como lead, porque el motor exige
 * vínculo, suscripción activa o venta pagada y la coincidencia de teléfono no
 * alcanza. Ahora la pregunta la contesta `resolverCliente`, la misma que usa el
 * motor, y la respuesta dice la fuente para que la pantalla pueda ser honesta.
 *
 * La forma de la respuesta conserva `customerId` porque ya la consumen la ficha
 * de contacto del chat y la ficha de cliente de Tareas.
 */
const querySchema = z.object({ contactId: z.coerce.number().int().positive() });

export async function GET(request: NextRequest) {
  const ctx = await getPluginRequestContext('customersRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = querySchema.safeParse({ contactId: request.nextUrl.searchParams.get('contactId') });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });

  const estado = await resolverCliente(ctx.team.id, { contactId: parsed.data.contactId });
  if (!estado.customerId) {
    return NextResponse.json({ customerId: null, esCliente: false, fuente: null, customerName: null });
  }

  // El nombre lo pide el Focus para mostrar "Cliente: <nombre>" sin una segunda
  // vuelta; el filtro por equipo va igual aunque `resolverCliente` ya lo aplique.
  const ficha = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, estado.customerId), eq(teamCustomers.teamId, ctx.team.id)),
    columns: { id: true, name: true },
  });

  return NextResponse.json({
    customerId: ficha?.id ?? null,
    esCliente: estado.esCliente,
    fuente: estado.fuente,
    customerName: ficha?.name ?? null,
  });
}
