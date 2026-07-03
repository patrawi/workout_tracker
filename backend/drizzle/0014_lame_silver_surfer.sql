ALTER TABLE "coach_plan" ADD COLUMN "exercise_role" text DEFAULT 'isolation' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_plan" ADD COLUMN "progression_ladder" text DEFAULT 'double_12' NOT NULL;--> statement-breakpoint
UPDATE "coach_plan"
SET "exercise_role" = 'compound'
WHERE "exercise_name" IN (
  'Machine Incline Press / Converging',
  'Shoulder Press Machine',
  'Dips',
  'Pull Up / Assisted Pull Up',
  'One Arm Dumbbell Row',
  'Lat Pulldown Machine',
  'Dumbbell Goblet Squat',
  'Leg Press Machine',
  'Glute Trainer (Official)'
);--> statement-breakpoint
UPDATE "coach_plan"
SET "progression_ladder" = 'double_15'
WHERE "exercise_name" IN (
  'Dumbbell Lateral Raise',
  'Machine Reverse Fly'
);--> statement-breakpoint
UPDATE "coach_plan"
SET "progression_ladder" = 'bodyweight_high_rep'
WHERE "exercise_name" = 'Leg Raise';
