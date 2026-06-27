import { test, expect } from "./fixtures";
import type { Route } from "@playwright/test";

// Coach chat streams its reply over SSE (POST /api/coach/chat/stream). We mock the
// stream by fulfilling with a body of `data: {...}\n\n` frames — the frontend reads
// the body, splits on \n\n, parses each frame's {type,text}, and appends content.
// Asserts the streamed assistant reply renders.

// Build an SSE body from content chunks (mirrors the server's frame format).
function sseBody(chunks: string[]): string {
  const frames = chunks.map((text) => `data: ${JSON.stringify({ type: "content", text })}`);
  frames.push(`data: ${JSON.stringify({ type: "content", text: "", done: true })}`);
  return frames.join("\n\n") + "\n\n";
}

test("coach chat renders the streamed reply", async ({ authedPage: page }) => {
  await page.route("**/api/coach/chat/stream", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseBody(["Add ", "2.5kg ", "next session."]),
    }),
  );

  await page.goto("/coach");

  // Default tab is Chat. Type a message and send.
  await page.getByPlaceholder(/Ask your coach/).fill("Should I add weight?");
  await page.getByRole("button", { name: "Send message" }).click();

  // The assembled streamed reply appears in the conversation.
  await expect(page.getByText("Add 2.5kg next session.")).toBeVisible();
});
