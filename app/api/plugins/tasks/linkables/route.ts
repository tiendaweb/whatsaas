import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  teamCustomerTransactions,
  teamCustomers,
  teamMembershipCompanies,
  teamMembershipSubscriptions,
  teamSales,
} from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

/**
 * Opciones para vincular una tarea a una venta, un comprobante, una membresía
 * o una empresa.
 *
 * Cada una vive en un plugin distinto y ninguno expone un listado liviano: el
 * selector de relaciones necesita sólo `{id, label, detail}`, no la fila
 * entera. Se resuelve acá en vez de traerse cuatro endpoints completos al
 * cliente.
 */

const TIPOS = ['sale', 'transaction', 'subscription', 'company'] as const;
type Tipo = (typeof TIPOS)[number];

const LIMITE = 200;

function esTipo(value: string | null): value is Tipo {
  return Boolean(value) && (TIPOS as readonly string[]).includes(value!);
}

function importe(valor: number, moneda: string) {
  return `${new Intl.NumberFormat('es-AR').format(valor)} ${moneda}`;
}

export async function GET(req: Request) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const tipo = new URL(req.url).searchParams.get('type');
  if (!esTipo(tipo)) return NextResponse.json({ error: 'type inválido' }, { status: 400 });

  const teamId = ctx.team.id;

  if (tipo === 'sale') {
    const rows = await db
      .select({
        id: teamSales.id,
        saleNumber: teamSales.saleNumber,
        status: teamSales.status,
        total: teamSales.total,
        currency: teamSales.currency,
        contactName: contacts.name,
      })
      .from(teamSales)
      .leftJoin(contacts, eq(teamSales.contactId, contacts.id))
      .where(eq(teamSales.teamId, teamId))
      .orderBy(desc(teamSales.createdAt))
      .limit(LIMITE);

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      label: `${row.saleNumber}${row.contactName ? ` · ${row.contactName}` : ''}`,
      detail: `${importe(row.total, row.currency)} · ${row.status}`,
    })));
  }

  if (tipo === 'transaction') {
    const rows = await db
      .select({
        id: teamCustomerTransactions.id,
        amount: teamCustomerTransactions.amount,
        currency: teamCustomerTransactions.currency,
        paymentStatus: teamCustomerTransactions.paymentStatus,
        transactionDate: teamCustomerTransactions.transactionDate,
        customerName: teamCustomers.name,
      })
      .from(teamCustomerTransactions)
      .leftJoin(teamCustomers, eq(teamCustomerTransactions.customerId, teamCustomers.id))
      .where(eq(teamCustomerTransactions.teamId, teamId))
      .orderBy(desc(teamCustomerTransactions.transactionDate))
      .limit(LIMITE);

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      label: `${row.amount ?? '—'} ${row.currency ?? ''}`.trim() + (row.customerName ? ` · ${row.customerName}` : ''),
      detail: [row.paymentStatus, row.transactionDate?.toISOString().slice(0, 10)].filter(Boolean).join(' · '),
    })));
  }

  if (tipo === 'subscription') {
    const rows = await db
      .select({
        id: teamMembershipSubscriptions.id,
        number: teamMembershipSubscriptions.subscriptionNumber,
        planName: teamMembershipSubscriptions.planNameSnapshot,
        status: teamMembershipSubscriptions.status,
        endDate: teamMembershipSubscriptions.endDate,
        customerName: teamCustomers.name,
      })
      .from(teamMembershipSubscriptions)
      .leftJoin(teamCustomers, eq(teamMembershipSubscriptions.customerId, teamCustomers.id))
      .where(eq(teamMembershipSubscriptions.teamId, teamId))
      .orderBy(desc(teamMembershipSubscriptions.createdAt))
      .limit(LIMITE);

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      label: `${row.planName || row.number}${row.customerName ? ` · ${row.customerName}` : ''}`,
      detail: [row.status, row.endDate ? `vence ${row.endDate}` : null].filter(Boolean).join(' · '),
    })));
  }

  const rows = await db
    .select({
      id: teamMembershipCompanies.id,
      name: teamMembershipCompanies.name,
      status: teamMembershipCompanies.status,
      website: teamMembershipCompanies.website,
    })
    .from(teamMembershipCompanies)
    .where(and(eq(teamMembershipCompanies.teamId, teamId), eq(teamMembershipCompanies.status, 'active')))
    .orderBy(teamMembershipCompanies.position)
    .limit(LIMITE);

  return NextResponse.json(rows.map((row) => ({
    id: row.id,
    label: row.name,
    detail: row.website ?? null,
  })));
}
