CREATE TABLE "bodyweight_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"weight_kg" real NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bodyweight_logs_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"weight_kg" real DEFAULT 0,
	"height_cm" real DEFAULT 0,
	"tdee" real DEFAULT 0,
	"calories_intake" real DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rest_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"walked_10k" boolean DEFAULT false,
	"did_liss" boolean DEFAULT false,
	"did_stretch" boolean DEFAULT false,
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "rest_days_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_input" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"exercise_name" text NOT NULL,
	"weight" real DEFAULT 0,
	"reps" integer DEFAULT 0,
	"rpe" integer DEFAULT 0,
	"is_bodyweight" boolean DEFAULT false,
	"is_assisted" boolean DEFAULT false,
	"variant_details" text DEFAULT '',
	"notes_thai" text DEFAULT '',
	"notes_english" text DEFAULT '',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"muscle_group" text DEFAULT 'Other' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;