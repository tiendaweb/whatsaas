import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamArticles, teamMembers, teamSales, EMPLOYMENT_STATUSES, COMMISSION_RULE_TARGETS } from '@/lib/db/schema';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalPositiveId = z.number().int().positive().nullable().optional();

export const employeeProfileSchema = z.object({
  jobTitle: z.string().trim().max(160).nullable().optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).default('active'),
  hireDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).default(''),
});
export type EmployeeProfileInput = z.infer<typeof employeeProfileSchema>;

export const commissionRuleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  rateBps: z.number().int().min(0).max(10000),
  appliesTo: z.enum(COMMISSION_RULE_TARGETS).default('all_sales'),
  articleId: optionalPositiveId,
  userId: optionalPositiveId,
  isActive: z.boolean().default(true),
}).refine((data) => data.appliesTo !== 'article' || Boolean(data.articleId), {
  message: 'articleId is required when appliesTo is article',
  path: ['articleId'],
}).refine((data) => data.appliesTo !== 'user' || Boolean(data.userId), {
  message: 'userId is required when appliesTo is user',
  path: ['userId'],
});
export type CommissionRuleInput = z.infer<typeof commissionRuleSchema>;

export const saleCommissionSchema = z.object({
  saleId: z.number().int().positive(),
  userId: z.number().int().positive(),
  ruleId: optionalPositiveId,
  basisAmount: z.number().int().min(0),
  commissionAmount: z.number().int().min(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('ARS'),
  notes: z.string().max(2000).default(''),
});
export type SaleCommissionInput = z.infer<typeof saleCommissionSchema>;

export async function assertTeamMemberUser(teamId: number, userId: number) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)),
    columns: { id: true, userId: true },
  });
  if (!member) throw new Error('invalid_user');
  return member;
}

export async function assertArticleInTeam(teamId: number, articleId: number) {
  const article = await db.query.teamArticles.findFirst({
    where: and(eq(teamArticles.id, articleId), eq(teamArticles.teamId, teamId)),
    columns: { id: true },
  });
  if (!article) throw new Error('invalid_article');
  return article;
}

export async function assertSaleInTeam(teamId: number, saleId: number) {
  const sale = await db.query.teamSales.findFirst({
    where: and(eq(teamSales.id, saleId), eq(teamSales.teamId, teamId)),
    columns: { id: true },
  });
  if (!sale) throw new Error('invalid_sale');
  return sale;
}

export function calculateCommissionAmount(basisAmount: number, rateBps: number) {
  return Math.round((basisAmount * rateBps) / 10000);
}
