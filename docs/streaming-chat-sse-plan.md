# Streaming Coach Chat (SSE) — Implemented

> **Status: SHIPPED.** This doc describes the code as it actually runs (Option 3: reasoning + content streaming). Use it as a study guide for the SSE pattern — file/line references match the working code.
> Coach chat now streams token-by-token: reasoning ("💭 thinking") fills live, then the answer types out. The old buffered `POST /coach/chat` stays as a fallback.

---

## 1. What it does

Old behavior: `POST /coach/chat` buffered — `fetch` then `await res.json()`, whole reply at once, fake `TypingDots`.

New behavior: `POST /coach/chat/stream` streams over **SSE**. DeepSeek (`stream:true`, `thinking:true`) emits `reasoning_content` deltas then `content` deltas; the server re-emits tagged frames; the browser appends each delta live. You see the thinking box populate, then the answer grow.

**Scope:** streaming path has **no tools** (the read-only coach tools only run on the buffered path). DeepSeek-only (Gemini client untouched).

---

## 2. How SSE works (the concept)

One HTTP response, kept open, body streamed as UTF-8 text in repeating frames:

```
data: {"type":"reasoning","text":"Let me check"}\n\n
data: {"type":"content","text":"Today"}\n\n
data: {"done":true}\n\n
```

- One event = a `data: <json>` line + a blank line (`\n\n` terminator).
- We emit **our own** frame shapes — `{type,text}`, `{done:true}`, `{error}` — not DeepSeek's raw chunks. Keeps the browser contract simple and lets us tag reasoning vs content.
- Browser reads `response.body` as a `ReadableStream`, decodes, splits on `\n\n`.

**The generator chain (this is the heart of it):**

```
deepseekChatStream()   yield {type,text}   ← async generator, parses DeepSeek SSE
        │  yield*
chatStream()           yield* deepseek…    ← service generator, forwards every delta
        │  for await
/coach/chat/stream     for await (delta)   ← route consumes, re-emits OUR SSE frame
        │  fetch + getReader()
coachApi.chatStream()  onEvent({type,text})← browser reads stream, calls back per delta
        │
useCoach               setMessages(...)     ← reasoning→reasoning field, content→text
```

`yield` = emit one value, pause, resume later (lazy stream instead of one `return`).
`yield*` = delegate: forward every value from another generator without a manual loop.
`async function*` + `for await` = the async versions (each value may await the network).

---

## 3. The code, file by file

### `backend/src/llm/deepseek.ts` — parse DeepSeek's stream
- `interface StreamDelta { type: "reasoning" | "content"; text: string }`.
- `async function* deepseekChatStream(options)` — same fetch as `doChat` but `body.stream = true`, no `tools`.
- Reads `res.body!.getReader()`, `TextDecoder`, **buffers and splits on `\n\n`**, carries the trailing partial frame between reads (`buffer = frames.pop() ?? ""`).
- Per `data:` line: `[DONE]` → return; else `JSON.parse`, read `delta.reasoning_content` → yield `{type:"reasoning"}`, read `delta.content` → yield `{type:"content"}`.

### `backend/src/services/coach.service.ts` — business wrapper
- `async *chatStream(messages): AsyncGenerator<StreamDelta>`.
- Reuses the exact context build from `chat()`: `buildContext` + `loadCoachKnowledgeFromDB` + `buildCoachSystemPrompt`.
- Builds `system + user/assistant` history, then `yield* deepseekChatStream({ apiKey, model: DEEPSEEK_COACH_MODEL, thinking: true, messages })`.
- Guards on `deepseekApiKey` (streaming is DeepSeek-only).
- `chatStream` is declared on the `CoachService` interface returning `AsyncGenerator<StreamDelta>`.

