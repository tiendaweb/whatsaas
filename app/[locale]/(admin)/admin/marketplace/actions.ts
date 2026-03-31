'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import {
  createMarketplaceItem,
  updateMarketplaceItem,
  deleteMarketplaceItem,
  updateMarketplaceOrderStatus,
  getMarketplaceItemById,
} from '@/lib/plugins/marketplace/server/queries';
import {
  generateItemContent,
  batchGenerateItems,
  improveItemContent,
} from '@/lib/plugins/marketplace/server/ai';

async function assertAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
  return user;
}

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function extractItemData(formData: FormData) {
  const tagsRaw = String(formData.get('tags') ?? '');
  const tags = tagsRaw
    ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  return {
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
  };
}

export async function adminCreateItemAction(formData: FormData) {
  await assertAdmin();
  const data = extractItemData(formData);
  await createMarketplaceItem(data);
  revalidatePath('/admin/marketplace');
  redirect('/admin/marketplace');
}

export async function adminUpdateItemAction(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get('id'));
  if (!id || Number.isNaN(id)) throw new Error('ID inválido');

  const data = extractItemData(formData);
  await updateMarketplaceItem(id, data);
  revalidatePath('/admin/marketplace');
  revalidatePath(`/admin/marketplace/${id}`);
}

export async function adminDeleteItemAction(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get('id'));
  if (!id) throw new Error('ID inválido');
  await deleteMarketplaceItem(id);
  revalidatePath('/admin/marketplace');
}

export async function adminToggleItemAction(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get('id'));
  const newStatus = formData.get('newStatus') === 'active' ? 'active' : 'draft';
  await updateMarketplaceItem(id, { status: newStatus });
  revalidatePath('/admin/marketplace');
}

export async function adminUpdateOrderAction(formData: FormData) {
  const user = await assertAdmin();
  const orderId = Number(formData.get('orderId'));
  const status = String(formData.get('status') ?? '');

  if (!orderId || !['approved', 'rejected', 'cancelled'].includes(status)) {
    throw new Error('Datos inválidos');
  }

  await updateMarketplaceOrderStatus(orderId, status, user.id);
  revalidatePath('/admin/marketplace/orders');
}

export async function adminGenerateWithAIAction(formData: FormData) {
  await assertAdmin();
  const prompt = String(formData.get('prompt') ?? '');
  if (!prompt) throw new Error('Prompt requerido');

  const content = await generateItemContent(prompt);
  await createMarketplaceItem({
    ...content,
    interfaceBlocks: [],
    customFields: [],
    status: 'draft',
  });

  revalidatePath('/admin/marketplace');
}

export async function adminBatchGenerateAction(formData: FormData) {
  await assertAdmin();
  const topicsRaw = String(formData.get('topics') ?? '');
  const topics = topicsRaw
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  if (topics.length === 0) throw new Error('Al menos un tema requerido');

  const items = await batchGenerateItems(topics);

  for (const content of items) {
    await createMarketplaceItem({
      ...content,
      interfaceBlocks: [],
      customFields: [],
      status: 'draft',
    });
  }

  revalidatePath('/admin/marketplace');
}

export async function adminImproveItemAction(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get('id'));
  const field = String(formData.get('field') ?? '') || undefined;

  const item = await getMarketplaceItemById(id);
  if (!item) throw new Error('Item no encontrado');

  const improved = await improveItemContent(item, field);
  await updateMarketplaceItem(id, improved);
  revalidatePath('/admin/marketplace');
  revalidatePath(`/admin/marketplace/${id}`);
}
