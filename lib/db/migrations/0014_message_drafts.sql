CREATE TABLE "message_draft_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "name" varchar(100) NOT NULL,
  "color" varchar(20) DEFAULT 'gray',
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_message_draft_category_name_idx" UNIQUE("team_id","name")
);
--> statement-breakpoint
CREATE TABLE "message_draft_tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "name" varchar(100) NOT NULL,
  "color" varchar(20) DEFAULT 'gray',
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_message_draft_tag_name_idx" UNIQUE("team_id","name")
);
--> statement-breakpoint
CREATE TABLE "message_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "title" varchar(255) NOT NULL,
  "content" text NOT NULL,
  "category_id" integer,
  "contact_id" integer,
  "assigned_user_id" integer,
  "department_id" integer,
  "stages" jsonb,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_by" integer NOT NULL,
  "updated_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_draft_tag_links" (
  "draft_id" integer NOT NULL,
  "tag_id" integer NOT NULL,
  CONSTRAINT "message_draft_tag_link_idx" UNIQUE("draft_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "message_draft_categories" ADD CONSTRAINT "message_draft_categories_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_draft_tags" ADD CONSTRAINT "message_draft_tags_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_category_id_message_draft_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."message_draft_categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_draft_tag_links" ADD CONSTRAINT "message_draft_tag_links_draft_id_message_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."message_drafts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "message_draft_tag_links" ADD CONSTRAINT "message_draft_tag_links_tag_id_message_draft_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."message_draft_tags"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "message_draft_category_team_id_idx" ON "message_draft_categories" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "message_draft_tag_team_id_idx" ON "message_draft_tags" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "message_draft_team_id_idx" ON "message_drafts" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "message_draft_category_id_idx" ON "message_drafts" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "message_draft_assigned_user_id_idx" ON "message_drafts" USING btree ("assigned_user_id");
--> statement-breakpoint
CREATE INDEX "message_draft_department_id_idx" ON "message_drafts" USING btree ("department_id");
--> statement-breakpoint
CREATE INDEX "message_draft_contact_id_idx" ON "message_drafts" USING btree ("contact_id");
--> statement-breakpoint
CREATE INDEX "message_draft_title_idx" ON "message_drafts" USING btree ("title");
--> statement-breakpoint
CREATE INDEX "message_draft_content_search_idx" ON "message_drafts" USING gin (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("content", '')));
--> statement-breakpoint
CREATE INDEX "message_draft_tag_link_draft_id_idx" ON "message_draft_tag_links" USING btree ("draft_id");
--> statement-breakpoint
CREATE INDEX "message_draft_tag_link_tag_id_idx" ON "message_draft_tag_links" USING btree ("tag_id");
