import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { coachApi } from "@/lib/api/coach";
import type { CoachMessage } from "../coach.types";

// Last N messages sent as context (ephemeral — history lives in React state only).
const MAX_TURNS = 12;

export function useCoach() {
    const [messages, setMessages] = useState<CoachMessage[]>([]);

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

    const reset = useCallback(() => setMessages([]), []);

    return { messages, send, reset, typing: mutation.isPending };
}
