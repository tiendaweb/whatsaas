import 'server-only';

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  teamCustomers,
  teamFinancialAccounts,
  teamFinancialEntries,
  teamFinancialEntryPayments,
  teamFinancingInstallments,
  teamFinancingPlans,
  teamSales,
  teamTaskProjects,
} from '@/lib/db/schema';
import { buildInstallmentSchedule } from '@/lib/plugins/finance/shared/financing';
export { buildInstallmentSchedule, installmentDueDate } from '@/lib/plugins/finance/shared/financing';

export const FINANCING_CURRENCIES = ['ARS', 'USD', 'PYG'] as const;
export const FINANCING_FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalId = z.number().int().positive().nullable().optional();

export const financingPlanSchema = z.object({
  title: z.string().trim().min(1).max(200),
  totalAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.enum(FINANCING_CURRENCIES),
  frequency: z.enum(FINANCING_FREQUENCIES),
  installmentCount: z.number().int().min(1).max(260),
  firstDueOn: isoDate,
  customerId: optionalId,
  saleId: optionalId,
  projectId: optionalId,
  notes: z.string().max(5000).default(''),
}).superRefine((value, ctx) => {
  if (!value.customerId && !value.saleId) {
    ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'customer_or_sale_required' });
  }
  if (value.installmentCount > value.totalAmount) {
    ctx.addIssue({ code: 'custom', path: ['installmentCount'], message: 'installment_amount_must_be_positive' });
  }
});

export type FinancingPlanInput = z.infer<typeof financingPlanSchema>;

export class FinancingError extends Error {}

async function resolvePlanRelations(teamId: number, input: FinancingPlanInput) {
  const [sale, customer, project] = await Promise.all([
    input.saleId
      ? db.query.teamSales.findFirst({
          where: and(eq(teamSales.id, input.saleId), eq(teamSales.teamId, teamId)),
          columns: { id: true, customerId: true, contactId: true, saleNumber: true, currency: true },
        })
      : null,
    input.customerId
      ? db.query.teamCustomers.findFirst({
          where: and(eq(teamCustomers.id, input.customerId), eq(teamCustomers.teamId, teamId)),
          columns: { id: true },
        })
      : null,
    input.projectId
      ? db.query.teamTaskProjects.findFirst({
          where: and(eq(teamTaskProjects.id, input.projectId), eq(teamTaskProjects.teamId, teamId)),
          columns: { id: true },
        })
      : null,
  ]);

  if (input.saleId && !sale) throw new FinancingError('invalid_sale');
  if (input.customerId && !customer) throw new FinancingError('invalid_customer');
  if (input.projectId && !project) throw new FinancingError('invalid_project');
  if (sale && sale.currency.toUpperCase() !== input.currency) throw new FinancingError('sale_currency_mismatch');

  const customerId = input.customerId ?? sale?.customerId ?? null;
  if (!customerId) throw new FinancingError('sale_without_customer');
  if (input.customerId && sale?.customerId && input.customerId !== sale.customerId) {
    throw new FinancingError('sale_customer_mismatch');
  }
  return { customerId, saleId: sale?.id ?? null, projectId: project?.id ?? null, saleNumber: sale?.saleNumber ?? null };
}

