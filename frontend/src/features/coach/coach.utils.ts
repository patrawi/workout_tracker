export interface Suggestion {
  en: string;
  th: string;
  short: string;
}

export const SUGGESTIONS: Suggestion[] = [
  { th: "ทำไมเล่น crunch แล้วปวดหลังคอ?", en: "Why does my neck hurt on crunches?", short: "🤕 Neck pain on crunches" },
  { th: "กินโปรตีนพอไหม?", en: "Am I eating enough protein?", short: "🍗 Enough protein?" },
  { th: "วันนี้ควรเล่นอะไรดี?", en: "What should I train next?", short: "📅 What to train next" },
  { th: "RPE คืออะไร?", en: "Explain RPE", short: "📊 Explain RPE" },
];
