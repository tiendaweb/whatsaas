ALTER TABLE "message_drafts"
  ADD COLUMN IF NOT EXISTS "draft_type" varchar(20) NOT NULL DEFAULT 'static',
  ADD COLUMN IF NOT EXISTS "ai_metadata" jsonb;

ALTER TABLE "message_drafts"
  DROP CONSTRAINT IF EXISTS "message_drafts_draft_type_check";

ALTER TABLE "message_drafts"
  ADD CONSTRAINT "message_drafts_draft_type_check"
  CHECK ("draft_type" IN ('static', 'dynamic'));
