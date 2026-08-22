CREATE TABLE IF NOT EXISTS "form_builder_forms" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "instance_id" integer,
  "public_id" varchar(64) NOT NULL,
  "slug" varchar(180) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "style" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "submit_button_label" varchar(80) DEFAULT 'Enviar' NOT NULL,
  "success_message" text DEFAULT 'Gracias. Recibimos tus datos correctamente.' NOT NULL,
  "confirmation_message" text DEFAULT 'Hola {{nombre}}, recibimos tus datos de {{formulario}}.

{{datos}}' NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "form_builder_forms_public_id_unique" UNIQUE("public_id"),
  CONSTRAINT "form_builder_forms_team_slug_uidx" UNIQUE("team_id","slug")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "form_builder_submissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "form_id" integer NOT NULL,
  "instance_id" integer,
  "contact_name" varchar(200),
  "contact_phone" varchar(60),
  "contact_jid" varchar(120),
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(30) DEFAULT 'new' NOT NULL,
  "message_status" varchar(30) DEFAULT 'pending' NOT NULL,
  "message_id" text,
  "message_error" text,
  "reviewed_by" integer,
  "reviewed_at" timestamp,
  "source_ip" varchar(120),
  "user_agent" text,
  "submitted_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "form_builder_forms" ADD CONSTRAINT "form_builder_forms_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_builder_forms" ADD CONSTRAINT "form_builder_forms_instance_id_evolution_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."evolution_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_builder_forms" ADD CONSTRAINT "form_builder_forms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_builder_forms" ADD CONSTRAINT "form_builder_forms_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_builder_submissions" ADD CONSTRAINT "form_builder_submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_builder_submissions" ADD CONSTRAINT "form_builder_submissions_form_id_form_builder_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_builder_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_builder_submissions" ADD CONSTRAINT "form_builder_submissions_instance_id_evolution_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."evolution_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_builder_submissions" ADD CONSTRAINT "form_builder_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_builder_forms_team_status_idx" ON "form_builder_forms" ("team_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_builder_forms_public_idx" ON "form_builder_forms" ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_builder_submissions_team_status_idx" ON "form_builder_submissions" ("team_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_builder_submissions_form_idx" ON "form_builder_submissions" ("form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_builder_submissions_submitted_idx" ON "form_builder_submissions" ("team_id","submitted_at");
