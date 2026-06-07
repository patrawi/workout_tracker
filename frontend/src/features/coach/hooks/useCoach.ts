import { useCallback, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { coachApi } from "@/lib/api/coach";
import type { CoachMessage } from "../coach.types";

const LS_KEY = "coach:msgs";
const LS_CAP = 50;

// Last N messages sent as context.
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

    useEffect(() => {
        localStorage.setItem(LS_KEY, JSON.stringify(messages.slice(-LS_CAP)));
    }, [messages]);

    const mutation = useMutation({
        mutationFn: async (history: CoachMessage[]) => {
            const res = await coachApi.chat(history.slice(-MAX_TURNS));
            if (res.success && res.data) return res.data.reply;
            throw new Error(res.error || "Coach failed to reply");
        },
    });

    const send = useCallback(
        (text: string) => {
            const clean = text.trim();
            if (!clean || mutation.isPending) return;

            const next: CoachMessage[] = [...messages, { role: "user", text: clean }];
            setMessages(next);
            mutation.mutate(next, {
                onSuccess: (reply) => setMessages((m) => [...m, { role: "coach", text: reply }]),
                onError: (err: Error) =>
                    setMessages((m) => [...m, { role: "coach", text: `⚠️ ${err.message}` }]),
            });
        },
        [messages, mutation],
    );

    const reset = useCallback(() => {
        setMessages([]);
        localStorage.removeItem(LS_KEY);
    }, []);

    return { messages, send, reset, typing: mutation.isPending };
}
