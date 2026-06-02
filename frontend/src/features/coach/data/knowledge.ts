// Knowledge base content. Structure is final — fill in more articles as needed.
// Each category maps to an array of articles; the drawer renders whatever is here.

export interface KBSection {
    h: string;
    p?: string;
    list?: string[];
}

export interface KBArticle {
    id: string;
    title: string;
    read: string;
    tag: string;
    summary: string;
    body: KBSection[];
}

export interface KBCategory {
    id: string;
    emoji: string;
    title: string;
    desc: string;
}

export const KB_CATEGORIES: KBCategory[] = [
    { id: "concepts", emoji: "📘", title: "Concept Guides", desc: "RPE, overload, hypertrophy, deficits" },
    { id: "exercises", emoji: "🏋️", title: "Exercise Library", desc: "Cues, target muscles, common mistakes" },
    { id: "notes", emoji: "📝", title: "My Notes & Answers", desc: "Saved from your sessions & coach" },
    { id: "nutrition", emoji: "🍎", title: "Nutrition Reference", desc: "Protein, carbs, labels, Thai foods" },
];

// Seed article so the drawer isn't empty. TODO: add your own articles per category.
export const KB_ARTICLES: Record<string, KBArticle[]> = {
    concepts: [
        {
            id: "rpe",
            title: "RPE & RIR, explained",
            read: "3 min",
            tag: "Foundations",
            summary: "How hard a set felt, on a 1–10 scale — and how to use it to autoregulate.",
            body: [
                {
                    h: "What it is",
                    p: "RPE (Rate of Perceived Exertion) rates how hard a set felt from 1–10. RIR (Reps In Reserve) is the flip side: RPE 8 ≈ 2 reps left, RPE 9 ≈ 1 rep left, RPE 10 = failure.",
                },
                {
                    h: "Where to train",
                    list: [
                        "Most working sets: RPE 7–9 (1–3 reps in reserve)",
                        "Last set of an exercise: RPE 9–10 is fine",
                        "Technique / warm-up work: RPE 5–7",
                    ],
                },
            ],
        },
    ],
    exercises: [],
    notes: [],
    nutrition: [],
};

export function findArticle(id: string): KBArticle | null {
    for (const cat of Object.keys(KB_ARTICLES)) {
        const found = KB_ARTICLES[cat]?.find((a) => a.id === id);
        if (found) return found;
    }
    return null;
}
