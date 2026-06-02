CREATE TABLE "coach_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"exercise_name" text NOT NULL,
	"is_bodyweight" boolean DEFAULT false NOT NULL,
	"target_weight" real,
	"sets" integer DEFAULT 3 NOT NULL,
	"rep_low" integer DEFAULT 0 NOT NULL,
	"rep_high" integer DEFAULT 0 NOT NULL,
	"rpe_low" integer DEFAULT 0 NOT NULL,
	"rpe_high" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "coach_plan_day_type_idx" ON "coach_plan" USING btree ("day_type");