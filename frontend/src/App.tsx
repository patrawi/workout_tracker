import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, X } from "lucide-react";
import WorkoutInput from "./components/WorkoutInput";
import ReviewModal from "./components/ReviewModal";
import RestDayForm from "./components/RestDayForm";
import Greeting from "./components/home/Greeting";
import StreakCalendar from "./components/home/StreakCalendar";
import TodayCard from "./components/home/TodayCard";
import RecentActivity from "./components/home/RecentActivity";
import { useWorkoutTracker } from "@/features/workouts/hooks/useWorkoutTracker";
import { useRestDay } from "@/features/workouts/hooks/useRestDay";
import type { WorkoutData, SessionActivityData } from "./types";

export default function App() {
  const navigate = useNavigate();
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
  const [feedbackSessionId, setFeedbackSessionId] = useState<number | null>(null);

  // Step 1: Send text + date to AI for parsing → show review modal
  const handleParse = useCallback(
    async (rawText: string, workoutDate: string) => {
      setFeedbackSessionId(null);
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
    async (rawText: string, items: WorkoutData[], createdAt: string, activity: SessionActivityData) => {
      const savedRows = await confirmWorkout(rawText, items, createdAt, activity);
      if (savedRows) {
        setReviewItems(null);
        setReviewRawText("");
        setReviewDate("");
        setFeedbackSessionId(savedRows[0]?.session_id ?? null);
      }
    },
    [confirmWorkout],
  );

  const handleCoachFeedback = useCallback(() => {
    if (feedbackSessionId === null) return;
    const initialMessage =
      `Give feedback for session_id=${feedbackSessionId}. ` +
      "Compare it against the saved plan and previous matching sessions before this session, then propose the next matching plan if appropriate. Do not save until I confirm.";
    setFeedbackSessionId(null);
    navigate("/coach", { state: { initialMessage } });
  }, [feedbackSessionId, navigate]);

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
    <main className="max-w-4xl mx-auto px-4 pb-16 space-y-5">
      {/* Error banner */}
      {error ? (
        <div
          role="alert"
          className="px-5 py-3 rounded-xl animate-fade-in flex items-center justify-between mt-4 text-sm"
          style={{
            background: "oklch(0.55 0.2 25 / 0.1)",
            border: "1px solid oklch(0.55 0.2 25 / 0.3)",
            color: "oklch(0.75 0.15 25)",
          }}
        >
          <div>
            <span className="font-medium">Error:</span> {error}
          </div>
          <button
            type="button"
            onClick={clearError}
            className="flex items-center justify-center w-11 h-11 rounded-lg transition-colors hover:bg-[oklch(0.55_0.2_25_/_0.15)]"
            style={{ color: "oklch(0.75 0.15 25)" }}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      ) : null}

      <Greeting />

      <div className="relative">
        {!showRestDayForm ? (
          <div key="workout" className="shuffle-in-left">
            <WorkoutInput
              onSubmit={handleParse}
              isLoading={isParsing}
              onRestDay={() => setShowRestDayForm(true)}
              showRestDay={false}
            />
          </div>
        ) : (
          <div key="rest" className="shuffle-in-right relative">
            <button
              type="button"
              onClick={() => setShowRestDayForm(false)}
              className="absolute -top-2 right-2 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center justify-center w-11 h-11 z-10 transition-colors"
              aria-label="Switch back to workout input"
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

      {feedbackSessionId !== null ? (
        <div className="glass-card px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Workout saved
            </p>
            <p className="text-xs text-surface-400 mt-1">
              Ask Coach for feedback on session #{feedbackSessionId}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCoachFeedback}
              className="btn-primary text-sm inline-flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Get coach feedback
            </button>
            <button
              type="button"
              onClick={() => setFeedbackSessionId(null)}
              className="grid place-items-center w-11 h-11 rounded-xl text-surface-400 hover:text-[var(--foreground)] hover:bg-surface-200/50 transition-colors"
              aria-label="Dismiss coach feedback prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}

      <StreakCalendar />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TodayCard />
        <RecentActivity limit={4} />
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
