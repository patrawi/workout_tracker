import db from "./db/client";

export { db };

export {
  getRecentWorkouts,
  insertWorkouts,
  insertWorkout,
  getDistinctExercises,
  getWorkoutsByExercise,
  getRecentNotes,
  getWorkoutDates,
  getWorkoutsByDate,
  updateWorkout,
  deleteWorkout,
  type WorkoutUpdateData,
} from "./repositories/workout.repository";

export {
  upsertRestDay,
  deleteRestDay,
  type RestDayInput,
  type RestDayRow,
} from "./repositories/rest-day.repository";

export {
  insertBodyweightLog,
  getBodyweightLogs,
  type BodyweightLogRow,
} from "./repositories/bodyweight.repository";

export {
  getWorkoutHeatmap,
  getVolumeAnalytics,
  type HeatmapDay,
  type VolumeData,
} from "./repositories/analytics.repository";

export {
  ensureProfileRow,
  getProfile,
  updateProfile,
  type ProfileUpdateInput,
} from "./repositories/profile.repository.ts";

export { type WorkoutData, type WorkoutRow, type ProfileRow } from "./types";

export default db;
