ALTER TABLE "team_task_comments" ADD COLUMN IF NOT EXISTS "kind" varchar(20) DEFAULT 'comment' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_task_comments" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'user' NOT NULL;
