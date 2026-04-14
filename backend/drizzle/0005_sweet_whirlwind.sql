CREATE INDEX "rest_days_created_at_idx" ON "rest_days" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workouts_created_at_idx" ON "workouts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workouts_exercise_name_idx" ON "workouts" USING btree ("exercise_name");