CREATE TYPE "public"."estimate_revision_status" AS ENUM('pending_confirmation', 'confirmed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."meal_component_weight_mode" AS ENUM('measured', 'estimated');--> statement-breakpoint
CREATE TYPE "public"."meal_image_role" AS ENUM('before', 'after', 'label_or_menu');--> statement-breakpoint
CREATE TYPE "public"."meal_observation_status" AS ENUM('draft', 'confirmed', 'reference_pending');--> statement-breakpoint
CREATE TYPE "public"."portion_mode" AS ENUM('measured', 'estimated');--> statement-breakpoint
CREATE TABLE "meal_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"observation_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"weight_mode" "meal_component_weight_mode" NOT NULL,
	"weight_low" real,
	"weight_central" real,
	"weight_high" real,
	"consumed_fraction" real DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"observation_id" integer NOT NULL,
	"role" "meal_image_role" NOT NULL,
	"object_key" text,
	"checksum" text,
	"consent" boolean DEFAULT false,
	"evaluation_eligible" boolean DEFAULT false,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meal_ingredient_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"component_id" integer NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"basis" text NOT NULL,
	"grams_low" real,
	"grams_central" real,
	"grams_high" real,
	"per100" jsonb
);
--> statement-breakpoint
CREATE TABLE "meal_latent_hints" (
	"id" serial PRIMARY KEY NOT NULL,
	"component_id" integer NOT NULL,
	"kind" text NOT NULL,
	"level" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"menu_name" text NOT NULL,
	"portion_mode" "portion_mode" NOT NULL,
	"meal_source" text,
	"status" "meal_observation_status" DEFAULT 'draft' NOT NULL,
	"reference_id" integer,
	"match_tier" text,
	"calculation" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nutrition_estimate_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"observation_id" integer NOT NULL,
	"reference_id" integer,
	"reference_provider" text,
	"reference_version" text,
	"calculation" jsonb NOT NULL,
	"status" "estimate_revision_status" DEFAULT 'pending_confirmation' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"confirmed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "nutrition_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_food_code" text NOT NULL,
	"version" text NOT NULL,
	"name_en" text,
	"name_th" text,
	"protein" real DEFAULT 0 NOT NULL,
	"carbs" real DEFAULT 0 NOT NULL,
	"fat" real DEFAULT 0 NOT NULL,
	"alcohol" real DEFAULT 0 NOT NULL,
	"calories" real DEFAULT 0 NOT NULL,
	"extra_nutrients" jsonb,
	"embedding" vector(768),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "nutrition_logs" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "nutrition_logs" ADD COLUMN "observation_id" integer;--> statement-breakpoint
ALTER TABLE "meal_components" ADD CONSTRAINT "meal_components_observation_id_meal_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."meal_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_images" ADD CONSTRAINT "meal_images_observation_id_meal_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."meal_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_ingredient_evidence" ADD CONSTRAINT "meal_ingredient_evidence_component_id_meal_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."meal_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_latent_hints" ADD CONSTRAINT "meal_latent_hints_component_id_meal_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."meal_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_observations" ADD CONSTRAINT "meal_observations_reference_id_nutrition_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."nutrition_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_estimate_revisions" ADD CONSTRAINT "nutrition_estimate_revisions_observation_id_meal_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."meal_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_estimate_revisions" ADD CONSTRAINT "nutrition_estimate_revisions_reference_id_nutrition_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."nutrition_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_components_observation_idx" ON "meal_components" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "meal_images_observation_idx" ON "meal_images" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "meal_ingredient_evidence_component_idx" ON "meal_ingredient_evidence" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "meal_latent_hints_component_idx" ON "meal_latent_hints" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "meal_observations_status_idx" ON "meal_observations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meal_observations_date_idx" ON "meal_observations" USING btree ("date");--> statement-breakpoint
CREATE INDEX "nutrition_estimate_revisions_observation_idx" ON "nutrition_estimate_revisions" USING btree ("observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_references_provider_code_version_idx" ON "nutrition_references" USING btree ("provider","provider_food_code","version");--> statement-breakpoint
CREATE INDEX "nutrition_references_name_th_idx" ON "nutrition_references" USING btree ("name_th");--> statement-breakpoint
CREATE INDEX "nutrition_references_name_en_idx" ON "nutrition_references" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "nutrition_references_embedding_idx" ON "nutrition_references" USING hnsw ("embedding" vector_cosine_ops);