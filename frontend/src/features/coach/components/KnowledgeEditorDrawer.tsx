import { useState, useCallback } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, X, Edit3, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DialogBase from "@/components/DialogBase";
import { useKnowledgeEditor } from "../hooks/useKnowledgeEditor";
import type { CoachKnowledgeRow } from "../coach.types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KnowledgeEditorDrawer({ open, onClose }: Props) {
  const { list, add, update, remove, reorder } = useKnowledgeEditor();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const startEdit = useCallback((row: CoachKnowledgeRow) => {
    setEditingId(row.id);
    setEditTitle(row.title);
    setEditBody(row.body);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditTitle("");
    setEditBody("");
  }, []);

  const saveEdit = useCallback(() => {
    if (editingId == null) return;
    update.mutate(
      { id: editingId, data: { title: editTitle, body: editBody } },
      { onSuccess: cancelEdit },
    );
  }, [editingId, editTitle, editBody, update, cancelEdit]);

  const move = useCallback(
    (idx: number, dir: -1 | 1) => {
      if (!list.data) return;
      const ids = list.data.map((r) => r.id);
      const target = idx + dir;
      if (target < 0 || target >= ids.length) return;
      [ids[idx], ids[target]] = [ids[target], ids[idx]];
      reorder.mutate(ids);
    },
    [list.data, reorder],
  );

  const sections = list.data ?? [];

  return (
    <DialogBase open={open} onClose={onClose} ariaLabel="Edit coach knowledge" className="max-w-3xl">
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">Edit Training Doc</h2>
            <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
              Sections the coach reads before every reply. Markdown supported.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid gap-3">
          {list.isLoading && (
            <div className="flex items-center gap-2 text-[var(--muted-foreground)] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {list.isError && <p className="text-red-400 text-sm">Failed to load.</p>}

          {sections.map((row, idx) =>
            editingId === row.id ? (
              <div key={row.id} className="rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] p-4">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Section title"
                  className="w-full mb-2 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm font-semibold outline-none focus:border-[var(--primary)]/50"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="Markdown content…"
                    rows={14}
                    className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]/50 resize-none font-mono"
                  />
                  <div className="rounded-lg border border-[var(--border)] bg-white/5 p-3 overflow-y-auto text-[13px] leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editBody || "_Empty_"}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={update.isPending}
                    className="px-4 py-1.5 rounded-xl bg-[var(--primary)] text-[#04130d] font-bold text-[13px] cursor-pointer hover:brightness-110 disabled:opacity-50"
                  >
                    {update.isPending ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-4 py-1.5 rounded-xl border border-[var(--border)] bg-white/5 text-[var(--foreground)] font-semibold text-[13px] cursor-pointer hover:brightness-110"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="font-bold text-[var(--foreground)] text-sm">{row.title}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="grid place-items-center w-7 h-7 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === sections.length - 1}
                      className="grid place-items-center w-7 h-7 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="grid place-items-center w-7 h-7 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove.mutate(row.id)}
                      className="grid place-items-center w-7 h-7 rounded-lg text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="px-4 pb-3 text-[13px] text-[var(--muted-foreground)] leading-relaxed max-h-24 overflow-hidden relative">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {row.body.slice(0, 500)}
                  </ReactMarkdown>
                  {row.body.length > 500 && (
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--card)] to-transparent" />
                  )}
                </div>
              </div>
            ),
          )}
        </div>

        <div className="px-5 py-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() =>
              add.mutate(
                { title: "New section", body: "" },
                {
                  onSuccess: (res) => {
                    if (res.success && res.data) startEdit(res.data);
                  },
                },
              )
            }
            disabled={add.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--primary)]/40 text-[var(--primary)] font-bold text-sm cursor-pointer hover:bg-[var(--primary)]/10 disabled:opacity-50"
          >
            {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add section
          </button>
        </div>
      </div>
    </DialogBase>
  );
}
