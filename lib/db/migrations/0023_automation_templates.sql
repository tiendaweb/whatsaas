CREATE TABLE IF NOT EXISTS "automation_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "instance_id" integer,
  "name" varchar(255) NOT NULL,
  "description" text,
  "is_public" boolean DEFAULT false NOT NULL,
  "nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_templates" ADD CONSTRAINT "automation_templates_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_templates" ADD CONSTRAINT "automation_templates_instance_id_evolution_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."evolution_instances"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_templates" ADD CONSTRAINT "automation_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_templates_team_id_idx" ON "automation_templates" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_templates_team_instance_idx" ON "automation_templates" USING btree ("team_id", "instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_templates_public_idx" ON "automation_templates" USING btree ("is_public");
