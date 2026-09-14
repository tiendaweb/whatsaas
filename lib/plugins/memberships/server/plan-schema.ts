import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamMembershipCompanies } from '@/lib/db/schema';
import { BILLING_TYPES, FEATURE_TYPES, PLAN_VISIBILITIES } from '@/lib/plugins/memberships/constants';

const featureSchema = z.object({
  label: z.string().min(1).max(200),
  type: z.enum(FEATURE_TYPES),
  value: z.string().max(200).optional(),
});
const priceSchema = z.object({
  currency: z.string().length(3),
  price: z.number().int().min(0),
  setupFee: z.number().int().min(0).optional().default(0),
  maintenanceAmount: z.number().int().min(0).optional().default(0),
});

export const planSchema = z.object({
  companyId: z.number().int().optional().nullable(),
  name: z.string().min(1).max(150),
  description: z.string().max(1000).default(''),
  billingType: z.enum(BILLING_TYPES).default('monthly'),
  price: z.number().int().min(0).default(0),
  setupFee: z.number().int().min(0).default(0),
  maintenanceAmount: z.number().int().min(0).default(0),
  maintenanceIntervalMonths: z.number().int().min(1).max(240).optional().nullable(),
  billingLabel: z.string().max(100).optional().nullable(),
  currency: z.string().length(3).default('USD'),
  prices: z.array(priceSchema).max(20).default([]),
  features: z.array(featureSchema).default([]),
  visibility: z.enum(PLAN_VISIBILITIES).default('public'),
  status: z.enum(['active', 'archived']).default('active'),
  position: z.number().int().optional(),
});

// Verifica que la empresa pertenezca al equipo antes de asociarla a un plan.
export async function assertCompanyOwnership(teamId: number, companyId: number | null | undefined) {
  if (companyId == null) return true;
  const company = await db.query.teamMembershipCompanies.findFirst({
    where: and(eq(teamMembershipCompanies.id, companyId), eq(teamMembershipCompanies.teamId, teamId)),
    columns: { id: true },
  });
  return Boolean(company);
}
