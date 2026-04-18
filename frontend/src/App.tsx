import { useState, useCallback } from "react";
import WorkoutInput from "./components/WorkoutInput";
import ReviewModal from "./components/ReviewModal";
import CalendarHeatmap from "./components/CalendarHeatmap";
import RestDayForm from "./components/RestDayForm";
import { useWorkoutTracker } from "@/features/workouts/hooks/useWorkoutTracker";
import { useRestDay } from "@/features/workouts/hooks/useRestDay";
import type { WorkoutData } from "./types";

export default function App() {
  const {
    isParsing,
    isConfirming,
    error,
    parseWorkout,
    confirmWorkout,
    clearError,
  } = useWorkoutTracker();

  const [showRestDayForm, setShowRestDayForm] = useState(false);

  const { isSubmitting: isRestDaySubmitting, submitRestDay } = useRestDay(
    () => {
      setShowRestDayForm(false);
    },
  );

  // Review modal state
  const [reviewItems, setReviewItems] = useState<WorkoutData[] | null>(null);
  const [reviewRawText, setReviewRawText] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  // Step 1: Send text + date to AI for parsing → show review modal
  const handleParse = useCallback(
    async (rawText: string, workoutDate: string) => {
      const result = await parseWorkout(rawText);
      if (result) {
        setReviewItems(result);
        setReviewRawText(rawText);
        setReviewDate(workoutDate);
      }
    },
    [parseWorkout],
  );

  // Step 2: User confirmed → save to database
  const handleConfirm = useCallback(
    async (rawText: string, items: WorkoutData[], createdAt: string) => {
      const success = await confirmWorkout(rawText, items, createdAt);
      if (success) {
        setReviewItems(null);
        setReviewRawText("");
        setReviewDate("");
      }
    },
    [confirmWorkout],
  );

  const handleRestDaySubmit = useCallback(
    async (data: {
      date: string;
      walked_10k: boolean;
      did_liss: boolean;
      did_stretch: boolean;
      notes: string;
    }) => {
      await submitRestDay(data);
    },
    [submitRestDay],
  );

  const handleCancelReview = useCallback(() => {
    setReviewItems(null);
    setReviewRawText("");
    setReviewDate("");
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 pb-16">
      {/* Error banner */}
      {error ? (
        <div
          role="alert"
          className="mb-8 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-fade-in flex items-center justify-between mt-4"
        >
          <div>
            <span className="font-medium">Error:</span> {error}
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-red-400 hover:text-red-200 p-1"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      ) : null}

      <CalendarHeatmap />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start pt-4">
        <div className="lg:col-span-12 lg:sticky lg:top-28">
          <WorkoutInput
            onSubmit={handleParse}
            isLoading={isParsing}
            onRestDay={() => setShowRestDayForm(!showRestDayForm)}
            showRestDay={showRestDayForm}
          />

          {showRestDayForm && (
            <div className="w-full relative mt-4">
              <button
                type="button"
                onClick={() => setShowRestDayForm(false)}
                className="absolute -top-2 right-2 text-[10px] text-[var(--muted-foreground)] hover:text-white p-1 z-10"
                aria-label="Close rest day form"
              >
                ✕ Close
              </button>
              <RestDayForm
                onSubmit={handleRestDaySubmit}
                isLoading={isRestDaySubmitting}
              />
            </div>
          )}
        </div>
      </div>

      {/* Human-in-the-loop review modal */}
      {reviewItems ? (
        <ReviewModal
          items={reviewItems}
          rawText={reviewRawText}
          workoutDate={reviewDate}
          onConfirm={handleConfirm}
          onCancel={handleCancelReview}
          isSubmitting={isConfirming}
        />
      ) : null}
    </main>
  );
}
