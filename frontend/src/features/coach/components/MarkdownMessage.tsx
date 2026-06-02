import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Hoisted once (rendering-hoist-jsx): a stable components map so react-markdown
// doesn't get a new object every render.
const components: Components = {
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    h1: ({ children }) => <h1 className="mt-3 mb-2 first:mt-0 text-lg font-bold text-[var(--foreground)]">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-3 mb-2 first:mt-0 text-base font-bold text-[var(--foreground)]">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-3 mb-1.5 first:mt-0 text-[15px] font-bold text-[var(--foreground)]">{children}</h3>,
    ul: ({ children }) => <ul className="my-2 pl-5 list-disc grid gap-1">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 pl-5 list-decimal grid gap-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline">
            {children}
        </a>
    ),
    code: ({ children }) => (
        <code className="px-1 py-0.5 rounded bg-white/10 text-[13px] font-mono">{children}</code>
    ),
    blockquote: ({ children }) => (
        <blockquote className="my-2 pl-3 border-l-2 border-[var(--border)] text-[var(--muted-foreground)]">{children}</blockquote>
    ),
    hr: () => <hr className="my-3 border-[var(--border)]" />,
    table: ({ children }) => (
        <div className="my-2 overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">{children}</table>
        </div>
    ),
    th: ({ children }) => (
        <th className="border border-[var(--border)] px-2.5 py-1.5 text-left font-semibold bg-white/5 whitespace-nowrap">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="border border-[var(--border)] px-2.5 py-1.5 align-top">{children}</td>
    ),
};

function MarkdownMessageImpl({ text }: { text: string }) {
    return (
        <div className="text-[15px] text-[var(--foreground)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {text}
            </ReactMarkdown>
        </div>
    );
}

// rerender-memo: bubbles are immutable once added — memoize so appending a new
// message doesn't re-parse markdown for every existing message.
export const MarkdownMessage = memo(MarkdownMessageImpl);
