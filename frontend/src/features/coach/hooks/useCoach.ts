import { useCallback, useEffect, useState } from "react";
import { coachApi } from "@/lib/api/coach";
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

    const reset = useCallback(() => {
        setMessages([]);
        localStorage.removeItem(LS_KEY);
    }, []);

    return { messages, send, reset, typing: streaming };
}
