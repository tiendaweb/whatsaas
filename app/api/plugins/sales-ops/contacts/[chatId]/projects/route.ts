import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { clienteDelContacto, proyectosDelContacto } from '@/lib/plugins/sales-ops/server/proyectos';

export const dynamic = 'force-dynamic';

/** GET → proyectos de Tareas OS vinculados al contacto (por él, por su cliente o por una tarea). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  try {
    const [projects, customer] = await Promise.all([
      proyectosDelContacto(ctx.team.id, chatId),
      clienteDelContacto(ctx.team.id, chatId),
    ]);
    return NextResponse.json({ projects, customer });
  } catch (error) {
    console.error('[sales-ops/contacts/projects]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