### `backend/src/routes/coach.routes.ts` — SSE route
- `POST /coach/chat/stream`. **Bypasses `routeHandlerCtx`** (that wrapper JSON-encodes the return and would kill streaming). Returns a raw `Response` whose body is a `ReadableStream`.
- In `start(controller)`: `const send = obj => controller.enqueue(encoder.encode(\`data: ${JSON.stringify(obj)}\n\n\`))`. Then `for await (const delta of coachService.chatStream(body.messages)) send(delta)`, then `send({done:true})`, `catch` → `send({error})`, `finally` → `controller.close()`.
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Same body schema as `/coach/chat`.

### `frontend/src/lib/api/coach.ts` — browser stream reader
- `chatStream(messages, onEvent)` — **raw `fetch("/api/coach/chat/stream", …)`**, NOT the `api.post` helper (that does `res.json()` and would buffer).
- `res.body.getReader()` + `TextDecoder`, same `\n\n` split + partial-frame carry.
- Per frame: `evt.error` → throw; `evt.done` → return; `evt.type && evt.text` → `onEvent({type, text})`.

### `frontend/src/features/coach/hooks/useCoach.ts` — live render
- On send: push the user message **and** an empty `{role:"coach", text:""}` placeholder; set `streaming` true.
- `coachApi.chatStream([...history, userMsg], evt => setMessages(...))`: functional update of the **last** message — `reasoning` deltas append to `last.reasoning`, `content` deltas append to `last.text`.
- `.then` clears streaming; `.catch` writes `⚠️ <msg>` into the last bubble. Sends history **without** the empty placeholder (uses `messages.slice` from before the push) so no blank assistant message hits the API.

### `frontend/src/features/coach/components/ChatParts.tsx` — bubble
- `Bubble` already renders `m.reasoning` in a `<details>` "💭 Show thinking" block (above the content). No change needed — streamed reasoning fills it live.

### `frontend/src/pages/CoachPage.tsx` — single indicator
- The empty streaming placeholder bubble is **not rendered** (`m.role==="coach" && !m.text && !m.reasoning ? null : <Bubble/>`).
- `waiting = typing && lastIsEmptyCoach` → show `TypingDots` only **before** the first token. First reasoning/content delta flips it off and the growing bubble takes over. No double indicator.

---

## 4. The debugging lesson (how we found the bug)

Symptom: text appeared "all at once" in the UI. Trace:
1. **Timestamp the frames** in the browser console (`performance.now()` per `data:` frame). They arrived spread apart → streaming *worked* at the network layer.
2. The perceived "dump" was **`thinking:true`** front-loading a ~6s silent reasoning phase (we discarded reasoning deltas in the proof) + DeepSeek sending content in a few chunks.
3. Real root cause of "nothing changed": backend was started with `bun run src/index.ts` (no watch) — **stale process**, never loaded edits. And the browser was pointed at the wrong localhost.

**Rules learned:** when SSE "looks buffered," timestamp frames first (spread = working). A dump is usually upstream latency (thinking mode) or a stale server / wrong port — not the parser. Run the backend with `bun --hot src/index.ts` for auto-reload.

---

## 5. Reusable SSE recipe (for other projects)

- **Producer:** `async function*` that `fetch`es `stream:true`, reads `getReader()`, splits on `\n\n`, **carries the trailing partial frame**, yields parsed deltas.
- **Transport:** a route that returns a raw `Response(ReadableStream)` with `text/event-stream` headers and `controller.enqueue` of `data: ${JSON.stringify(x)}\n\n`. Bypass any response-wrapping middleware.
- **Consumer:** raw `fetch` + `res.body.getReader()` (never `.json()`), same `\n\n` parse, callback per delta.
- **Render:** push a placeholder, append deltas via functional state update; show one indicator at a time.
- The `buffer.split("\n\n")` + `frames.pop()` carry-over is the whole trick — a TCP chunk can slice a frame mid-JSON.

---

## 6. Deferred (not built)

- Stream the **tool-calling loop** (run a read tool between stream segments) so the streaming path can also read logs.
- `get_plan` / `update_plan` **write tools** + Plan-tab refresh — conversational "update my plan" → commit. **This is the next task.**
