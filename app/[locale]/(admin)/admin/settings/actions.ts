'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { setAutomationAIFlowGeneratorEnabled } from '@/lib/automation/admin-settings';

async function assertAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  return user;
}

export async function saveAutomationAdminSettings(formData: FormData) {
  await assertAdmin();

  const aiFlowGeneratorEnabled = formData.get('aiFlowGeneratorEnabled') === 'on';

  await setAutomationAIFlowGeneratorEnabled(aiFlowGeneratorEnabled);

  revalidatePath('/admin/settings');
  revalidatePath('/automation', 'layout');
}
