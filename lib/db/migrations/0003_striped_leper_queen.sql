ALTER TABLE "campaigns" ADD COLUMN "create_contacts" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "participant" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "participant_name" text;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "permissions" jsonb;