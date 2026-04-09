export const queryKeys = {
    workouts: {
        all: ["workouts"] as const,
        list: () => [...queryKeys.workouts.all, "list"] as const,
        byDate: (date: string) => [...queryKeys.workouts.all, "byDate", date] as const,
    },
    profile: {
        all: ["profile"] as const,
    },
    bodyweight: {
        all: ["bodyweight"] as const,
        list: (range: string) => [...queryKeys.bodyweight.all, "list", range] as const,
    },
    nutrition: {
        all: ["nutrition"] as const,
        byDate: (date: string) => [...queryKeys.nutrition.all, "byDate", date] as const,
        dates: () => [...queryKeys.nutrition.all, "dates"] as const,
    },
    analytics: {
        all: ["analytics"] as const,
        exercises: () => [...queryKeys.analytics.all, "exercises"] as const,
        exerciseData: (exercise: string, range: string) =>
            [...queryKeys.analytics.all, "exerciseData", exercise, range] as const,
        notes: (exercise: string) =>
            [...queryKeys.analytics.all, "notes", exercise] as const,
        volume: (days: string) => [...queryKeys.analytics.all, "volume", days] as const,
    },
    heatmap: {
        all: ["heatmap"] as const,
    },
    history: {
        all: ["history"] as const,
        dates: () => [...queryKeys.history.all, "dates"] as const,
    },
};
