CREATE TABLE "automation_admin_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"ai_flow_generator_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "automation_admin_settings" ("ai_flow_generator_enabled")
SELECT true
WHERE NOT EXISTS (
  SELECT 1 FROM "automation_admin_settings"
);