export async function createFinancingPlan(teamId: number, userId: number, input: FinancingPlanInput) {
  const relations = await resolvePlanRelations(teamId, input);
  const schedule = buildInstallmentSchedule(input);

  return db.transaction(async (tx) => {
    const [plan] = await tx.insert(teamFinancingPlans).values({
      teamId,
      title: input.title,
      customerId: relations.customerId,
      saleId: relations.saleId,
      projectId: relations.projectId,
      totalAmount: input.totalAmount,
      currency: input.currency,
      frequency: input.frequency,
      installmentCount: input.installmentCount,
      firstDueOn: input.firstDueOn,
      notes: input.notes,
      createdBy: userId,
      updatedBy: userId,
    }).returning();

    const entries = await tx.insert(teamFinancialEntries).values(schedule.map((installment) => ({
      teamId,
      type: 'income' as const,
      title: `${input.title} · cuota ${installment.installmentNumber}/${input.installmentCount}`,
      description: input.notes,
      category: 'installments',
      amount: installment.amount,
      currency: input.currency,
      status: 'pending' as const,
      occurredOn: input.firstDueOn,
      dueOn: installment.dueOn,
      customerId: relations.customerId,
      saleId: relations.saleId,
      projectId: relations.projectId,
      externalSource: 'financing_plan',
      externalId: `${plan.id}:${installment.installmentNumber}`,
      externalData: { financingPlanId: plan.id, installmentNumber: installment.installmentNumber },
      createdBy: userId,
      updatedBy: userId,
    }))).returning({ id: teamFinancialEntries.id });

    await tx.insert(teamFinancingInstallments).values(schedule.map((installment, index) => ({
      teamId,
      planId: plan.id,
      entryId: entries[index].id,
      ...installment,
    })));

    await tx.insert(activityLogs).values({
      teamId,
      userId,
      action: 'FINANCING_PLAN_CREATED',
      metadata: {
        planId: plan.id,
        saleId: relations.saleId,
        projectId: relations.projectId,
        customerId: relations.customerId,
        currency: input.currency,
        totalAmount: input.totalAmount,
        frequency: input.frequency,
        installmentCount: input.installmentCount,
      },
    });

    return { ...plan, installments: schedule };
  });
}

export async function listFinancingPlans(teamId: number) {
  const [plans, installments, payments, customers, sales, projects, accounts] = await Promise.all([
    db.select({
      id: teamFinancingPlans.id,
      title: teamFinancingPlans.title,
      customerId: teamFinancingPlans.customerId,
      customerName: teamCustomers.name,
      saleId: teamFinancingPlans.saleId,
      saleNumber: teamSales.saleNumber,
      projectId: teamFinancingPlans.projectId,
      projectName: teamTaskProjects.name,
      totalAmount: teamFinancingPlans.totalAmount,
      currency: teamFinancingPlans.currency,
      frequency: teamFinancingPlans.frequency,
      installmentCount: teamFinancingPlans.installmentCount,
      firstDueOn: teamFinancingPlans.firstDueOn,
      status: teamFinancingPlans.status,
      notes: teamFinancingPlans.notes,
      createdAt: teamFinancingPlans.createdAt,
    })
      .from(teamFinancingPlans)
      .leftJoin(teamCustomers, eq(teamFinancingPlans.customerId, teamCustomers.id))
      .leftJoin(teamSales, eq(teamFinancingPlans.saleId, teamSales.id))
      .leftJoin(teamTaskProjects, eq(teamFinancingPlans.projectId, teamTaskProjects.id))
      .where(eq(teamFinancingPlans.teamId, teamId))
      .orderBy(desc(teamFinancingPlans.createdAt)),
    db.select({
      id: teamFinancingInstallments.id,
      planId: teamFinancingInstallments.planId,
      entryId: teamFinancingInstallments.entryId,
      installmentNumber: teamFinancingInstallments.installmentNumber,
      dueOn: teamFinancingInstallments.dueOn,
      amount: teamFinancingInstallments.amount,
      status: teamFinancialEntries.status,
      paidOn: teamFinancialEntries.paidOn,
    })
      .from(teamFinancingInstallments)
      .innerJoin(teamFinancialEntries, eq(teamFinancingInstallments.entryId, teamFinancialEntries.id))
      .where(eq(teamFinancingInstallments.teamId, teamId))
      .orderBy(asc(teamFinancingInstallments.dueOn), asc(teamFinancingInstallments.installmentNumber)),
    db.select({ entryId: teamFinancialEntryPayments.entryId, amount: teamFinancialEntryPayments.amount })
      .from(teamFinancialEntryPayments)
      .where(eq(teamFinancialEntryPayments.teamId, teamId)),
    db.select({ id: teamCustomers.id, name: teamCustomers.name })
      .from(teamCustomers).where(eq(teamCustomers.teamId, teamId)).orderBy(asc(teamCustomers.name)),
    db.select({ id: teamSales.id, saleNumber: teamSales.saleNumber, customerId: teamSales.customerId, currency: teamSales.currency, total: teamSales.total, status: teamSales.status })
      .from(teamSales).where(eq(teamSales.teamId, teamId)).orderBy(desc(teamSales.createdAt)).limit(200),
    db.select({ id: teamTaskProjects.id, name: teamTaskProjects.name })
      .from(teamTaskProjects).where(eq(teamTaskProjects.teamId, teamId)).orderBy(asc(teamTaskProjects.name)),
    db.select({ id: teamFinancialAccounts.id, name: teamFinancialAccounts.name, currency: teamFinancialAccounts.currency })
      .from(teamFinancialAccounts)
      .where(and(eq(teamFinancialAccounts.teamId, teamId), eq(teamFinancialAccounts.isActive, true)))
      .orderBy(asc(teamFinancialAccounts.name)),
  ]);

  const paidByEntry = new Map<number, number>();
  for (const payment of payments) paidByEntry.set(payment.entryId, (paidByEntry.get(payment.entryId) ?? 0) + payment.amount);
  const today = new Date().toISOString().slice(0, 10);
  const byPlan = new Map<number, typeof installments>();
  for (const installment of installments) {
    if (!byPlan.has(installment.planId)) byPlan.set(installment.planId, []);
    byPlan.get(installment.planId)!.push(installment);
  }

  const summary: Record<string, { total: number; paid: number; outstanding: number; overdue: number }> = {};
  const rows = plans.map((plan) => {
    const planInstallments = (byPlan.get(plan.id) ?? []).map((installment) => {
      const paidAmount = paidByEntry.get(installment.entryId) ?? 0;
      const outstandingAmount = Math.max(0, installment.amount - paidAmount);
      const overdue = installment.status !== 'paid' && installment.status !== 'cancelled' && installment.dueOn < today;
      return { ...installment, paidAmount, outstandingAmount, overdue };
    });
    const paidAmount = planInstallments.reduce((sum, item) => sum + item.paidAmount, 0);
    const outstandingAmount = plan.status === 'cancelled' ? 0 : Math.max(0, plan.totalAmount - paidAmount);
    const overdueCount = planInstallments.filter((item) => item.overdue).length;
    const currencySummary = summary[plan.currency] ?? { total: 0, paid: 0, outstanding: 0, overdue: 0 };
    if (plan.status !== 'cancelled') {
      currencySummary.total += plan.totalAmount;
      currencySummary.paid += paidAmount;
      currencySummary.outstanding += outstandingAmount;
      currencySummary.overdue += overdueCount;
      summary[plan.currency] = currencySummary;
    }
    return { ...plan, paidAmount, outstandingAmount, overdueCount, installments: planInstallments };
  });

  return { plans: rows, summary, options: { customers, sales, projects, accounts } };
}

