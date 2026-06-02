import { useState } from "react";
import { ChevronLeft, X, BookOpen } from "lucide-react";
import { KB_CATEGORIES, KB_ARTICLES, findArticle, type KBArticle } from "../data/knowledge";

function ArticleBody({ a }: { a: KBArticle }) {
    return (
        <div className="grid gap-5">
            {a.body.map((s, i) => (
                <div key={i}>
                    <div className="text-[13px] font-bold text-[var(--primary)] uppercase tracking-wide mb-1.5">{s.h}</div>
                    {s.p && <p className="m-0 text-[var(--foreground)]/90 leading-relaxed">{s.p}</p>}
                    {s.list && (
                        <ul className="mt-1 pl-5 grid gap-1.5 text-[var(--foreground)]/90 leading-snug list-disc">
                            {s.list.map((li, j) => (
                                <li key={j}>{li}</li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
        </div>
    );
}

interface KnowledgeDrawerProps {
    open: boolean;
    articleId?: string | null;
    initialCat?: string;
    onClose: () => void;
}

export function KnowledgeDrawer({ open, articleId, initialCat, onClose }: KnowledgeDrawerProps) {
    const [view, setView] = useState<"browse" | "article">(articleId ? "article" : "browse");
    const [current, setCurrent] = useState<string | null>(articleId ?? null);
    const [cat, setCat] = useState<string>(initialCat ?? "concepts");

    // Re-sync internal state each time the drawer transitions to open, derived
    // from the props it was opened with. Done during render (not an effect) per
    // React's "adjusting state when a prop changes" guidance.
    const [wasOpen, setWasOpen] = useState(false);
    if (open && !wasOpen) {
        setWasOpen(true);
        setCurrent(articleId ?? null);
        setView(articleId ? "article" : "browse");
        setCat(initialCat ?? "concepts");
    } else if (!open && wasOpen) {
        setWasOpen(false);
    }

    const article = current ? findArticle(current) : null;
    const articles = KB_ARTICLES[cat] ?? [];

    return (
        <>
            <div
                onClick={onClose}
                className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
                style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
                aria-hidden="true"
            />
            <aside
                className="fixed top-0 right-0 bottom-0 w-[440px] max-w-[92%] z-50 bg-[var(--background)] border-l border-[var(--border)] flex flex-col shadow-2xl transition-transform duration-300"
                style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2.5">
                        {view === "article" && (
                            <button
                                type="button"
                                onClick={() => setView("browse")}
                                className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                aria-label="Back"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        )}
                        <span className="font-bold text-[var(--foreground)]">📚 Knowledge base</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {view === "browse" ? (
                        <div className="grid gap-4">
                            <div className="flex gap-2 flex-wrap">
                                {KB_CATEGORIES.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setCat(c.id)}
                                        className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border ${
                                            cat === c.id
                                                ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[var(--primary)]"
                                                : "border-[var(--border)] text-[var(--muted-foreground)]"
                                        }`}
                                    >
                                        {c.emoji} {c.title}
                                    </button>
                                ))}
                            </div>
                            {articles.length === 0 ? (
                                <p className="text-[var(--muted-foreground)] text-sm">No articles in this category yet.</p>
                            ) : (
                                <div className="grid gap-2.5">
                                    {articles.map((art) => (
                                        <button
                                            key={art.id}
                                            type="button"
                                            onClick={() => {
                                                setCurrent(art.id);
                                                setView("article");
                                            }}
                                            className="text-left p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/40 transition"
                                        >
                                            <div className="flex justify-between gap-2.5">
                                                <span className="font-bold text-[var(--foreground)]">{art.title}</span>
                                                <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">{art.read}</span>
                                            </div>
                                            <div className="text-[13px] text-[var(--muted-foreground)] mt-1 leading-snug">{art.summary}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : article ? (
                        <div>
                            <div className="text-xs font-bold text-[var(--primary)] uppercase tracking-wide">{article.tag}</div>
                            <h2 className="mt-1.5 mb-4 text-2xl font-extrabold text-[var(--foreground)]">{article.title}</h2>
                            <ArticleBody a={article} />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                            <BookOpen className="w-4 h-4" /> Article not found.
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
