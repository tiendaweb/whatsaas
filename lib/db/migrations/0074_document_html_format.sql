ALTER TABLE "team_documents" ADD COLUMN IF NOT EXISTS "format" varchar(20) NOT NULL DEFAULT 'markdown';
--> statement-breakpoint
ALTER TABLE "team_documents" ADD COLUMN IF NOT EXISTS "html_content" text;
