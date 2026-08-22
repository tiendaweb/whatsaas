CREATE INDEX IF NOT EXISTS "messages_chat_timestamp_idx"
  ON "messages" USING btree ("chat_id", "timestamp");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chats_team_last_message_idx"
  ON "chats" USING btree ("team_id", "last_message_timestamp");
