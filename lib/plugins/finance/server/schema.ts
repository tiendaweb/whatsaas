import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamCustomers,
  teamMembershipCompanies,
  teamMembershipPlans,
  teamMembershipSubscriptions,
  teamSales,
  teamTaskProjects,
  teamFinancialAccounts,
  teamCostCenters,
} from '@/lib/db/schema';

export const FINANCIAL_TYPES = ['income', 'expense'] as const;
export const FINANCIAL_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'] as const;
export const FINANCIAL_RECURRENCES = ['none', 'monthly', 'annual'] as const;
export const FINANCIAL_ACCOUNT_TYPES = ['cash', 'bank', 'mercadopago', 'stripe', 'paypal', 'other'] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalPositiveId = z.number().int().positive().nullable().optional();

export const financialEntrySchema = z.object({
  type: z.enum(FINANCIAL_TYPES),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  category: z.string().trim().min(1).max(60),
  amount: z.number().int().min(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  status: z.enum(FINANCIAL_STATUSES).default('pending'),
  occurredOn: isoDate,
  dueOn: isoDate.nullable().optional(),
  paidOn: isoDate.nullable().optional(),
  recurrence: z.enum(FINANCIAL_RECURRENCES).default('none'),
  recurrenceEndOn: isoDate.nullable().optional(),
  nextDueOn: isoDate.nullable().optional(),
  paymentMethod: z.string().trim().max(80).nullable().optional(),
  counterparty: z.string().trim().max(200).nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  companyId: z.number().int().positive().nullable().optional(),
  planId: z.number().int().positive().nullable().optional(),
  subscriptionId: z.number().int().positive().nullable().optional(),
  saleId: optionalPositiveId,
  projectId: optionalPositiveId,
  accountId: optionalPositiveId,
  costCenterId: optionalPositiveId,
});

export type FinancialEntryInput = z.infer<typeof financialEntrySchema>;

export const financialAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(FINANCIAL_ACCOUNT_TYPES).default('bank'),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  openingBalance: z.number().int().default(0),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).default(''),
});
export type FinancialAccountInput = z.infer<typeof financialAccountSchema>;

export const costCenterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(30).nullable().optional(),
  description: z.string().max(2000).default(''),
  isActive: z.boolean().default(true),
});
export type CostCenterInput = z.infer<typeof costCenterSchema>;

export const budgetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  costCenterId: optionalPositiveId,
  category: z.string().trim().max(60).nullable().optional(),
  periodStart: isoDate,
  periodEnd: isoDate,
  amount: z.number().int().min(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  notes: z.string().max(2000).default(''),
});
export type BudgetInput = z.infer<typeof budgetSchema>;

export const entryPaymentSchema = z.object({
  accountId: optionalPositiveId,
  amount: z.number().int().positive(),
  paidOn: isoDate,
  method: z.string().trim().max(80).nullable().optional(),
  notes: z.string().max(2000).default(''),
});
export type EntryPaymentInput = z.infer<typeof entryPaymentSchema>;

export const exchangeRateSchema = z.object({
  baseCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  quoteCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  rate: z.number().positive(),
  rateDate: isoDate,
  source: z.string().trim().max(60).default('manual'),
});
export type ExchangeRateInput = z.infer<typeof exchangeRateSchema>;

export function nextRecurrenceDate(baseDate: string, recurrence: FinancialEntryInput['recurrence']) {
  if (recurrence === 'none') return null;
  const date = new Date(`${baseDate}T12:00:00Z`);
  if (recurrence === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
  if (recurrence === 'annual') date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export async function resolveFinancialRelations(teamId: number, input: Pick<FinancialEntryInput, 'customerId' | 'companyId' | 'planId' | 'subscriptionId' | 'saleId' | 'projectId' | 'accountId' | 'costCenterId'>) {
  let customerId = input.customerId ?? null;
  let companyId = input.companyId ?? null;
  let planId = input.planId ?? null;
  const subscriptionId = input.subscriptionId ?? null;
  const saleId = input.saleId ?? null;
  const projectId = input.projectId ?? null;
  const accountId = input.accountId ?? null;
  const costCenterId = input.costCenterId ?? null;

  if (subscriptionId) {
    const subscription = await db.query.teamMembershipSubscriptions.findFirst({
      where: and(eq(teamMembershipSubscriptions.id, subscriptionId), eq(teamMembershipSubscriptions.teamId, teamId)),
      columns: { id: true, customerId: true, companyId: true, planId: true },
    });
    if (!subscription) throw new Error('invalid_subscription');
    customerId ??= subscription.customerId;
    companyId ??= subscription.companyId;
    planId ??= subscription.planId;
  }

  if (planId) {
    const plan = await db.query.teamMembershipPlans.findFirst({
      where: and(eq(teamMembershipPlans.id, planId), eq(teamMembershipPlans.teamId, teamId)),
      columns: { id: true, companyId: true },
    });
    if (!plan) throw new Error('invalid_plan');
    companyId ??= plan.companyId;
  }

  if (companyId) {
    const company = await db.query.teamMembershipCompanies.findFirst({
      where: and(eq(teamMembershipCompanies.id, companyId), eq(teamMembershipCompanies.teamId, teamId)),
      columns: { id: true },
    });
    if (!company) throw new Error('invalid_company');
  }

  if (customerId) {
    const customer = await db.query.teamCustomers.findFirst({
      where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)),
      columns: { id: true },
    });
    if (!customer) throw new Error('invalid_customer');
  }

  if (saleId) {
    const sale = await db.query.teamSales.findFirst({
      where: and(eq(teamSales.id, saleId), eq(teamSales.teamId, teamId)),
      columns: { id: true },
    });
    if (!sale) throw new Error('invalid_sale');
  }

  if (projectId) {
    const project = await db.query.teamTaskProjects.findFirst({
      where: and(eq(teamTaskProjects.id, projectId), eq(teamTaskProjects.teamId, teamId)),
      columns: { id: true },
    });
    if (!project) throw new Error('invalid_project');
  }

  if (accountId) {
    const account = await db.query.teamFinancialAccounts.findFirst({
      where: and(eq(teamFinancialAccounts.id, accountId), eq(teamFinancialAccounts.teamId, teamId)),
      columns: { id: true },
    });
    if (!account) throw new Error('invalid_account');
  }

  if (costCenterId) {
    const costCenter = await db.query.teamCostCenters.findFirst({
      where: and(eq(teamCostCenters.id, costCenterId), eq(teamCostCenters.teamId, teamId)),
      columns: { id: true },
    });
    if (!costCenter) throw new Error('invalid_cost_center');
  }

  return { customerId, companyId, planId, subscriptionId, saleId, projectId, accountId, costCenterId };
}
