ALTER TABLE "ai_configs"
ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb;
