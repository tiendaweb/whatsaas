ALTER TABLE "message_draft_categories"
ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0;

UPDATE "message_draft_categories"
SET "position" = "order"
WHERE "position" = 0;
