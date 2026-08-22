ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "is_social_publisher_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"platform" varchar(20) NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"picture_url" text,
	"access_token" text NOT NULL,
	"token_expires_at" timestamp,
	"linked_facebook_page_id" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"connected_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_team_platform_ext" UNIQUE("team_id","platform","external_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"format" varchar(20) DEFAULT 'post' NOT NULL,
	"caption" text,
	"link" text,
	"media_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_at" timestamp,
	"timezone" varchar(64),
	"created_by" integer,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_post_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"social_account_id" integer NOT NULL,
	"platform" varchar(20) NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"ig_container_id" text,
	"published_external_id" text,
	"permalink" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"error_message" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_accounts_team_idx" ON "social_accounts" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_team_idx" ON "social_posts" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_due_idx" ON "social_posts" ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_targets_post_idx" ON "social_post_targets" ("post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_targets_status_idx" ON "social_post_targets" ("status");
