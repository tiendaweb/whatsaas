import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCustomers, teamDocuments, CONTRACT_STATUSES } from '@/lib/db/schema';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalPositiveId = z.number().int().positive().nullable().optional();

export const contractSchema = z.object({
  customerId: optionalPositiveId,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  value: z.number().int().min(0).default(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('ARS'),
  status: z.enum(CONTRACT_STATUSES).default('draft'),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  autoRenew: z.boolean().default(false),
  documentId: optionalPositiveId,
  notes: z.string().max(2000).default(''),
});
export type ContractInput = z.infer<typeof contractSchema>;

export async function assertCustomerInTeam(teamId: number, customerId: number) {
  const customer = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)),
    columns: { id: true },
  });
  if (!customer) throw new Error('invalid_customer');
  return customer;
}

export async function assertDocumentInTeam(teamId: number, documentId: number) {
  const document = await db.query.teamDocuments.findFirst({
    where: and(eq(teamDocuments.id, documentId), eq(teamDocuments.teamId, teamId)),
    columns: { id: true },
  });
  if (!document) throw new Error('invalid_document');
  return document;
}
