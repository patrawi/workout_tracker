import { useCallback, useEffect, useState } from "react";
import { coachApi } from "@/lib/api/coach";
import { sessionFromMessages, saveSessions, upsertSession, loadSessions } from "../coachHistory";
import type { CoachMessage } from "../coach.types";

const LS_KEY = "coach:msgs";
const LS_CAP = 50;

const MAX_TURNS = 12;

function loadMessages(): CoachMessage[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function useCoach() {
    const [messages, setMessages] = useState<CoachMessage[]>(loadMessages);
    const [streaming, setStreaming] = useState(false);

    useEffect(() => {
        localStorage.setItem(LS_KEY, JSON.stringify(messages.slice(-LS_CAP)));
    }, [messages]);

    const send = useCallback(
        (text: string) => {
            const clean = text.trim();
            if (!clean || streaming) return;

            const history = messages.slice(-MAX_TURNS);
            const next: CoachMessage[] = [...messages, { role: "user", text: clean }, { role: "coach", text: "" }];
            setMessages(next);
            setStreaming(true);

            coachApi
                .chatStream([...history, { role: "user", text: clean }], (evt) => {
                    setMessages((m) => {
                        const updated = [...m];
                        const last = updated[updated.length - 1];
                        if (last && last.role === "coach") {
                            if (evt.type === "plan_proposal") {
                                updated[updated.length - 1] = { ...last, proposal: evt.proposal };
                            } else if (evt.type === "session_prescription") {
                                updated[updated.length - 1] = { ...last, prescription: evt.prescription };
                            } else {
                                updated[updated.length - 1] =
                                    evt.type === "reasoning"
                                        ? { ...last, reasoning: (last.reasoning ?? "") + evt.text }
                                        : { ...last, text: last.text + evt.text };
                            }
                        }
                        return updated;
                    });
                })
                .then(() => setStreaming(false))
                .catch((err: Error) => {
                    setMessages((m) => {
                        const updated = [...m];
                        const last = updated[updated.length - 1];
                        if (last && last.role === "coach") {
                            updated[updated.length - 1] = { ...last, text: `⚠️ ${err.message}` };
                        }
                        return updated;
                    });
                    setStreaming(false);
                });
        },
        [messages, streaming],
    );

    /** Archive the current conversation (when it carries anything meaningful)
     * and start fresh — the owner's rule: closing/starting a new chat keeps
     * the old one in history instead of destroying it. */
    const newChat = useCallback(() => {
        const session = sessionFromMessages(crypto.randomUUID(), messages);
        if (session) {
            saveSessions(upsertSession(loadSessions(), session));
        }
        setMessages([]);
        localStorage.removeItem(LS_KEY);
    }, [messages]);

    /** Pull an archived conversation back into the current slot. Removing it
     * from the archive is the caller's job (the drawer owns that list). */
    const resume = useCallback((messages: CoachMessage[]) => {
        setMessages(messages);
    }, []);

    return { messages, send, newChat, resume, typing: streaming };
}
