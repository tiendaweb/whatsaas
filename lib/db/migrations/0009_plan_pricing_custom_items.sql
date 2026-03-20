ALTER TABLE "plans"
ADD COLUMN IF NOT EXISTS "pricing_custom_items" jsonb DEFAULT '[]'::jsonb NOT NULL;
