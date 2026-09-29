// Device-local coach chat history: finished chats are archived to localStorage
// when the user starts a new one ("New chat" archives instead of destroying),
// and can be resumed or deleted later. No server session storage exists — this
// mirrors the mobile app's chat-history pattern.
import type { CoachMessage } from "./coach.types";

const LS_KEY = "coach.chatSessions";
const SESSIONS_CAP = 20;
const TITLE_MAX_CHARS = 60;

export interface CoachChatSession {
    id: string;
    title: string;
    /** Epoch ms of the archive moment — the UI formats it for display. */
    updatedAt: number;
    messages: CoachMessage[];
}

/** Chat title = the first user line, trimmed to TITLE_MAX_CHARS. */
export function titleFromMessages(messages: CoachMessage[]): string {
    const first = messages.find((m) => m.role === "user")?.text.trim() ?? "";
    if (!first) return "New chat";
    return first.length > TITLE_MAX_CHARS ? first.slice(0, TITLE_MAX_CHARS - 1) + "…" : first;
}

/** Upsert by id into the archive, newest first, capped at SESSIONS_CAP. Pure —
 * no storage access, so it is directly unit-testable. */
export function upsertSession(sessions: CoachChatSession[], session: CoachChatSession): CoachChatSession[] {
    const rest = sessions.filter((s) => s.id !== session.id);
    return [session, ...rest].slice(0, SESSIONS_CAP);
}

export function loadSessions(): CoachChatSession[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveSessions(sessions: CoachChatSession[]): void {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(sessions));
    } catch {
        // Quota / serialization failure — history is a nicety, never fail the
        // chat over it.
    }
}

/** Snapshot the current conversation as an archive session, or null when it
 * carries nothing meaningful (bare placeholder bubbles don't count). */
export function sessionFromMessages(id: string, messages: CoachMessage[]): CoachChatSession | null {
    const meaningful = messages.filter(
        (m) => m.text.trim() !== "" || m.proposal || m.prescription,
    );
    if (meaningful.length === 0) return null;
    return {
        id,
        title: titleFromMessages(messages),
        updatedAt: Date.now(),
        messages,
    };
}
