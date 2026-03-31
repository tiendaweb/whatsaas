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

  const tagsRaw = String(formData.get('tags') ?? '');
  const tags = tagsRaw
    ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const item = await createMarketplaceItem({
    title: String(formData.get('title') ?? ''),
    subtitle: String(formData.get('subtitle') ?? '') || null,
    iconUrl: String(formData.get('iconUrl') ?? '') || null,
    imageUrl: String(formData.get('imageUrl') ?? '') || null,
    description: String(formData.get('description') ?? ''),
    category: String(formData.get('category') ?? 'general'),
    tags,
    interfaceBlocks: parseJsonField(formData.get('interfaceBlocks'), []),
    customFields: parseJsonField(formData.get('customFields'), []),
    status: formData.get('status') === 'draft' ? 'draft' : 'active',
  });

  revalidatePath('/admin/marketplace');
  return item;
}

export async function updateItemAction(formData: FormData) {
  await assertAdmin();

  const id = Number(formData.get('id'));
  if (!id || Number.isNaN(id)) throw new Error('ID invalido');

  const tagsRaw = String(formData.get('tags') ?? '');
  const tags = tagsRaw
    ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const item = await updateMarketplaceItem(id, {
    title: String(formData.get('title') ?? ''),
    subtitle: String(formData.get('subtitle') ?? '') || null,
    iconUrl: String(formData.get('iconUrl') ?? '') || null,
    imageUrl: String(formData.get('imageUrl') ?? '') || null,
    description: String(formData.get('description') ?? ''),
    category: String(formData.get('category') ?? 'general'),
    tags,
    interfaceBlocks: parseJsonField(formData.get('interfaceBlocks'), []),
    customFields: parseJsonField(formData.get('customFields'), []),
    status: formData.get('status') === 'draft' ? 'draft' : 'active',
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
  await updateMarketplaceItem(id, { status: isActive ? 'active' : 'draft' });
  revalidatePath('/admin/marketplace');
}

// ---------------------------------------------------------------------------
// Admin: Order management
// ---------------------------------------------------------------------------

export async function updateOrderStatusAction(formData: FormData) {
  const user = await assertAdmin();

  const id = Number(formData.get('orderId'));
  const status = String(formData.get('status') ?? '');

  if (!id || !['approved', 'rejected', 'cancelled'].includes(status)) {
    throw new Error('Datos invalidos');
  }

  await updateMarketplaceOrderStatus(id, status, user.id);
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

  const item = await getMarketplaceItemById(itemId);
  if (!item) throw new Error('Mejora no encontrada');

  await createMarketplaceOrder({
    teamId: team.id,
    itemId,
    requestedBy: user.id,
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
