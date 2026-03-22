CREATE TABLE "landing_content" (
  "id" serial PRIMARY KEY NOT NULL,
  "home_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "faq_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "landing_pages" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(120) NOT NULL,
  "slug" varchar(140) NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "landing_pages_slug_unique" UNIQUE("slug")
);
