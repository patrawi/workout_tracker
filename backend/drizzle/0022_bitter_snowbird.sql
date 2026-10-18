DROP INDEX "nutrition_references_provider_code_version_idx";--> statement-breakpoint
ALTER TABLE "nutrition_references" ADD COLUMN "user_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_references_provider_code_version_idx" ON "nutrition_references" USING btree ("provider","provider_food_code","version","user_id");