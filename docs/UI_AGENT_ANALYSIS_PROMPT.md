# Frontend UI Analysis Prompt (Data Explorer / Resona AI)

Use this prompt verbatim with an analysis agent. It is an **analysis-only** task:
the agent must NOT edit any code, run a build, or change files. It reports back.

---

You are analyzing the Data Explorer (Resona AI) chat frontend in this repository.
The app is the React + TypeScript SPA under `sw-data-explorer/`, talking to a
Node backend (`backend/`) which proxies agent runs to a Python backend
(`backend-ai/`) that streams SSE events.

**Your job: produce a precise engineering report on how the chat UI currently
shows, orders, streams, and persists agent messages, and what must change to
reach a Claude-Code-style execution UI (live thinking, tool calls with inputs,
progressive tool results, per-step duration, streaming output, and a message
timeline that matches what is saved to the database).**

Constraints:
- Do NOT edit code, create files, or run mutations. Read-only investigation only.
- Cite concrete evidence: `file_path:line` for every claim.
- Be specific and exhaustive; do not pad. Answer every question below.
- End with (1) a bug list, (2) an event→component mapping table, and (3) a
  prioritized redesign plan.

## Where to look

- Frontend: `sw-data-explorer/src/`
  - `components/data-explorer/ai/chat/ChatMessage.tsx`, `types.ts`
  - `components/data-explorer/ai/tools/LiveToolSteps.tsx`, `ToolCallCard.tsx`, `ToolIcon.tsx`
  - `components/data-explorer/ai/messages/AgentStatusBar.tsx`, `PlanSteps.tsx`, `MarkdownText.tsx`, `InlineSqlBlock.tsx`, `TablePreview.tsx`
  - `components/data-explorer/ai/input/ChatInput.tsx`
  - `hooks/agentTypes.ts`, `useAgentStream.ts`, `useAIStream.ts`, `useAIAgent.ts`, `useAIChats.ts`, `useAgentArtifacts.ts`, `useAgentPlan.ts`
  - `components/data-explorer/ai/ResonaAILayout.tsx`, `AIChatMain.tsx`, `ArtifactPanel.tsx`
- Backend SSE contract: `backend-ai/src/streaming/event_types.py`, `backend-ai/src/tools/scheduler.py`,
  `backend-ai/src/agents/data_explorer/conversation_loop.py`, `backend-ai/src/agents/data_explorer/run_store.py`
- Node proxy + persistence: `backend/routes/ai/...` (agent stream, durable runs, saveMessage),
  `backend/routes/ai/handlers/durable-runs.js`
- Reference design to compare against: the Claude Code CLI execution UI (live tool
  input/output, per-step spinner + duration, collapsed calls, streaming markdown,
  stop button, context usage bar).

## Questions the report must answer

### 1. Message lifecycle: shown vs saved, and ordering
- For each actor turn (user message, assistant text, tool calls, tool results,
  thinking, plan, artifacts, status events): where is it *displayed*, where is it
  *stored* (in-memory React state vs React Query cache vs persisted to
  `chat_messages` in the DB), and in what ORDER does each happen?
- Is the display order guaranteed to match the DB order? Where could a message
  appear in the UI but never be saved, or be saved twice, or be saved out of
  order? Trace the exact code paths.
- What happens to a partially-streamed assistant message if the user refreshes
  the page mid-run? Is it replayable (just the final text) or is the live
  tool/thinking progression lost?
- Is the "thinking" transcript persisted, or only the final synthesized text?
- Do tool calls/results get persisted as part of the message (e.g. `artifacts`
  column) or are they display-only?

### 2. Streaming pipeline: event → state → render
- Trace an SSE frame from the socket to the DOM. Which hook parses which event?
  Which event types exist (`agentTypes.ts`) vs which the backend emits?
- Produce the **event → component → state** mapping table (thinking, plan,
  tool_call, tool_retry, tool_result, delta, artifact, status, budget_warning,
  context_meta, done/error, keepalive).
- Which events update a store that other components read (e.g. tool steps in
  `LiveToolSteps` vs chunks in `ChatMessage`)? Is there a single source of truth,
  or duplicated/divergent state?
- How are tool results currently shown — inline in the message body, in a side
  panel, or as transient cards? What happens to them after the run ends?
- How is real-time data (row previews, artifacts) rendered? Is anything polled
  vs pushed?

### 3. Durable runs / reconnect
- For `POST /ai/runs` + `GET /ai/runs/:id/stream` (durable runs with replay):
  does the UI actually reconnect and replay buffered events for a run in
  progress? Where is the resume/replay logic? What is lost if the browser
  reconnects mid-run (event ordering, already-completed tool steps)?
- What does the UI show for a run that finished while the user was offline?

### 4. What the user currently sees
- The UI currently shows mostly "thinking" + a tools container. Confirm exactly
  what is rendered for: a thinking step, each tool call (name? args? input?),
  each tool result (summary? rows? duration?), streaming text, and the final
  answer. Cite components + state.
