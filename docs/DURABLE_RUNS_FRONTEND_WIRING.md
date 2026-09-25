# Durable Agent Runs — Frontend Wiring (DONE)

> **Status:** DONE — 2026-09-08 (wired end-to-end)
> **Scope:** backend durable-run persistence was already live; the web app now
> consumes it (create → stream → reconnect/replay → cancel) instead of the
> non-durable `/api/ai/agent` POST stream.

---

## 1. What the frontend does now

`sw-data-explorer/src/components/ai/hooks/useAgentStream.ts` implements the durable flow:

1. **Create** — `POST /api/ai/runs` with the same body the hook always sent
   (Node proxy creates the chat row + title; Python writes the messages).
2. **Stream** — `GET /api/ai/runs/:runId/stream` (SSE). Event payloads are
   unchanged (`thinking`, `plan`, `tool_call`, `tool_result`, `artifact`,
   `delta`, `done`, `error`, `quota_exceeded`, …), so the reducers in
   `useAIAgent.ts` were reused as-is.
3. **Reconnect** — on a transient drop the hook re-opens the stream; the backend
   replays the full buffered event history, so the UI re-syncs and no turn is
   lost. `onReconnect` resets accumulated UI state before the replay so events
   apply exactly once in order. Backoff is capped (1s→10s, max 8 attempts).
4. **Cancel** — `abort()` now fires `POST /api/ai/runs/:runId/cancel` (in
   addition to aborting the fetch) so the server-side agent loop is stopped.
5. **Refresh-resume** — `runId` + the request are stored in `sessionStorage`
   (`sw_durable_pending_run`); on mount the hook reconnects to the run and
   rebuilds the UI from the buffered replay (TTL 15 min). A run that completed,
   errored, or was aborted clears the stored entry.

## 2. Node proxy (`backend/routes/ai/handlers/durable-runs.js`)

- `POST /api/ai/runs` → Python `POST /ai/runs` (quota check for authed users;
  guest guard mirrors `/api/ai/agent`). Returns `{ run_id, status, chat_id }`.
- `GET  /api/ai/runs/:runId/stream` → pipes Python SSE (with 90s inactivity
  guard, like `stream-agent.js`).
- `POST /api/ai/runs/:runId/cancel` and `GET /api/ai/runs/:runId` → passthrough.
- Node is **not** a message writer here: Python (`_persist_durable_run`)
  inserts the user + assistant rows exactly once and runs compaction/memory.

## 3. Backend additions made for this switch (Python)

- `RunRecord.subscribe()` now pushes an end-of-stream `None` sentinel after the
  replay when the run is already terminal → reconnecting clients don't hang on
  keepalives.
- `RunRecord.emit_error(message, code)` — `_runner()` broadcasts a terminal
  `error` SSE frame (cancelled / run_failed) into the event buffer, so late /
  reconnecting clients receive a visible terminal event.

## 4. Backward compat

`/api/ai/agent` (Node) and the old in-line POST stream are untouched and still
work — kept as the rollback path and for other callers. The two flows do NOT
interfere: /ai/agent messages are Node-written, durable-run messages are
Python-written.

## 5. Verification

- Python: `tests/test_durable_run_flow.py`, `tests/test_run_store.py`,
  `tests/test_compaction.py` → green (95 incl. scheduler/pinboard suites).
- Node: `backend/test/__tests__/durable-runs.test.js` (9 tests) + full Node
  suite → 177 passed.
- Frontend: `tsc --noEmit` clean; `npm run build` succeeds.

## 6. Known warts (deliberately not fixed in this pass)

- No run-ownership check: any client that knows a `runId` can stream/cancel it
  (hard-to-guess UUID; consistent with the app's existing guest/demo posture).
- If the run dies before producing an assistant message, the chat_messages user
  row is not written (the user message IS preserved on the `ai_runs` row).
- `export` tool downloads re-trigger during a post-refresh replay.
- `npm run lint` in `sw-data-explorer` is pre-existing broken (no eslint config).