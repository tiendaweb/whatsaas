import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamArticles, teamVendors, PURCHASE_ORDER_STATUSES } from '@/lib/db/schema';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalPositiveId = z.number().int().positive().nullable().optional();

export const vendorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  taxId: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().max(2000).default(''),
  notes: z.string().max(2000).default(''),
  isActive: z.boolean().default(true),
});
export type VendorInput = z.infer<typeof vendorSchema>;

export const purchaseOrderItemSchema = z.object({
  articleId: optionalPositiveId,
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().positive().default(1),
  unitAmount: z.number().int().min(0).default(0),
  receivedQuantity: z.number().int().min(0).default(0),
});
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;

export const purchaseOrderSchema = z.object({
  vendorId: z.number().int().positive(),
  status: z.enum(PURCHASE_ORDER_STATUSES).default('draft'),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('ARS'),
  taxAmount: z.number().int().min(0).default(0),
  expectedDate: isoDate.nullable().optional(),
  receivedDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).default(''),
  items: z.array(purchaseOrderItemSchema).min(1).max(200),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export function computeOrderTotals(items: PurchaseOrderItemInput[], taxAmount: number) {
  const subtotalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
  return { subtotalAmount, taxAmount, totalAmount: subtotalAmount + taxAmount };
}

export async function assertVendorInTeam(teamId: number, vendorId: number) {
  const vendor = await db.query.teamVendors.findFirst({
    where: and(eq(teamVendors.id, vendorId), eq(teamVendors.teamId, teamId)),
    columns: { id: true, isActive: true },
  });
  if (!vendor) throw new Error('invalid_vendor');
  return vendor;
}

export async function assertArticleInTeam(teamId: number, articleId: number) {
  const article = await db.query.teamArticles.findFirst({
    where: and(eq(teamArticles.id, articleId), eq(teamArticles.teamId, teamId)),
    columns: { id: true },
  });
  if (!article) throw new Error('invalid_article');
  return article;
}
