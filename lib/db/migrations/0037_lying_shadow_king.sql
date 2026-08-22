CREATE TABLE "team_membership_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"logo_url" text,
	"notes" text DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_membership_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"company_id" integer,
	"name" varchar(150) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"billing_type" varchar(30) DEFAULT 'monthly' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"setup_fee" integer DEFAULT 0 NOT NULL,
	"maintenance_amount" integer DEFAULT 0 NOT NULL,
	"maintenance_interval_months" integer,
	"billing_label" varchar(100),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_membership_reminder_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(150) NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"action_type" varchar(20) DEFAULT 'message' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"media_url" text,
	"automation_id" integer,
	"instance_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_membership_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"subscription_number" varchar(50) NOT NULL,
	"plan_id" integer,
	"company_id" integer,
	"contact_id" integer NOT NULL,
	"plan_name_snapshot" varchar(150) DEFAULT '' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"billing_type" varchar(30) DEFAULT 'monthly' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD CONSTRAINT "team_membership_companies_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD CONSTRAINT "team_membership_companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD CONSTRAINT "team_membership_companies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_plans" ADD CONSTRAINT "team_membership_plans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_plans" ADD CONSTRAINT "team_membership_plans_company_id_team_membership_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."team_membership_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_plans" ADD CONSTRAINT "team_membership_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_plans" ADD CONSTRAINT "team_membership_plans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_reminder_rules" ADD CONSTRAINT "team_membership_reminder_rules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_reminder_rules" ADD CONSTRAINT "team_membership_reminder_rules_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_reminder_rules" ADD CONSTRAINT "team_membership_reminder_rules_instance_id_evolution_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."evolution_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_plan_id_team_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."team_membership_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_company_id_team_membership_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."team_membership_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_membership_companies_team_idx" ON "team_membership_companies" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_membership_plans_team_idx" ON "team_membership_plans" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_membership_plans_company_idx" ON "team_membership_plans" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "team_membership_reminder_rules_team_idx" ON "team_membership_reminder_rules" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_membership_subscriptions_team_idx" ON "team_membership_subscriptions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_membership_subscriptions_contact_idx" ON "team_membership_subscriptions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "team_membership_subscriptions_due_idx" ON "team_membership_subscriptions" USING btree ("end_date","status");