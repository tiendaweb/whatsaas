'use server';

import { revalidatePath } from 'next/cache';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import {
  createMarketplaceItem,
  updateMarketplaceItem,
  deleteMarketplaceItem,
  createMarketplaceOrder,
  updateMarketplaceOrderStatus,
  getMarketplaceItemById,
} from './queries';
import { generateItemContent, improveItemContent, batchGenerateItems } from './ai';

async function assertAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
  return user;
}

// ---------------------------------------------------------------------------
// Admin: Item CRUD
// ---------------------------------------------------------------------------

export async function createItemAction(formData: FormData) {
  await assertAdmin();

  const item = await createMarketplaceItem({
    title: String(formData.get('title') ?? ''),
    subtitle: String(formData.get('subtitle') ?? '') || null,
    iconUrl: String(formData.get('iconUrl') ?? '') || null,
    description: String(formData.get('description') ?? ''),
    category: String(formData.get('category') ?? 'general'),
    tag: String(formData.get('tag') ?? '') || null,
    isFree: formData.get('isFree') === 'on',
    monthlyPrice: formData.get('monthlyPrice') ? String(formData.get('monthlyPrice')) : null,
    annualPrice: formData.get('annualPrice') ? String(formData.get('annualPrice')) : null,
    installationPrice: formData.get('installationPrice') ? String(formData.get('installationPrice')) : null,
    currency: String(formData.get('currency') ?? 'usd'),
    interfaceBlocks: parseJsonField(formData.get('interfaceBlocks'), []),
    customFields: parseJsonField(formData.get('customFields'), []),
    isActive: formData.get('isActive') !== 'off',
    order: Number(formData.get('order') ?? 0),
  });

  revalidatePath('/admin/marketplace');
  return item;
}

export async function updateItemAction(formData: FormData) {
  await assertAdmin();

  const id = Number(formData.get('id'));
  if (!id || Number.isNaN(id)) throw new Error('ID inválido');

  const item = await updateMarketplaceItem(id, {
    title: String(formData.get('title') ?? ''),
    subtitle: String(formData.get('subtitle') ?? '') || null,
    iconUrl: String(formData.get('iconUrl') ?? '') || null,
    description: String(formData.get('description') ?? ''),
    category: String(formData.get('category') ?? 'general'),
    tag: String(formData.get('tag') ?? '') || null,
    isFree: formData.get('isFree') === 'on',
    monthlyPrice: formData.get('monthlyPrice') ? String(formData.get('monthlyPrice')) : null,
    annualPrice: formData.get('annualPrice') ? String(formData.get('annualPrice')) : null,
    installationPrice: formData.get('installationPrice') ? String(formData.get('installationPrice')) : null,
    currency: String(formData.get('currency') ?? 'usd'),
    interfaceBlocks: parseJsonField(formData.get('interfaceBlocks'), []),
    customFields: parseJsonField(formData.get('customFields'), []),
    isActive: formData.get('isActive') !== 'off',
    order: Number(formData.get('order') ?? 0),
  });

  revalidatePath('/admin/marketplace');
  revalidatePath(`/admin/marketplace/${id}`);
  return item;
}

export async function deleteItemAction(id: number) {
  await assertAdmin();
  await deleteMarketplaceItem(id);
  revalidatePath('/admin/marketplace');
}

export async function toggleItemActiveAction(id: number, isActive: boolean) {
  await assertAdmin();
  await updateMarketplaceItem(id, { isActive });
  revalidatePath('/admin/marketplace');
}

// ---------------------------------------------------------------------------
// Admin: Order management
// ---------------------------------------------------------------------------

export async function updateOrderStatusAction(formData: FormData) {
  const user = await assertAdmin();

  const id = Number(formData.get('orderId'));
  const status = String(formData.get('status') ?? '');
  const adminNotes = String(formData.get('adminNotes') ?? '') || null;

  if (!id || !['approved', 'rejected', 'cancelled'].includes(status)) {
    throw new Error('Datos inválidos');
  }

  await updateMarketplaceOrderStatus(id, status, user.id, adminNotes);
  revalidatePath('/admin/marketplace/orders');
}

// ---------------------------------------------------------------------------
// Dashboard: Request improvement
// ---------------------------------------------------------------------------

export async function requestImprovementAction(formData: FormData) {
  const user = await getUser();
  const team = await getTeamForUser();
  if (!user || !team) throw new Error('Unauthorized');

  const itemId = Number(formData.get('itemId'));
  const pricingType = String(formData.get('pricingType') ?? 'free');
  const amount = formData.get('amount') ? String(formData.get('amount')) : null;
  const notes = String(formData.get('notes') ?? '') || null;

  const item = await getMarketplaceItemById(itemId);
  if (!item) throw new Error('Mejora no encontrada');

  await createMarketplaceOrder({
    teamId: team.id,
    marketplaceItemId: itemId,
    requestedBy: user.id,
    pricingType,
    amount,
    notes,
  });

  revalidatePath('/plugins/marketplace');
}

// ---------------------------------------------------------------------------
// AI Generation
// ---------------------------------------------------------------------------

export async function generateItemWithAIAction(prompt: string) {
  await assertAdmin();
  const result = await generateItemContent(prompt);
  return result;
}

export async function batchGenerateItemsWithAIAction(topics: string[]) {
  await assertAdmin();
  const results = await batchGenerateItems(topics);
  return results;
}

export async function improveItemWithAIAction(itemId: number, field?: string) {
  await assertAdmin();
  const item = await getMarketplaceItemById(itemId);
  if (!item) throw new Error('Item no encontrado');
  const result = await improveItemContent(item, field);
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}
