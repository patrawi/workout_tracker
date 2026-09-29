import { describe, expect, test } from "bun:test";
import {
    sessionFromMessages,
    titleFromMessages,
    upsertSession,
    type CoachChatSession,
} from "./coachHistory";
import type { CoachMessage } from "./coach.types";

const user = (text: string): CoachMessage => ({ role: "user", text });
const coach = (text: string): CoachMessage => ({ role: "coach", text });

describe("titleFromMessages", () => {
    test("uses the first user line and trims to 60 chars with an ellipsis", () => {
        const long = "a".repeat(80);
        expect(titleFromMessages([user(long)])).toHaveLength(60);
        expect(titleFromMessages([user(long)])!.endsWith("…")).toBe(true);
        expect(titleFromMessages([user("สวัสดีครับ"), coach("hi")])).toBe("สวัสดีครับ");
    });

    test("falls back to 'New chat' when there is no user text", () => {
        expect(titleFromMessages([coach("welcome")])).toBe("New chat");
        expect(titleFromMessages([])).toBe("New chat");
    });
});

describe("upsertSession", () => {
    const session = (id: string): CoachChatSession => ({
        id,
        title: `t-${id}`,
        updatedAt: 0,
        messages: [user("hi")],
    });

    test("prepends new sessions and keeps the newest first", () => {
        const list = upsertSession(upsertSession([], session("a")), session("b"));
        expect(list.map((s) => s.id)).toEqual(["b", "a"]);
    });

    test("re-upserting the same id replaces in place at the top, never duplicates", () => {
        let list = upsertSession(upsertSession([], session("a")), session("b"));
        list = upsertSession(list, session("a"));
        expect(list.map((s) => s.id)).toEqual(["a", "b"]);
    });

    test("caps the archive at 20 sessions, dropping the oldest", () => {
        let list: CoachChatSession[] = [];
        for (let i = 0; i < 25; i++) list = upsertSession(list, session(`s${i}`));
        expect(list).toHaveLength(20);
        expect(list.map((s) => s.id)).not.toContain("s0");
        expect(list[0]!.id).toBe("s24");
    });
});

describe("sessionFromMessages", () => {
    test("skips the empty streaming placeholder and returns null for an empty chat", () => {
        expect(sessionFromMessages("x", [coach("")])).toBeNull();
        expect(sessionFromMessages("x", [])).toBeNull();
    });

    test("keeps chats that only carry a proposal or prescription (no text)", () => {
        const s = sessionFromMessages("x", [
            user("plan"),
            { role: "coach", text: "", proposal: { day_type: "Push", exercises: [] } },
        ]);
        expect(s).not.toBeNull();
        expect(s!.title).toBe("plan");
        expect(s!.messages).toHaveLength(2);
    });
});
