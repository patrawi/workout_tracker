CREATE TABLE "nutrition_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"meal" text NOT NULL,
	"food_name" text NOT NULL,
	"protein" real DEFAULT 0,
	"carbs" real DEFAULT 0,
	"fat" real DEFAULT 0,
	"calories" real DEFAULT 0,
	"has_missing_macros" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "protein_target" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "carbs_target" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "fat_target" real DEFAULT 0;