export async function cancelFinancingPlan(teamId: number, userId: number, planId: number) {
  const plan = await db.query.teamFinancingPlans.findFirst({
    where: and(eq(teamFinancingPlans.id, planId), eq(teamFinancingPlans.teamId, teamId)),
  });
  if (!plan) throw new FinancingError('not_found');
  if (plan.status === 'cancelled') return plan;
  if (plan.status === 'completed') throw new FinancingError('completed_plan');

  const installments = await db.select({ entryId: teamFinancingInstallments.entryId })
    .from(teamFinancingInstallments)
    .where(and(eq(teamFinancingInstallments.teamId, teamId), eq(teamFinancingInstallments.planId, planId)));
  const entryIds = installments.map((item) => item.entryId);
  if (entryIds.length) {
    const payment = await db.query.teamFinancialEntryPayments.findFirst({
      where: and(eq(teamFinancialEntryPayments.teamId, teamId), inArray(teamFinancialEntryPayments.entryId, entryIds)),
      columns: { id: true },
    });
    if (payment) throw new FinancingError('plan_has_payments');
  }

  return db.transaction(async (tx) => {
    if (entryIds.length) {
      await tx.update(teamFinancialEntries).set({ status: 'cancelled', updatedBy: userId, updatedAt: new Date() })
        .where(and(eq(teamFinancialEntries.teamId, teamId), inArray(teamFinancialEntries.id, entryIds)));
    }
    const [updated] = await tx.update(teamFinancingPlans).set({ status: 'cancelled', updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(teamFinancingPlans.id, planId), eq(teamFinancingPlans.teamId, teamId))).returning();
    await tx.insert(activityLogs).values({
      teamId,
      userId,
      action: 'FINANCING_PLAN_CANCELLED',
      metadata: { planId, previousStatus: plan.status, nextStatus: 'cancelled' },
    });
    return updated;
  });
}