- Is there any indication of the agent's *current* action (spinner + label like
  "Running export …"), elapsed duration per step, or progress? If not, say so.

### 5. Persistence correctness (Node side)
- When and how is `saveMessage` called relative to streaming? Which turns are
  written (user only? user+assistant? tool steps)?
- Could a turn be written twice (e.g. both proxy and Python)? Could the final
  assistant record be written before streaming actually finished (empty/partial
  content)?
- How are chat list ordering and titles derived from the DB?

### 6. Redesign toward a Claude-Code-style UI
- Recommend concrete component/hook changes to render, in order: user message →
  live thinking → plan → tool calls (collapsed list with name/args/duration,
  expandable to full input/output) → streaming final answer → artifacts — with
  a stop button and a context/token window bar.
- Specify which existing components to reuse vs replace.
- Recommend a single store shape (events array keyed by step id) that survives
  reconnect and replay, and a single persistence contract so the DB timeline
  matches the UI timeline exactly.
- Note any backend event additions that would be needed to support this UI
  (e.g. tool `duration_ms`, `status`, elapsed wall-clock, run-level progress).

## Deliverable format

1. **Findings** — evidence-backed answers to sections 1–5 with `file:line` refs.
2. **Bug list** — concrete UI/ordering/persistence bugs, each with severity and
   the exact file/line.
3. **Event→component→state table**.
4. **Redesign plan** — prioritized, file-level, ready for a separate
   implementation agent to execute.

---

## Confirmed findings from a prior analysis session (2026-09-09) — pin these

Already verified against the repo; the implementation agent should treat these
as facts and design against them.

### Export results are "dead" in the UI — root cause chain
1. The backend `export` tool is deliberately kept a **META tool**:
   `backend-ai/src/agents/data_explorer/artifact_emitter.py` does NOT map
   `export` to any `file` artifact → no `artifact_start`/`artifact` SSE events
   are emitted for an export. Evidence: `src/tools/observation.py`:
   `_result_summary()` returns `None` for export data (it looks for
   `summary`/`result_summary`/`rows`, but export `ToolResult.ok` data is
   `{downloadUrl, filename, format, sizeBytes, rowCount, columns}`).
2. The SSE `tool_result` event carries only a compact summary:
   `backend-ai/src/tools/scheduler.py` `_summary()` → for export this is
   `"export succeeded: 57 rows"`. **No downloadUrl, no filename.**
3. The frontend auto-download + link extraction only looks at
   `evt.summary` for `DOWNLOAD_URL:`:
   `sw-data-explorer/src/hooks/useAIAgent.ts`. Since the summary never contains
   `DOWNLOAD_URL:`, the regex **never matches** → no auto-download, and
   `ToolCallCard`/`LiveToolSteps` (which render `step.result.summary` when
   expanded) show only "export succeeded" — no link, no filename, nothing
   clickable.
4. Meanwhile the FULL detail (including `DOWNLOAD_URL:<url>`) IS injected into
   the LLM conversation context by `backend-ai/src/tools/scheduler.py`
   `_llm_content()` → `src/agents/data_explorer/tool_format.py`
   (`format_tool_result` for `export` builds
   `"Export complete: <filename> ... DOWNLOAD_URL:<url>"`). That string never
   reaches the browser — only the model sees it. So the model *can* include the
   URL in its final markdown answer, but: the agent's final synthesis is
   unreliable and the user gets no card/link unless the model echoes it.

### Recommended fix (backend + frontend contract)
- **Backend**: map `export` to a `file` artifact in `artifact_emitter.py`
  (emit `artifact_start` + `artifact` with `{type:'file', downloadUrl,
  filename, format, sizeBytes, rowCount, title}`). `ArtifactPanel` already
  has `isFile` + `FileView` (`ArtifactPanel.tsx`) — the renderer exists.
- **Backend SSE**: surface `downloadUrl`+`filename` on the `tool_result` event
  payload for exports (either in `summary` via `tool_format` or as explicit
  `data`/`artifact` fields) so `useAIAgent.ts` auto-download fires.
- **Frontend**: extend `useAIAgent.ts` to consume a `file` artifact (type
  `'file'`) and/or `tool_result.downloadUrl`, render a clickable download card
  in `ToolCallCard`/`LiveToolSteps`, and make the auto-download regex match a
  structured field rather than a text summary.
- Keep `run_query` results streaming through artifacts (row batches) as today;
  the export file should appear as a distinct card after the run step.

### Other pinned facts
- The 3-event artifact pattern (`artifact_start` → `artifact` →
  `artifact_rows`) is pure state and already covers parallel tool batches:
  `sw-data-explorer/src/hooks/useAgentArtifacts.ts`.
- `ChatMessage` renders user attachments from `msg.artifacts` (type
  `'attachment'`) with a per-file download link
  (`ChatMessage.tsx`) — a usable reference for the export card styling.