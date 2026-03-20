CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"instance_name" varchar(255) NOT NULL,
	"event" varchar(100) NOT NULL,
	"message_id" text,
	"remote_jid" text,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"error" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "webhook_events_team_id_idx" ON "webhook_events" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events" USING btree ("created_at");
