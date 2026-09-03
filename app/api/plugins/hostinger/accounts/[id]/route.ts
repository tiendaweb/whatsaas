import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { hostingerAccounts } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('hostingerWrite');
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Cuenta inválida.' }, { status: 400 });
  }

  // Los dominios ya importados quedan: el FK es ON DELETE SET NULL.
  const [deleted] = await db
    .delete(hostingerAccounts)
    .where(and(eq(hostingerAccounts.id, id), eq(hostingerAccounts.teamId, ctx.team.id)))
    .returning({ id: hostingerAccounts.id });

  if (!deleted) {
    return NextResponse.json({ error: 'La cuenta no existe.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
