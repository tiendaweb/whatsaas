-- When an operator manually closes/cuts a chat, automations must not
-- auto-trigger again for that chat until it is manually re-triggered.
ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "automation_disabled" boolean DEFAULT false;
