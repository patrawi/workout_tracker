CREATE TABLE "canonical_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_exercise_code" text NOT NULL,
	"version" text NOT NULL,
	"name_en" text,
	"equipment" text,
	"body_part" text,
	"primary_muscles" jsonb DEFAULT '[]'::jsonb,
	"secondary_muscles" jsonb DEFAULT '[]'::jsonb,
	"mechanic" text,
	"is_unilateral" boolean DEFAULT false NOT NULL,
	"is_bodyweight" boolean DEFAULT false NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exercise_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_exercise_id" integer NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "equipment" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "canonical_exercise_id" integer;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "match_tier" text;--> statement-breakpoint
ALTER TABLE "exercise_aliases" ADD CONSTRAINT "exercise_aliases_canonical_exercise_id_canonical_exercises_id_fk" FOREIGN KEY ("canonical_exercise_id") REFERENCES "public"."canonical_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_exercises_provider_code_version_idx" ON "canonical_exercises" USING btree ("provider","provider_exercise_code","version");--> statement-breakpoint
CREATE INDEX "canonical_exercises_name_en_idx" ON "canonical_exercises" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "canonical_exercises_embedding_idx" ON "canonical_exercises" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_aliases_alias_idx" ON "exercise_aliases" USING btree ("alias");--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_canonical_exercise_id_canonical_exercises_id_fk" FOREIGN KEY ("canonical_exercise_id") REFERENCES "public"."canonical_exercises"("id") ON DELETE no action ON UPDATE no action;