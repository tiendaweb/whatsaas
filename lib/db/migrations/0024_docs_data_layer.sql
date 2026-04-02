DO $$ BEGIN
 CREATE TYPE "public"."docs_article_audience" AS ENUM('technical', 'non_technical', 'mixed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "docs_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(140) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text,
  "icon" varchar(80),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "docs_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "docs_tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(140) NOT NULL,
  "name" varchar(120) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "docs_tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "docs_articles" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(180) NOT NULL,
  "title" varchar(255) NOT NULL,
  "excerpt" text,
  "content_md" text,
  "content_json" jsonb,
  "category_id" integer,
  "audience" "docs_article_audience" DEFAULT 'mixed' NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "docs_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "docs_article_tags" (
  "article_id" integer NOT NULL,
  "tag_id" integer NOT NULL,
  CONSTRAINT "docs_article_tags_pk" PRIMARY KEY("article_id", "tag_id")
);
--> statement-breakpoint
ALTER TABLE "docs_articles" ADD CONSTRAINT "docs_articles_category_id_docs_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."docs_categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "docs_article_tags" ADD CONSTRAINT "docs_article_tags_article_id_docs_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."docs_articles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "docs_article_tags" ADD CONSTRAINT "docs_article_tags_tag_id_docs_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."docs_tags"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_articles_slug_idx" ON "docs_articles" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_articles_category_idx" ON "docs_articles" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_articles_published_idx" ON "docs_articles" USING btree ("is_published");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_article_tags_article_idx" ON "docs_article_tags" USING btree ("article_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_article_tags_tag_idx" ON "docs_article_tags" USING btree ("tag_id");
