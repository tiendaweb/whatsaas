import { db } from '@/lib/db/drizzle';
import { automationAdminSettings } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

let automationSettingsBootstrapped = false;

async function ensureAutomationAdminSettingsTable() {
  if (automationSettingsBootstrapped) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS automation_admin_settings (
      id serial PRIMARY KEY,
      ai_flow_generator_enabled boolean NOT NULL DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  automationSettingsBootstrapped = true;
}

export async function ensureAutomationAdminSettings() {
  await ensureAutomationAdminSettingsTable();

  const current = await db.query.automationAdminSettings.findFirst();
  if (current) {
    return current;
  }

  await db.insert(automationAdminSettings).values({
    aiFlowGeneratorEnabled: true,
  });

  return db.query.automationAdminSettings.findFirst();
}

export async function getAutomationAdminSettings() {
  return ensureAutomationAdminSettings();
}

export async function setAutomationAIFlowGeneratorEnabled(enabled: boolean) {
  const current = await ensureAutomationAdminSettings();

  if (!current) {
    throw new Error('No se pudo cargar la configuración de automatización.');
  }

  await db
    .update(automationAdminSettings)
    .set({
      aiFlowGeneratorEnabled: enabled,
      updatedAt: new Date(),
    })
    .where(eq(automationAdminSettings.id, current.id));
}
