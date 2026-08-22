CREATE TABLE IF NOT EXISTS "chat_theme" (
  "id" serial PRIMARY KEY NOT NULL,
  "background_type" varchar(20) DEFAULT 'solid' NOT NULL,
  "background_color" varchar(30) DEFAULT '#F4F4F5' NOT NULL,
  "background_image_url" text,
  "user_bubble_color" varchar(30) DEFAULT '#E2EDE4' NOT NULL,
  "contact_bubble_color" varchar(30) DEFAULT '#FFFFFF' NOT NULL,
  "dark_background_color" varchar(30) DEFAULT '#27272A' NOT NULL,
  "dark_user_bubble_color" varchar(30) DEFAULT '#2A352E' NOT NULL,
  "dark_contact_bubble_color" varchar(30) DEFAULT '#18181B' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
