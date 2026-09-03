import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { addCustomerNote, listCustomerNotes } from '@/lib/plugins/customers/server/notes';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Bitácora del cliente. Se llama `notes-log` y no `notes` porque ya existe
 * `PUT /api/contacts/[id]/notes`, que edita el campo de texto suelto del
 * contacto: son dos cosas distintas y confundirlas sería fácil.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const customerId = Number((await params).id);
  if (!Number.isInteger(customerId)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  return NextResponse.json(await listCustomerNotes(ctx.team.id, customerId));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const customerId = Number((await params).id);
  if (!Number.isInteger(customerId)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 });

  const parsed = z.object({ text: z.string().trim().min(1).max(10000) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Falta el texto de la nota.' }, { status: 400 });

  const nota = await addCustomerNote({
    teamId: ctx.team.id,
    customerId,
    userId: ctx.user.id,
    text: parsed.data.text,
  });
  if (!nota) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
  return NextResponse.json(nota, { status: 201 });
}
