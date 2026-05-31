CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "food_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text DEFAULT '',
	"product_type" text DEFAULT '',
	"per_amount" real DEFAULT 100 NOT NULL,
	"per_unit" text DEFAULT 'g' NOT NULL,
	"calories" real DEFAULT 0,
	"protein" real DEFAULT 0,
	"carbs" real DEFAULT 0,
	"fat" real DEFAULT 0,
	"source" text DEFAULT 'google_sheet' NOT NULL,
	"source_row_id" text,
	"embedding" vector(768),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "food_catalog_source_row_id_idx" ON "food_catalog" USING btree ("source_row_id");--> statement-breakpoint
CREATE INDEX "food_catalog_embedding_idx" ON "food_catalog" USING hnsw ("embedding" vector_cosine_ops);