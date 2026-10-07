---
title: Agent Runtime & Streaming
section: 8
area: agent-runtime
sources: 32
status: rough
---

# 08. Agent Runtime & Streaming

The client-side half of Resona AI: the durable-run SSE transport, the reducer
tree that turns SSE frames into React state, the tool-step rendering layer, and
the send orchestration that wraps a user turn.

Two runtimes coexist and are **not** interchangeable:

| Runtime | Transport | Hook | Used when |
| --- | --- | --- | --- |
| **Agent runtime** | `POST /api/ai/runs` → `GET /api/ai/runs/:id/stream` (durable, replayable) | `useAIAgent` (`src/components/ai/hooks/useAIAgent.ts:101`) | `agentMode && connectionId` — i.e. any chat with a live DB connection (`AIChatMain.tsx:82`, `:148`, `:296`) |
| **Legacy stream runtime** | `POST /api/ai/chat` (single-shot SSE, no run id) | `useAIStream` (`src/components/ai/hooks/useAIStream.ts:71`) | the `else` branch of the orchestrator (`useChatSendOrchestrator.ts:311`) |

`useAIAgent()` is instantiated in exactly **one** place: `AIChatMain.tsx:28`
(destructured at `:104-127`). Every other file under `src/` that mentions
`useAIAgent` imports **types only** (`ChatMessage.tsx:15`,
`LiveToolSteps.tsx:4`, `PlanSteps.tsx:2`, `messageMapper.ts:8`, and the
dashboard side-panel files).

## Component / File Map

| File | Role | Notes |
| --- | --- | --- |
| `src/components/ai/hooks/useAIAgent.ts` (789 L) | Composition root + event dispatcher. 25 SSE event cases, state machine, clarification resume, abort, sessionStorage pending-run record. | Only consumer is `AIChatMain.tsx`. |
| `src/components/ai/hooks/useAgentStream.ts` (300 L) | Transport. `POST /api/ai/runs`, `GET .../stream?since=`, SSE line parser, reconnect loop. | Pure async fns, no React. |
| `src/components/ai/hooks/useAIStream.ts` (239 L) | Legacy single-shot SSE runtime. | Handles only `delta`, `sql`, `done`, `error` (`:153-203`). No chunk reassembly, no reconnect, no `DeltaBuffer`. |
| `src/components/ai/hooks/useAgentPlan.ts` (20 L) | `applyPlan` / `applyPlanUpdate` reducers. | No validation of `status` strings. |
| `src/components/ai/hooks/useAgentArtifacts.ts` (91 L) | `applyArtifactStart` / `applyArtifact` / `applyArtifactRows`. | File-artifact versioning lives here (`:39-58`). |
| `src/components/ai/hooks/useDatasetCache.ts` (202 L) | sessionStorage dataset cache. | Write-only in practice — see [Dead / Unused Code](#dead--unused-code). |
| `src/components/ai/hooks/useCharts.ts` (111 L) | React Query wrappers for saved charts. | 3 of 4 exported hooks have zero callers. |
| `src/components/ai/hooks/useAIChats.ts` (188 L) | Chat list / messages / delete / update / artifact history. | Header comment lists `useRunQuery`, `useSaveQuery`, `useAIHealth` — all removed (`:152-154`). |
| `src/components/ai/hooks/useAIUsage.ts` (137 L) | `/api/ai/usage` quota query + pure threshold helpers. | The only place with **numeric** client-side credit thresholds. |
| `src/components/ai/hooks/useProjects.ts` (110 L) | Project CRUD React Query wrappers. | `useUpdateProject` exported but never called; comment at `:107-108` claims it was deleted. |
| `src/components/ai/chat/hooks/useChatSendOrchestrator.ts` (349 L) | `handleSend` + `handleQuickSend`. | See [Send Orchestration](#13-send-orchestration). |
| `src/components/ai/tools/LiveToolSteps.tsx` (154 L) | Collapsible tool-step container, live label, summary label, thinking dedupe. | |
| `src/components/ai/tools/ToolCallCard.tsx` (170 L) | One tool step: icon, label, key param, latency, params, result, download. | |
| `src/components/ai/tools/ToolIcon.tsx` (145 L) | `TOOL_CONFIG` (32 entries), `ToolIcon`, `toolLabel`, `getToolKeyParam`. | |
| `src/components/ai/tools/toolSanitize.ts` (152 L) | Sanitisation boundary. `sanitizeToolInput`, `sanitizeToolSummary`, `humanizeParamKey`. | Leaf module, no imports (`:23`). |
| `src/components/ai/types.ts` (540 L) | The whole event protocol + state shape. | |
| `src/lib/api/sseChunks.ts` (94 L) | Reassembly of >64 KB chunked SSE payloads. | |
| `src/lib/api/deltaBuffer.ts` (66 L) | Coalesces `delta` frames to ≤1 React render / 60 ms. | |
| `src/components/ai/api/index.ts` (375 L) | Chat/message/artifact/upload API + `SqlArtifact`. | |
| `src/components/ai/api/charts.ts` (100 L) | Chart API. | Read for endpoint citations. |
| `src/components/ai/api/projects.ts` (92 L) | Project API. | Read for endpoint citations. |
| `src/lib/api/client.ts` | `apiRequestFetch` preamble: base URL, `credentials: 'include'`, CSRF. | `:80-93`, `:117-122`. |
| `src/components/auth/api/index.ts` | `AIQuotaStatus` shape + `getAIUsage`. | `:48-67`, `:130-132`. |
| `src/lib/modes.ts` | `AgentMode = 'flash' \| 'deep'`, `MODE_META`. | `:27`, `:41-56`. |
| `src/components/ai/AIChatMain.tsx` | Sole consumer: finalize effect, display mapping, cache writes, orchestrator wiring. | Read partially, cited where relevant. |
| `src/components/ai/chat/utils/messageMapper.ts` (182 L) | DB message → `LocalMessage`; re-applies sanitisation. | |
| `src/components/ai/messages/AgentStatusBar.tsx` (99 L) | Phase/iteration/live-thinking bar. | |
| `src/components/ai/messages/PlanSteps.tsx` (79 L) | Plan progress list. | |
| `src/components/ai/chat/ChatMessage.tsx` | Wires `AgentStatusBar` / `PlanSteps` / `LiveToolSteps` per message. | Read partially (`:265-314`). |
| `src/components/ai/chat/ChatInput.tsx` | Warning banner rendering + `ContextWindowBar` host. | Read partially (`:295-354`). |
| `src/components/ai/chat/ContextWindowBar.tsx` (74 L) | Context % bar; the `128_000` default. | |
| `src/components/ai/storage/chatDrafts.ts` (179 L) | Draft persistence, cleared by the orchestrator. | |
| `src/components/ai/chat/hooks/useChatInputState.ts` (203 L) | Composer state, 300 ms debounced draft save. | |

---

## 1. Agent Event Protocol

The protocol is declared as TypeScript interfaces in `src/components/ai/types.ts:473-539`
and dispatched by the single `switch (event)` in
`src/components/ai/hooks/useAIAgent.ts:195-520`. There is **no default case**:
an unrecognised `event:` name falls through to `return false` (`:521`) and is
silently dropped.

`TimelineItem` (`types.ts:391-401`) is a *second*, parallel representation of the
same stream. It is written by 9 of the 25 handlers and read by nothing (see
[Dead / Unused Code](#dead--unused-code)).

### 1.1 Complete event table

`SSE event` name → payload interface (`types.ts`) → fields actually read → state mutated → terminal → consuming UI component.

| # | SSE `event:` | Payload interface (types.ts) | Fields read by the dispatcher | State mutated (useAIAgent.ts) | Terminal | UI consumer |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `chat_id` | `ChatIdEvent` `:533` | `chat_id` | `chatId`, `isReconnecting:false` `:198` | no | `AIChatMain.tsx:389-393` → clears draft, marks `justCreatedChatRef` |
| 2 | `plan` | `PlanEvent` `:534` | `steps[]{id,goal,tool,status}` | `planSteps` (full replace), timeline `:203` | no | `ChatMessage.tsx:283-288` → `PlanSteps.tsx` |
| 3 | `plan_update` | `PlanUpdateEvent` `:535` | `id`, `status` | `planSteps` (single-step patch), timeline `:208` | no | same as `plan` |
| 4 | `status` | `StatusEvent` `:536` | `phase`, `detail`, `iteration` | `phase`, `phaseDetail`, `iterations`, timeline `:213` | no | `ChatMessage.tsx:272-279` → `AgentStatusBar.tsx:56,81` |
| 5 | `thinking_chunk` | `ThinkingChunkEvent` `:474` | `text` | `liveThinking` (append) `:218` | no | `AgentStatusBar.tsx:54,83-87` (last 100 chars) |
| 6 | `thinking` | `ThinkingEvent` `:473` | `text` | appends a `type:'thinking'` `AgentToolStep` with the **longer-text-wins** rule applied later at `LiveToolSteps.tsx:96-99`; clears `liveThinking`; timeline `:221-244` | no | `LiveToolSteps.tsx:141-148` → `ToolCallCard.tsx:88` |
| 7 | `thinking_clear` | `ThinkingClearEvent` `:475` (`Record<string, never>`) | — | `liveThinking: ''` `:246` | no | `AgentStatusBar` |
| 8 | `tool_call` | `ToolCallEvent` `:476` | `id`, `name`, `input`, `startedAt` (fallback `Date.now()`) | appends `AgentToolStep{status:'calling'}` with `sanitizeToolInput(name, input)` `:249-257` | no | `LiveToolSteps` → `ToolCallCard` |
| 9 | `tool_result` | `ToolResultEvent` `:477` | `id`, `success`, `summary`, `latency_ms`, `downloadUrl`, `filename` (`name` only reaches the timeline) | patches matching step: `result` (sanitised summary), `status`→`done`/`error`, `latencyMs` (or `Date.now()-startedAt`), `downloadUrl`, `filename` `:259-284` | no | `ToolCallCard.tsx:143-162` (Result + Download) |
| 10 | `artifact_start` | `ArtifactStartEvent` `:484` | `id`, `type`, `title` (`toolCallId` **unused**) | appends `{loading:true}` placeholder `:287` | no | filtered out at terminal; while streaming see `AIChatMain.tsx:436` |
| 11 | `artifact` | `ArtifactEvent` `:485` (has `[k:string]: unknown` index signature) | spread wholesale into the artifact | `applyArtifact` `:292` | no | Section 09 |
| 12 | `artifact_rows` | `ArtifactRowsEvent` `:486` | `artifactId`, `rows`, `done` | appends rows, `streaming = !done` `:297` | no | Section 09 |
| 13 | `decision` | `DecisionEvent` `:483` | `iteration`, `tools_chosen`, `reasoning` (`context_tokens` unused) | **timeline only** `:300-308` | no | **none** |
| 14 | `warning` | `WarningEvent` `:478` | `message`, `code` (`tool` unused) | `warnings` (`kind:'warning'`) + timeline `:309-318` | no | `ChatInput.tsx:308-342` |
| 15 | `budget_warning` | `BudgetWarningEvent` `:479` | `dimension`, `pct`, `message` | `warnings` (`kind:'budget_warning'`) + timeline `:319-328` | no | `ChatInput.tsx:308-342` |
| 16 | `budget_exhausted` | `BudgetExhaustedEvent` `:480` | `message` (`reason`, `usage` unused) | `warnings` (`kind:'budget_exhausted'`), **no timeline entry** `:329-339` | no — comment at `:334-335` states the loop wraps up and still answers | `ChatInput.tsx:308-342` (red banner, `:311`) |
| 17 | `cancelled` | `CancelledEvent` `:481` | `message` (default `'Run cancelled'`) | `status:'aborted'`, `phase:'idle'`, `warnings{kind:'cancelled'}`, in-flight tools→`error`, running plan steps→`error`, `loading` artifacts dropped, `clearPending()` `:340-357` | **yes** `:356` | finalize path `AIChatMain.tsx:316,336` |
| 18 | `agent_timeout` | `AgentTimeoutEvent` `:482` | `duration_secs`, `message` | `status:'error'`, `error`, `warnings{kind:'timeout'}`, tools→`error`, plan→`error`, `clearPending()` `:358-375` | **yes** `:374` | error surface `AIChatMain.tsx:208` |
| 19 | `delta` | `DeltaEvent` `:487` | `text`, `chat_id` | buffered via `DeltaBuffer`; `chatId` if present `:376-385` | no | `MarkdownText` `ChatMessage.tsx:307` |
| 20 | `done` | `DoneEvent` `:488-531` | `completionReason`, `event_index`, `run_id`, `usage.{outputTokens\|output_tokens, creditsUsed\|credits_used, synthesisModel, cacheCreationTokens, cacheReadTokens, contextComponents}`, `iterations`, `chat_id` | normal: `status:'done'`, `phase:'done'`, token/credit/model, `granularUsage`, forced tool/plan completion, `loading` artifacts dropped, `clearPending()` `:419-453`. clarification: `status:'awaiting_clarification'`, `pausedRef`, `pauseEventIndexRef`, `stampPendingPause`, `setPausedRunId` `:395-417` | **yes** `:416`, `:453` | `AIChatMain.tsx:315-386` finalize effect |
| 21 | `context_compacted` | `ContextCompactedEvent` `:340-346` | `before_tokens`, `after_tokens`, `saved_tokens`, `context_limit` | `tokenCount = after_tokens`; `contextMeta.{tokens_estimated, before_tokens, after_tokens, saved_tokens, context_limit, compacted:true}` `:455-471` | no | `ContextWindowBar.tsx:32,63` |
| 22 | `context_meta` | `ContextMetaEvent` `:537` (= `ContextMeta`) | whole object | `contextMeta` replace `:472-476` | no | `ContextWindowBar.tsx:25-34` |
| 23 | `error` | `ErrorEvent` `:532` | `message` (default `'Unknown AI error'`), `code` unread | `status:'error'`, tools→`error`, plan→`error`, `clearPending()` `:477-493` | **yes** `:492` | error surface |
| 24 | `quota_exceeded` | `QuotaExceededEvent` `:538` | `reason`, `message`; `credits_used` unread | `status:'error'` with a reason→message map `:494-514` | **yes** `:513` | `AIChatMain.tsx:217-220` keyword match |
| 25 | `quota_update` | `QuotaUpdateEvent` `:539` | `credits_used` only (`credits_remaining`, `daily_remaining`, `monthly_pct` unused) | `creditsUsed` `:515-519` | no | `AIChatMain.tsx:369` message footer |

### 1.2 Event-name coverage facts

- 25 event names handled; 5 terminal (`cancelled`, `agent_timeout`, `done`,
  `error`, `quota_exceeded`); 20 non-terminal. Terminality is signalled by
  `dispatchEvent` returning `true` (`:356`, `:374`, `:416`, `:453`, `:492`,
  `:513`) which makes `_readStream` return and stops reading
  (`useAgentStream.ts:287-288`).
- `quota_exceeded` is also **synthesised client-side** from a `429` on run
  creation (`useAgentStream.ts:180-185`) and `error` from any other non-OK
  create response (`:187-190`) and from a network throw (`:166`).
- `context_compacted` is the **only** handler that does not clear
  `isReconnecting` (`:455-471`) — every other handler sets it to `false`.
- `budget_exhausted` is the only warnings-producing handler that does **not**
  append a timeline entry (compare `:333` with `:314` and `:324`).
- `useAIStream` handles a disjoint, much smaller set: `delta`, `sql`, `done`,
  `error` (`useAIStream.ts:153-203`). Any `plan`, `tool_call`, `artifact*`,
  `warning`, `budget_*`, `decision`, `context_*`, `chat_id`, `quota_*` frame on
  `POST /api/ai/chat` is ignored. Its local `sql` case
  (`useAIStream.ts:165-177`) has no counterpart in the agent runtime.

---

## 2. Streaming Transport

### 2.1 Mechanism

**`fetch` + manual `ReadableStream` SSE parsing.** No `EventSource`, no
WebSocket. Every stream request goes through `apiRequestFetch`
(`useAgentStream.ts:225`, `:129`), which is the lowest-level client primitive:
it applies base URL (`client.ts:121`), `credentials: 'include'`, the
`X-CSRF-Token` header and the JSON content type, and **no status handling**
(`client.ts:105-122`, preamble at `client.ts:80-93`).

### 2.2 Endpoints

| Method | Path | Where |
| --- | --- | --- |
| `POST` | `/api/ai/runs` | `useAgentStream.ts:129` — creates the durable run, returns `{ run_id, status, chat_id? }` (`types.ts:452-456`) |
| `GET` | `/api/ai/runs/:id/stream[?since=N]` | `useAgentStream.ts:224-231` — SSE; `since` only appended when `> 0` (`:224`) |
| `POST` | `/api/ai/runs/:id/resume` | `useAIAgent.ts:668` — body `{ answer, clientTime, clientTimezone }` |
| `POST` | `/api/ai/runs/:id/cancel` | `useAIAgent.ts:542` — fire-and-forget from `abort()`, errors swallowed (`:544`) |
| `POST` | `/api/ai/chat` | `useAIStream.ts:112` — legacy non-durable runtime |
| `POST` | `/api/ai/files/upload` | `api/index.ts:369` — multipart, used by the orchestrator |

`POST /api/ai/runs` sends **every field twice**, snake_case and camelCase,
"to support both FastAPI AgentRequest and the Node durable runs proxy"
(`useAgentStream.ts:132-162`). `schema_name` defaults to `'public'` (`:137`).
`client_time` / `client_timezone` default to now / `Intl` timezone (`:158-161`).

### 2.3 Frame parsing

`_readStream` (`useAgentStream.ts:253-300`):

```ts
buffer += decoder.decode(value, { stream: true });      // :273
const lines = buffer.split('\n');                       // :274
buffer = lines.pop() ?? '';                             // :275  keep partial line
for (const line of lines) {
    if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();            // :279
    } else if (line.startsWith('data: ') && currentEvent) {
        const name = currentEvent;
        currentEvent = null;                            // :282  ONE data line per event
        try {
            const assembled = chunks.push(name, JSON.parse(line.slice(6)));   // :284
            if (assembled === undefined) continue;       // :286  chunk still incomplete
            const stop = onEvent(name, assembled);       // :287
            if (stop) return true;                       // :288  terminal
        } catch { /* Malformed SSE data — skip */ }      // :289-291
    }
}
```

Consequences that follow directly from this code:

- Only `\n` is a line separator. A `\r\n` stream leaves a trailing `\r` on each
  line; harmless for `event:` (`.trim()` at `:279`) and for `data:` because
  `JSON.parse` tolerates trailing whitespace.
- The prefixes require the space: `'event: '` and `'data: '`. The SSE-legal
  `data:{...}` form is not recognised.
- **Multi-line `data:` fields are not supported** — `currentEvent` is nulled
  after the first data line (`:282`), so a second `data:` line for the same
  logical event is discarded.
- `id:`, `retry:` and `:`-comment lines are ignored (no branch matches).
- `JSON.parse` failure drops the frame silently (`:289-291`).
- The terminal `true` return exits `_readStream` before the `finally` releases
  the reader lock and resets the assembler (`:295-298`).

### 2.4 >64 KB chunk reassembly

`backend-ai src/streaming/emitter.py` splits any payload over 64 KB into
consecutive frames of the same event name carrying
`{ chunk_index, total_chunks, chunk }` (`sseChunks.ts:4-8`). Without
reassembly the wrapper would be dispatched as a real event — the documented
failure is a dashboard `done` frame losing `run_id`, `html` and `panelData`
(`sseChunks.ts:9-14`).

`SseChunkAssembler` (`sseChunks.ts:59-93`):

- `isChunkEnvelope` requires `chunk_index:number`, `total_chunks:number`,
  `chunk:string` (`:32-40`).
- Buffers are keyed **by event name**, one in-flight message per name
  (`:60`, justified at `:16-18`).
- Completion is driven by a `Set` of received indices, not an arrival count,
  because a reconnect replaying from `since=0` re-delivers indices
  (`:45-49`, `:78-80`).
- A different `total` restarts the buffer (`:70-76`).
- `JSON.parse(parts.join(''))` happens **once at the end** — slices are byte
  slices decoded server-side with `errors:'replace'`, so a multi-byte
  character can straddle a boundary and must never be decoded per-chunk
  (`:20-22`).
- Corrupt joined sequence → `undefined`, dropped (`:85-87`).
- `reset()` on stream end (`:91-93`, called at `useAgentStream.ts:296`).

`useAIStream` does **not** use the assembler (`useAIStream.ts:140-151`), so a
chunked payload on `POST /api/ai/chat` is treated as a real event with only
`{chunk_index,total_chunks,chunk}`.

### 2.5 Delta coalescing

`DeltaBuffer` (`deltaBuffer.ts:18-65`), constructed in a ref at
`useAIAgent.ts:130-136` with `DELTA_FLUSH_MS = 60` (`useAIAgent.ts:95`,
default also `60` at `deltaBuffer.ts:24`). Rationale: the backend emits one
`delta` per model chunk, often 10-30/s, and `MarkdownText` re-parses the whole
accumulated answer each render (`deltaBuffer.ts:4-9`, `useAIAgent.ts:120-128`).
`flush()` is called **synchronously** before every terminal event
(`useAIAgent.ts:341`, `:359`, `:387`, `:478`, `:495`) so trailing text is never
left buffered; `dispose()` on unmount (`:141-143`).

### 2.6 Reconnect / resume

`connectDurableRunStream` (`useAgentStream.ts:82-112`):

| Constant | Value | Line |
| --- | --- | --- |
| `RETRY_BASE_MS` | `1_000` | `:35` |
| `RECONNECT_CAP_MS` | `10_000` | `:36` |
| `MAX_RECONNECTS` | `8` | `:37` |

- Backoff: `Math.min(10_000, 1_000 * 2 ** Math.min(attempt - 1, 4))` (`:96`)
  → 1s, 2s, 4s, 8s, then 10s for every later attempt (worst case ≈45 s of
  sleeping across 7 delays).
- `handlers.onReconnect?.()` fires **before** the sleep on every attempt ≥ 1
  (`:95`) and is wired to `resetForReplay` (`useAIAgent.ts:584`, `:713`, `:769`),
  which resets to `INITIAL_STATE` + `status:'running'` + `isReconnecting:true`
  while preserving `chatId` and `runId` (`:184-192`). Replay therefore rebuilds
  the UI from the full buffered history instead of appending duplicates.
- `since` is **preserved across reconnects** — every `_streamRunOnce` call gets
  the same `since` (`:101`), so a clarification resume never re-replays the
  pre-pause leg.
- `_streamRunOnce` outcome classification (`:208-249`): `'aborted'` if the
  signal fired; `'terminal'` for a 4xx status (`:238`, "will not succeed on
  retry") or when a callback returned `true`; `'retryable-error'` for network
  throw, 5xx, missing body, or a stream that ended without a terminal event.
- Ceiling: `if (attempt + 1 >= MAX_RECONNECTS)` → dispatch
  `error { message: 'Connection lost — could not reconnect to the run.', code: 'reconnect_failed' }`
  (`:104-110`) and return.

### 2.7 Page-refresh resume

`sessionStorage` key `'sw_durable_pending_run'` (`useAIAgent.ts:88`), written
in `onRunId` as `{ runId, request, at: Date.now() }` (`:580-583`) and cleared by
`clearPending()` (`:145-149`).

`PENDING_RUN_TTL_MS = 15 * 60_000` — "don't auto-resume a run 15+ min old"
(`useAIAgent.ts:89`). The mount effect (`:737-778`) runs **once**, latched by
`resumedRef` (`:738-739`), and bails when the record is corrupt, has no
`request`, or is older than the TTL (`:751-758`). Otherwise it opens a stream
directly via `connectDurableRunStream` with `since = 0` (`:764-769`).

The `finally` blocks in `send` (`:626`), `resume` (`:730`) and the mount effect
(`:776`) all keep `PENDING_RUN` alive when `pausedRef.current` is true, so a
refresh during a clarification pause reconnects to the same run.

### 2.8 Clarification pause / resume

The `done` frame with `completionReason === 'clarification'` means *paused*,
not complete (`types.ts:521-526`, `useAIAgent.ts:395`). On pause:

1. `pausedRef.current = true`, `pauseEventIndexRef.current = evt.event_index ?? 0` (`:396-397`).
2. `stampPendingPause(eventIndex)` writes `{runId, request, eventIndex, at}` into sessionStorage (`:170-181`).
3. `run_id` resolved from `evt.run_id ?? runIdRef ?? state.runId ?? readPending()?.runId` (`:399-403`).
4. `status:'awaiting_clarification'`, `phase:'idle'` (`:406-408`).
5. `return true` — the stream is closed; `resume()` opens a new one (`:416`).

`resume(answer)` (`:635-733`) deliberately does **not** key off `runIdRef`/
`state.runId` (populated for every run) — the comment at `:637-650` records
that doing so caused one doomed resume (HTTP `409 RUN_ALREADY_COMPLETED`) per
message. It requires one of: `pausedRunId`, `pausedRef` + a run id, or a
session record carrying `eventIndex` (`:652-657`).

`POST .../resume` body is `{ answer, clientTime, clientTimezone }` (`:668-676`);
`since` is the paused frame's `event_index` (`:658`, passed at `:714`). On a
non-OK response the `detail.message` is surfaced if present (`:688-697`).
Successful resume forces `status:'running', phase:'executing'` (`:699-705`).
On a normal `done` the paused mirror is cleared (`:445-451`) — otherwise the
next message would resume a completed run.

### 2.9 Abort

- `abort()` (`:535-558`) aborts the controller, POSTs `.../cancel` without
  awaiting, clears the pending record and `pausedRunId`, sets
  `status:'aborted'`, marks in-flight tools `error` with summary
  `'Stopped by user'`, running plan steps `error`, drops `loading` artifacts.
- `send()` aborts any in-flight controller before starting a new one (`:561`).
- `AbortError` from `startAgentStream` maps to `status:'aborted'` (`:599-608`).
- Backend-initiated stop arrives as the `cancelled` event (`:340-357`) with
  default summary `'Stopped by user'`-equivalent text `'Stopped'`/`evt.message`.
- `useAIStream.abort()` is independent (`:81-87`).

---

## 3. Agent Lifecycle

### 3.1 `AgentPhase`

`'idle' | 'planning' | 'executing' | 'synthesizing' | 'done'` (`types.ts:324`).

| Value | Set at |
| --- | --- |
| `idle` | `INITIAL_STATE` `:47`; terminal handlers `cancelled` `:346`, `agent_timeout` `:364`, `error` `:483`, `quota_exceeded` `:506`; `abort()` `:551`; `send()` AbortError `:603` and throw `:614`; clarification pause `:407` |
| `planning` / `executing` / `synthesizing` | **only** from the `status` event, `:213` |
| `executing` (forced) | `resume()` success, `:703` |
| `done` | `done` event `:422`; post-stream patch `:591` and `:721` |

Note `AgentStatusBar.PHASE_DEFAULTS` (`AgentStatusBar.tsx:7-12`) also contains
`'single_llm_start' → 'Starting analysis…'`, which is **not** in the `AgentPhase`
union; the component's prop is deliberately widened to `AgentPhase | string`
(`AgentStatusBar.tsx:17`) so backend phases outside the union still get a label.

### 3.2 State machine

```
                 send()                        status(phase=planning)
   [idle] ──────────────► running ─────────────────────────────────► phase=planning
     ▲                      │  ▲                                    │
     │ reset()              │  │                          status(executing)
     │                      │  │                                    ▼
     │                 delta/tool_call/...                  phase=executing
     │                (non-terminal, status unchanged)              │
     │                      │                              status(synthesizing)
     │                      ▼                                    ▼
     │                   phase=synthesizing ──────────────► phase=done
     │                                                                   │
     │  ┌────────────────────────── terminal events ──────────────────┐  │
     │  │  done (normal)        → status=done        (returns true)    │  │
     │  │  done (clarification) → status=awaiting_clarification       │  │
     │  │  cancelled            → status=aborted     (returns true)    │  │
     │  │  agent_timeout        → status=error       (returns true)    │  │
     │  │  error                → status=error       (returns true)    │  │
     │  │  quota_exceeded       → status=error       (returns true)    │  │
     │  └─────────────────────────────────────────────────────────────┘  │
     │  ┌────────────────── client-side outcomes ───────────────────────┐  │
     │  │  abort()                     → status=aborted                │  │
     │  │  send() AbortError           → status=aborted                │  │
     │  │  send() throw                → status=error                  │  │
     │  │  stream ended, still running → status=done (post-patch)      │  │
     │  │  resume() network / non-OK   → status=error                  │  │
     │  └──────────────────────────────────────────────────────────────┘  │
     └────────────────────────────────────────────────────────────────────┘
```

Every terminal handler performs the same three cleanups, in this order:
1. in-flight tools (`status==='calling'`) → `error` with a summary;
2. running plan steps → `error` (or `done` on the normal `done` path, `:431`);
3. `artifacts.filter(a => !a.loading)` — drop `artifact_start` placeholders that
   never received a matching `artifact` frame (comment `:432-433`).

### 3.3 `AgentStatus`

`'idle' | 'running' | 'done' | 'awaiting_clarification' | 'error' | 'aborted'`
(`types.ts:323`). Exhaustive set — no other literal exists.

- `idle` — `INITIAL_STATE` `:46`, `reset()` `:532`.
- `running` — `send()` `:569`, mount-resume `:762`, `resume()` `:701`.
- `done` — `done` `:421`, post-stream `:590`, `:719`.
- `awaiting_clarification` — only `useAIAgent.ts:406`.
- `aborted` — `:345`, `:551`, `:602`.
- `error` — `:363`, `:482`, `:505`, `:613`, `:681`, `:694`.

Downstream interpretation (`AIChatMain.tsx`):

| Literal | Interpretation |
| --- | --- |
| `running` | `isStreaming = true` (`:194`) |
| `awaiting_clarification` | `awaitingClarification = true` (`:195`), folds into `hasPausedRun` (`:207`) |
| `done`/`aborted`/`error`/`awaiting_clarification` | all four trigger the finalize effect (`:316`) |
| `finalOk = done \|\| awaiting_clarification` (`:327`) | decides whether a still-`calling` tool is finalised as `done` or `error` (`:333`) and whether running plan steps become `done` or `error` (`:345`) |

The legacy runtime has its own union `StreamStatus = 'idle' | 'streaming' |
'done' | 'error' | 'aborted'` (`useAIStream.ts:22`) with no phases and no
`awaiting_clarification`.

---

## 4. Tool Execution

### 4.1 Data flow

```
tool_call  → toolSteps.push({ id, name, input: sanitizeToolInput(...), status:'calling',
                              startedAt: evt.startedAt ?? Date.now() })      useAIAgent.ts:253
tool_result→ toolSteps.find(id) patched with result/latencyMs/downloadUrl    useAIAgent.ts:263-276
terminal   → calling → done | error                                         useAIAgent.ts:430 / :350,:368,:487,:508,:554,:593,:605,:617
AIChatMain finalise → sanitizedToolSteps + LocalMessage.toolSteps           AIChatMain.tsx:329-341
ChatMessage→ <LiveToolSteps steps={msg.toolSteps} isLive={...}/>            ChatMessage.tsx:291-300
             └ <ToolCallCard step={...} isLive={...}/>                      LiveToolSteps.tsx:141-148
```

Rehydration path (page reload) is separate and re-sanitises:
`AIMessage.execution_trace.toolSteps` (`api/index.ts:86-93`) →
`messageMapper.ts:110-123`, with a fallback that synthesises steps from
`type === 'tool_call'` artifacts (`:125-145`) and prepends a
`'Thinking Process'` step from a `type === 'thinking'` artifact (`:148-162`).

### 4.2 `ToolCallCard` states

Derived at `ToolCallCard.tsx:21-25`:

| Condition | Value | Rendering |
| --- | --- | --- |
| `status==='calling' && isLive` | `isPending` | `Loader2` spinner (`:67`), 500 ms `setInterval` live timer (`:29-33`), elapsed `>= 1s` → `"N.Ns"` else `'…'` (`:103-107`) |
| `status==='calling' && !isLive` | `isInterrupted` | `isError` true → `(stopped)` suffix (`:95-99`), icon greyed (`:76`), **no** `X` |
| `status==='error'` | `isError && !isInterrupted` | red `X` instead of the tool icon (`:68-70`) |
| `status==='done'` | `isDone` | `ToolIcon` at `text-foreground/75` (`:75`) |

Label precedence: `step.label` → `'Thinking'` for thinking steps → `toolLabel(name)`
(`:88`). Key param appended in mono (`:90-94`).

Expandability: `canExpand = Boolean(safeSummary || hasMeaningfulInput || step.downloadUrl)`
(`:45`); chevron only then (`:115-119`).

### 4.3 Latency

- Backend value: `tool_result.latency_ms` (`types.ts:477`) stored as
  `latencyMs` (`useAIAgent.ts:269-270`).
- Fallback: `Date.now() - (s.startedAt ?? Date.now())` (`:271`), where
  `startedAt` is the backend `ToolCallEvent.startedAt` or arrival time (`:253`).
- Rehydrated steps read three casings: `step.latencyMs ?? step.result?.latencyMs
  ?? step.result?.latency_ms` (`ToolCallCard.tsx:50`).
- Format: `<1000 → "Nms"`, else `(ms/1000).toFixed(1) + "s"` (`ToolCallCard.tsx:14-17`,
  duplicated at `LiveToolSteps.tsx:12-15`).
- Container total: sum of `latencyMs` over deduped steps, shown only when
  `!isLive` and `> 0` (`LiveToolSteps.tsx:109-110`, `:131-135`).
- LiveToolSteps' `isLive` is `true` if **any** step is `calling` OR the message
  is streaming and `agentStatus==='running'` (`ChatMessage.tsx:294-297`).

### 4.4 Parameter rendering

`safeInput = sanitizeToolInput(step.name, step.input)` (`ToolCallCard.tsx:37`),
re-applied at render even though it was applied at ingress — "defense in depth"
(`toolSanitize.ts:6-8`). Each surviving entry renders
`humanizeParamKey(k)` + `typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)`
(`:133-136`). The Parameters block is suppressed for thinking steps
(`hasMeaningfulInput` requires `step.type !== 'thinking'`, `:39`) but the block
still renders if `inputEntries.length > 0` (`:125`) — thinking steps get `input:{}`
from `useAIAgent.ts:232`, so nothing renders.

Result block: `sanitizeToolSummary` for non-thinking steps, **raw** for thinking
steps (`:40-44`) — "Thinking steps keep their full text (no SQL redaction)" (`:36`).
A `Download` link appears when `step.downloadUrl` is set (`:151-162`,
`target="_blank" rel="noreferrer"`). There is **no auto-download**: cross-origin
S3 presigned URLs ignore the anchor `download` attribute and would navigate the
tab (`useAIAgent.ts:280-283`).

### 4.5 `LiveToolSteps` container

- Auto-opens while live, auto-collapses to a summary badge on completion
  (`:74-82`); initial `isBoxOpen = isLive || defaultExpanded` (`:71`).
- Adjacent thinking steps are merged into one card, keeping the **longer**
  summary and the first non-null `latencyMs` (`:86-104`).
- `getLiveLabel` (`:17-36`) is name-substring driven: `'query'` → "Running query…",
  `'export'` → "Exporting file…", `'search'` → "Searching the web…",
  `'report'` → "Generating report…", else `Executing {name}…`.
- `getStepsSummary` (`:38-68`) hardcodes the tool names `run_query`,
  `'query'`, `thinking`, `export`, `web_search`, `get_report_html`.
- `ToolCallCard` gets `defaultExpanded` for a lone thinking step or a
  `calling` thinking step while live (`:146`).

---

## 5. Tool Iconography

`TOOL_CONFIG: Record<string, { label, icon, color? }>` (`ToolIcon.tsx:14-60`)
holds **32 entries**. The header comment claims "18 Tools from
`backend-ai/src/tools/data_explorer/de_registry.py`" (`:12`) and the group
comments tally Core(1) + Export(2) + Always-on(5) + Specialized Analytics(10) =
18; the remaining 14 are `thinking` (1), Dashboard AI tools (5) and
"Legacy / historical session fallbacks" (8).

| Group | Tools (icon) |
| --- | --- |
| Core (1) | `run_query` (Database) |
| Export (2) | `export` (Download), `get_report_html` (FileText) |
| Always-on (5) | `ask_clarification` (HelpCircle), `web_search` (Globe), `search_memory` (Brain), `save_fact` (Bookmark), `search_artifacts` (FolderSearch) |
| Analytics (10) | `compute_correlation` (Activity), `forecast_trend` (TrendingUp), `compute_regression` (LineChart), `compare_segments` (Split), `detect_anomalies` (AlertTriangle), `check_quality` (ShieldCheck), `detect_seasonality` (Repeat), `compute_cohort` (Users), `compute_retention` (UserCheck), `compute_funnel` (Filter) |
| Thinking (1) | `thinking` (Sparkles) |
| Dashboard AI (5) | `get_schema_context` (Code2), `save_dashboard` (BarChart2), `edit_panel` (BarChart2), `add_panel` (BarChart2), `remove_panel` (BarChart2) |
| Legacy (8) | `list_tables`, `get_schema`, `sample_rows`, `count_rows`, `get_column_stats`, `search_rows`, `find_join_paths`, `infer_metrics` |

**Fallback icon: `Code2`** — `const Icon = config?.icon ?? Code2`
(`ToolIcon.tsx:64`). **Fallback label:** the raw name with `_` → space and each
word capitalised (`:72`).

The `color` field is declared on every entry but never read — `ToolIcon` only
destructures `.icon` (`:63-65`). The colours are therefore not applied
anywhere; `ToolCallCard` supplies its own colour classes instead (`:75-77`).

`getToolKeyParam(name, input)` (`:80-144`) produces the mono one-liner next to
the label. Per-tool branches run **before** the generic fallback, in this order:
`save_dashboard`→`title` (truncated at **35** chars, `:85`); `edit_panel`/
`remove_panel`→`panel_key|panelKey`; `add_panel`→`title|panel_key`;
`get_schema_context`→`tables` or `table_names`; `run_query`→**always `null`**
("SQL is never previewed in the UI", `:97-100`); `export`→`FORMAT (filename)`;
`get_report_html`→`name`; `web_search`/`search_memory`→`query` quoted, truncated
at **30**; `save_fact`→`fact` quoted, **30**; `ask_clarification`→`question`
quoted, **30**; then `table_name`/`table` (with `metric_column`/`target_column`/
`segment_column` suffix), `target_column`, `metric_column`, `column`.

The generic fallback (`:132-142`) filters out `UNSAFE_PREVIEW_KEYS`
(`connection_id, connectionId, sql, query, user_id, session_id, run_id,
dashboard_id, config, html_template, panels, sections`, `:75-78`), keys matching
`/(^|_)(id|uuid|token|secret)$/i`, and non-string/non-number values; the first
survivor is truncated at **30** chars.

---

## 6. Planning

### 6.1 Receipt

`plan` frames carry the **entire** plan: `PlanEvent.steps[] = { id: number,
goal: string, tool: string | null, status: string }` (`types.ts:534`).
`applyPlan` (`useAgentPlan.ts:7-14`) maps 1:1, coercing a falsy status to
`'pending'`:

```ts
return evt.steps.map(s => ({
    id: s.id, goal: s.goal, tool: s.tool,
    status: (s.status as PlanStep['status']) || 'pending',
}));
```

`PlanStep.status` is typed `'pending' | 'running' | 'done' | 'error'`
(`types.ts:173`) but **no runtime validation** occurs — an unknown status string
is cast through and lands in `STATUS_STYLES[step.status]` as `undefined`
(`PlanSteps.tsx:54`), silently losing the per-status colour.

### 6.2 Updates

`applyPlanUpdate` (`useAgentPlan.ts:16-20`) patches exactly one step by `id`:

```ts
return planSteps.map(s => s.id === evt.id ? { ...s, status: evt.status as PlanStep['status'] } : s);
```

Unknown `id` → silent no-op (a new array with identical contents, so a render
still occurs). Nothing else can change: no `goal` update, no insertion, no
deletion, no reordering.

### 6.3 Partial revisions

There is no merge. A **second** `plan` frame replaces `planSteps` wholesale
(`useAIAgent.ts:203`). The only additive revision mechanism is `plan_update`,
one step at a time. Step *removal* is impossible — a step dropped by the backend
stays in the UI as `pending` until a terminal handler flips only `running`
steps.

### 6.4 Step-status tracking outside the reducers

Every terminal path and the post-stream patch force remaining `running` steps:
to `error` at `useAIAgent.ts:351`, `:369`, `:488`, `:509`, `:555`, `:606`,
`:618`; to `done` at `:431`, `:594`, `:724`. Additionally
`AIChatMain.tsx:344-347` and `:425` force them at the display layer. The
finalize effect also converts any still-`calling` tool step (`:329-341`).

### 6.5 Rendering

`PlanSteps.tsx`: `doneCount/total` (`:19`, `:32-33`), progress bar width
`doneCount/steps.length * 100` (`:39`), `opacity-60` when `allDone && !isLive`
(`:20`, `:25`), per-status dot colours (`:9-14`) with `running` greyed when the
run is not live (`:52-53`), `line-through` on completed goals (`:67`),
connector line green only after a step is `done` (`:59`).

---

## 7. Budgets, Warnings and Guardrails

### 7.1 `WarningKind`

`'warning' | 'budget_warning' | 'budget_exhausted' | 'timeout' | 'cancelled' |
'oscillation' | 'circuit_breaker'` (`types.ts:383`).

| Kind | Producer in this client | Trigger | User-visible effect |
| --- | --- | --- | --- |
| `warning` | SSE `warning` (`:313`) | **server-defined** — no client threshold exists | yellow banner above the composer (`ChatInput.tsx:322-323`), text = `warning.message` verbatim (`:326`) |
| `budget_warning` | SSE `budget_warning` (`:323`) | server-defined; carries `dimension` + `pct` | yellow banner; `dimension`/`pct` are stored but **only `message` is displayed** |
| `budget_exhausted` | SSE `budget_exhausted` (`:333`) | server-defined. Explicitly **non-terminal** — "the loop gracefully wraps up and still emits a final answer" (`:334-335`) | **red** banner (`ChatInput.tsx:311` `kind === 'budget_exhausted'`) |
| `timeout` | synthesised by the `agent_timeout` handler (`:367`) | SSE `agent_timeout`; `error` text defaults to `The agent ran out of time (${round(duration_secs/60)} min).` (`:366`) | red/amber banner **and** `status:'error'` → `error.message` in the transcript |
| `cancelled` | synthesised by the `cancelled` handler (`:349`) | SSE `cancelled` or local `abort()` (abort itself pushes no warning — see note) | banner with `evt.message ?? 'Run cancelled'`; `status:'aborted'` |
| `oscillation` | **no producer** | unreachable as a `kind` | amber styling reachable only via `warning.code === 'oscillation' \|\| 'loop_oscillation'` (`ChatInput.tsx:312`) |
| `circuit_breaker` | **no producer** | unreachable as a `kind` | red styling reachable only via `warning.code === 'circuit_breaker'` (`ChatInput.tsx:311`) |

`abort()` (`:535-558`) does **not** push a `cancelled` warning — only the
backend's `cancelled` event does (`:349`). Local abort shows no banner.

Styling precedence in `ChatInput.tsx:311-323`: critical (red) >
oscillation (amber) > default (yellow).

### 7.2 Warning list mechanics

`pushWarning` (`useAIAgent.ts:74-84`):

- **Dedup** by `(message, kind)` — a repeat updates the existing entry in place
  and refreshes `at` (`:76-81`).
- **Cap: last 6 entries** — `return [...existingList, entry].slice(-6)` (`:83`).
- `id` is `${kind}-${Date.now()}-${4 random base36 chars}` (`:82`), so ids are
  not stable across the dedup window.
- Dismissal is local UI state (`AIChatMain.tsx:80`, `:525-526`), keyed by `id`.
- Warnings are **not persisted** into the finalized `LocalMessage`
  (`AIChatMain.tsx:352-375` keeps content/planSteps/toolSteps/artifacts/tokenCount/
  creditsUsed/model only), so they disappear on reload.

### 7.3 Every numeric threshold in this section

| Threshold | Value | Where | Enforced by |
| --- | --- | --- | --- |
| Warning list cap | `6` | `useAIAgent.ts:83` | client |
| Daily credit warning | `>= 75 %` → level `warning` | `useAIUsage.ts:107-112` | client |
| Daily credit critical | `>= 90 %` → level `critical` | `useAIUsage.ts:101-106` | client |
| Monthly credit warning | `>= 75 %` → level `warning` | `useAIUsage.ts:125-130` | client |
| Monthly credit critical | `>= 90 %` → level `critical` | `useAIUsage.ts:119-124` | client |
| Daily exhaustion | `credit_limit_daily > 0 && daily_remaining <= 0` | `useAIUsage.ts:64` | client |
| Monthly exhaustion | `credit_limit_monthly > 0 && credits_remaining <= 0 && !is_lifetime_cap` | `useAIUsage.ts:70` | client |
| Warning suppressed when exhausted | `getProactiveQuotaError(usage) != null` | `useAIUsage.ts:94` | client |
| Context "near limit" | `pct >= 80` | `ContextWindowBar.tsx:33` | client (display only) |
| Context "at limit" | `pct >= 95` | `ContextWindowBar.tsx:34` | client (display only) |
| Default context limit | `128_000` | `ContextWindowBar.tsx:27` | client (display only) |
| Reconnect attempts | `8` | `useAgentStream.ts:37,104` | client |
| Reconnect backoff | `1_000` base, `10_000` cap, exponent clamped at 4 | `useAgentStream.ts:35-36,96` | client |
| Pending-run TTL | `15 * 60_000` (15 min) | `useAIAgent.ts:89,755` | client |
| Delta flush interval | `60` ms | `useAIAgent.ts:95` | client (render budget) |
| Live tool timer tick | `500` ms | `ToolCallCard.tsx:31` | client |
| Live elapsed format cutoff | `>= 1` s | `ToolCallCard.tsx:105` | client |
| Live thinking tail | last `100` chars | `AgentStatusBar.tsx:85` | client |
| Iteration counter shown | `iteration > 1` → `step {n}` | `AgentStatusBar.tsx:91-94` | client |
| Draft save debounce | `300` ms | `useChatInputState.ts:59` | client |
| Draft TTL / cap | `7 * 24 * 60 * 60 * 1000` / `30` | `chatDrafts.ts:20-21` | client |
| Attachment cap | `MAX_FILE_COUNT = 10` | `fileValidation.ts:7`, enforced `useChatInputState.ts:163-166` | client |
| Dataset cache TTL | `30 * 60 * 1000` (30 min) | `useDatasetCache.ts:29,114` | client |
| Dataset cache entries | `MAX_ENTRIES = 50` | `useDatasetCache.ts:30,89-91` | client |
| Dataset cache rows/entry | `MAX_ROWS_PER_ENTRY = 500` | `useDatasetCache.ts:31,134-136` | client |
| Dataset cache eviction on quota error | `evictOldest(5)` | `useDatasetCache.ts:60` | client |
| Chart list page size | `limit: 50` | `useCharts.ts:51` | client |
| Chat list defaults | `limit 20`, `offset 0`, `useCase 'data_explorer'` | `useAIChats.ts:69-71` | client |
| Artifact history defaults | `limit 30`, `offset 0` | `useAIChats.ts:178-179` | client |
| `useAIUsage` cadence | `staleTime 30_000`, `refetchInterval 60_000`, `retry 1` | `useAIUsage.ts:20-22` | client |
| Agent status/trace keys truncated | `35` / `30` chars | `ToolIcon.tsx:85,111,115,119,141` | client |
| Upload error auto-dismiss | `6000` ms | `useChatInputState.ts:47-50` | client |
| Composer textarea max height | `160` px | `useChatInputState.ts:83,91` | client |
| Copy-to-clipboard reset | `2000` ms | `AIChatMain.tsx:414` | client |

---

## 8. Iteration / Limits — Hard Caps

### 8.1 Enforced in this client

| Cap | Value | Location |
| --- | --- | --- |
| SSE reconnect attempts | `MAX_RECONNECTS = 8` | `useAgentStream.ts:37` |
| Reconnect backoff ceiling | `RECONNECT_CAP_MS = 10_000` | `useAgentStream.ts:36` |
| Reconnect backoff base | `RETRY_BASE_MS = 1_000` | `useAgentStream.ts:35` |
| Durable-run auto-resume TTL | `PENDING_RUN_TTL_MS = 15 * 60_000` | `useAIAgent.ts:89` |
| Retained warnings | `6` | `useAIAgent.ts:83` |
| Delta render coalescing | `DELTA_FLUSH_MS = 60` | `useAIAgent.ts:95` |
| Dataset cache TTL / entries / rows | `30 min` / `50` / `500` | `useDatasetCache.ts:29-31` |
| Attachments per message | `10` | `fileValidation.ts:7` |

**There is no client-side maximum-iteration cap.** `iterations` is written
purely from server frames: `status.iteration` (`:213`) and `done.iterations`
(`:411`, `:426`). A repo-wide search for `max_iterations`, `maxIterations`,
`MAX_ITER` returns nothing under `src/`.

### 8.2 Declared but never read by the client

| Field | Declared | Consumers |
| --- | --- | --- |
| `AIQuotaStatus.max_tokens_per_run` | `auth/api/index.ts:59` | none (`billing/api/payments.ts:27` declares the same field) |
| `AIQuotaStatus.max_agent_duration_secs` | `auth/api/index.ts:60` | none (`billing/api/payments.ts:28` declares it) |
| `AIQuotaStatus.concurrent_slots` | `auth/api/index.ts:61` | `UsageSettings.tsx:363` only |
| `AIQuotaStatus.concurrent_limit` | `auth/api/index.ts:62` | `UsageSettings.tsx:363` only |

The agent timeout and the per-run token cap therefore arrive only as server
frames (`agent_timeout.duration_secs`, `done.usage.*`) and are never
pre-emptively enforced or displayed before the fact.

---

## 9. Artifact Data Flow

Rendering is Section 09's; this is the data path only.

### 9.1 Three-event protocol

```
artifact_start  →  applyArtifactStart: append { id, type, title, loading:true }   useAgentArtifacts.ts:17
artifact        →  applyArtifact:                                         useAgentArtifacts.ts:20-61
                    (a) replace the NEAREST loading placeholder with matching type, searching BACKWARDS
                        (:28-34) — the comment explains that searching only the last index breaks when a
                        parallel tool batch emits several artifact_start frames before any artifact frame
                    (b) else, for type==='file', dedupe by canonical filename
                        (fileName|filename|title, trimmed+lowercased, :40-46) and push the previous
                        artifact into previousVersions (:47-57)
                    (c) else append (:60)
artifact_rows   →  applyArtifactRows:                                    useAgentArtifacts.ts:63-90
                    target = artifacts.findIndex(a => a.id === evt.artifactId)      (:70-72)
                    else last artifact with streaming===true or type 'table'|'query'  (:73-80)
                    else artifacts.length - 1                                          (:81)
                    rows = [...target.rows, ...evt.rows]; streaming = !evt.done        (:85-89)
```

`applyArtifactRows` returns early on an empty artifact list (`:67`).

### 9.2 Into and out of the hook

| Stage | Location |
| --- | --- |
| dispatch | `useAIAgent.ts:285-299` (`artifact_start`, `artifact`, `artifact_rows`) |
| timeline record | `:287`, `:292` (`kind:'artifact'`, `type`, `title`) — read by nothing |
| while streaming | `AIChatMain.tsx:436` (`artifacts: artifacts.length > 0 ? artifacts : undefined`) |
| placeholder drop at terminal | `useAIAgent.ts:352`, `:370`, `:434`, `:489`, `:510`, `:556`, `:595`, `:607`, `:619`, `:725` |
| finalize filter | `AIChatMain.tsx:350` (`artifacts.filter(a => !a.loading)`) |
| write to dataset cache | `AIChatMain.tsx:378-379` (only when `agentStatus === 'done'` **and** `connectionId` and `finalizedArtifacts.length > 0`) |
| workspace refresh | `AIChatMain.tsx:381` (`setWorkspaceRefreshCount(c => c + 1)`) |
| rehydration filter | `messageMapper.ts:49` (`hasArtifactData`, `:22-44`) |
| rehydration file-version consolidation | `messageMapper.ts:64-89` (same canonical-name grouping as `applyArtifact`) |
| clarification `answered` inference | `messageMapper.ts:92-104` (a later user message marks the clarification answered) |

`AgentArtifact` is one flat interface with ~90 optional fields covering
`chart` / `stat_block` / `joins` / `metrics` / `diagram` / `report` / `file` /
`suggestions` / `analysis_plan` / `clarification` / `slide_deck` /
attachment shapes (`types.ts:176-319`). Two fields are documented as
deliberately unrendered: `FunnelStage.conversionFromTop` (declared by the
backend, never rendered — `types.ts:79-82`) and `AgentArtifact.locked`
(`types.ts:187-192`, "the agent sets this for all tool-specific outputs to
prevent the 'show everything' problem" — no client-side writer exists in the
files read here).

**No sanitisation is applied to artifact payloads.** `applyArtifact` stores the
event object verbatim (`useAgentArtifacts.ts:31`, `:60`). See
[Sanitisation Boundary](#sanitisation-boundary-toolsanitize) for what this
means.

---

## 10. Dataset + Chart Caching

### 10.1 `useDatasetCache` — sessionStorage

| Aspect | Value / behaviour | Line |
| --- | --- | --- |
| Key prefix | `'sw_ds_'` | `:28` |
| Key derivation | `'sw_ds_' + Math.abs(djb2(sql.trim() + '::' + connectionId)).toString(36)` | `:35-43` |
| Hash | djb2, seed `5381`, `((hash << 5) + hash + c) \| 0` | `:38-42` |
| Memoisation | `Map<string,string>` keyed on `sql.trim()+'::'+connectionId`, per hook instance | `:97,100-107` |
| Value shape | `{ artifact, cachedAt, connectionId, sql }` | `:13-18,138-143` |
| TTL | `30 * 60 * 1000` default, parameterised by `ttlMs` | `:29,96,114` |
| TTL enforcement | lazy, on read; expired entry is `sessionStorage.removeItem`'d | `:114-117`, `:194-197` |
| Entry cap | `MAX_ENTRIES = 50`; `enforceMaxEntries` evicts `count - 50 + 5` oldest, **called before every write** | `:30,83-92,145` |
| Row cap | `MAX_ROWS_PER_ENTRY = 500`; `rows.slice(0, 500)` | `:31,134-136` |
| Quota-error path | `writeEntry` catches, `evictOldest(5)`, retries once, then gives up silently | `:55-67` |
| Cacheable types | must have `sql`; type in `table \| stats \| anomalies \| quality \| joins \| metrics` **or** have both `rows` and `columns` | `:122-128` |

API surface: `get`, `set`, `has`, `remove`, `clearAll`, `stats`, `getCachedAt`
(`:201`). Actual callers: `set` at `AIChatMain.tsx:379` and `getCachedAt` at
`ChatMessage.tsx:341` (passed down as the `cachedAt` prop to an artifact view).
`get`, `has`, `remove`, `clearAll`, `stats` have **zero callers**.

Consequences:

1. **The cache cannot prevent re-execution.** Its stated purpose is
   "Prevents redundant re-execution of identical queries within a session"
   (`:5`), but nothing ever reads a dataset back out of it — the agent always
   re-runs the query.
2. **Cache key omits schema and database.** Only `sql` + `connectionId`
   participate (`:37`). The same SQL text against the same connection under a
   different `schemaName`/`databaseName` maps to the same key. The artifact
   payload carries no schema either (`:138-143`).
3. **The key comment is wrong.** `:4` says "keyed by SHA-256(sql +
   connectionId)"; the implementation is djb2 (`:35-43`).
4. `getCachedAt` is TTL-aware, so the `cachedAt` badge can be `null` for an
   entry that is still physically present in `sessionStorage`.

### 10.2 `useCharts` — React Query

There is **no result caching for agent-emitted charts**. `useCharts` manages
*user-saved* charts only, and agent chart artifacts are not written to it.

| Hook | Query key | Endpoint | Timing | Callers |
| --- | --- | --- | --- | --- |
| `useSavedCharts(connectionId?)` | `chartQueryKeys.list(connectionId)` `['ai','charts','list',id\|'all']` | `GET /api/ai/charts?connectionId&limit=50` (`charts.ts:81-91`) | `staleTime 30_000`, `gcTime 5 * 60_000` (`:52-53`) | **none** — `AIChatLibrary.tsx:24` defines a local same-named hook |
| `useGenerateChart()` | mutation, no key | `POST /api/ai/charts/generate` (`charts.ts:48-58`) | — | **none** |
| `useSaveChart()` | mutation | `POST /api/ai/charts/save` (`charts.ts:63-76`) | invalidates `chartQueryKeys.all` (`:92`) | `ArtifactView.tsx:12,351` |
| `useDeleteChart()` | mutation | `DELETE /api/ai/charts/:id` (`charts.ts:96-99`) | invalidates `chartQueryKeys.all` (`:108`) | **none** — `AIChatLibrary.tsx:40` defines a local one |

`chartQueryKeys.library(search)` (`useCharts.ts:40`) is used only by
`AIChatLibrary.tsx:26`; the in-code note at `:33-38` records that it is keyed by
the search box text while the filter is applied client-side in `select`, so
every keystroke allocates a fresh cache entry for identical data.

**Cross-turn reuse:** none. Agent artifacts live in the hook's `artifacts`
array for one run; on finalize they are copied into a `LocalMessage`
(`AIChatMain.tsx:352-375`) and the hook state is not carried forward.
Re-opening a chat goes through `useAIChatMessages` → `messageMapper`, i.e. a
server round-trip.

---

## 11. Chat + Project Persistence

### 11.1 `useAIChats`

Query keys (`:37-46`):

| Key | Value |
| --- | --- |
| `all` | `['ai']` |
| `chatsRoot` | `['ai','chats']` — prefix for bulk invalidation |
| `chats(connectionId?)` | `['ai','chats', connectionId ?? 'all']` |
| `messages(chatId, before?)` | `['ai','chats',chatId,'messages', before?]` |
| `artifacts(connectionId?, type?)` | `['ai','artifacts', connectionId ?? 'all', type ?? 'all']` |
| `health()` | `['ai','health']` — **no hook uses it** |

| Hook | Method | Endpoint | Timing | Invalidates on success |
| --- | --- | --- | --- | --- |
| `useAIChatList` (`:57-76`) | GET | `/api/ai/chats?connectionId&limit&offset&useCase` (`api/index.ts:193-207`) | `staleTime 30_000`, `gcTime 5 * 60_000` (`:73-74`) | — |
| `useAIChatMessages` (`:83-103`) | GET | `/api/ai/chats/:id/messages?limit&before&slim` (`api/index.ts:212-222`) | `staleTime 60_000` ("Messages are immutable once saved"), `gcTime 10 * 60_000` (`:100-101`) | — |
| `useUpdateAIChat` (`:110-123`) | PATCH | `/api/ai/chats/:id` `{title?, projectId?}` (`api/index.ts:246-251`) | — | `chatsRoot`, `projectQueryKeys.all`, `messages(chatId)` (`:116-120`) |
| `useDeleteAIChat` (`:130-145`) | DELETE | `/api/ai/chats/:id` (`api/index.ts:227-231`) — soft delete | — | `chatsRoot`, `projectQueryKeys.all`; toast (`:137-139`) |
| `useArtifactHistory` (`:165-184`) | GET | `/api/ai/artifacts?connectionId&type&search&limit&offset` (`api/index.ts:303-318`) | `staleTime 30_000`, `gcTime 5 * 60_000` | — |

`useAIChatList`'s key appends `useCase ?? 'data_explorer'` (`:65`), making it a
4-element key that still matches the 2-element `chatsRoot` prefix.

**Who triggers invalidation after an agent turn:** only `AIChatMain.tsx:382-383`
(`chatsRoot` + `projectQueryKeys.all`) and `:291-292` (stream runtime). The
client never writes chat messages itself — the assistant turn is persisted by
the run writer (evidenced by `AIMessage.usage` being described as
"persisted by the run writer", `api/index.ts:70-78`, and by
`execution_trace.toolSteps`, `:86-93`).

### 11.2 `useProjects`

Query keys (`:20-24`): `all = ['ai','projects']`,
`list = ['ai','projects','list']`,
`chats(projectId) = ['ai','projects',projectId,'chats']`.

| Hook | Method | Endpoint | Timing | Invalidates |
| --- | --- | --- | --- | --- |
| `useProjects` (`:30-38`) | GET | `/api/ai/projects` (`projects.ts:54-56`) | `staleTime 30_000`, `gcTime 5 * 60_000`; `select` → `data.projects` | — |
| `useCreateProject` (`:44-57`) | POST | `/api/ai/projects` (`projects.ts:58-70`) | — | `list()` (`:54`) |
| `useUpdateProject` (`:63-76`) | PUT | `/api/ai/projects/:id` (`projects.ts:72-80`) | — | `list()` (`:73`) — **hook never called** |
| `useDeleteProject` (`:82-91`) | DELETE | `/api/ai/projects/:id` (`projects.ts:82-84`) | — | `list()` (`:88`) |
| `useProjectChats` (`:97-105`) | GET | `/api/ai/projects/:id/chats` (`projects.ts:86-88`) | `staleTime 30_000`; `select` → `data.chats` | — |

`projectQueryKeys.chats(...)` is never invalidated by any mutation in this file;
it is only refetched by `staleTime` / mount. `assignChatToProject`
(`projects.ts:90-92`, `POST /api/ai/projects/:id/chats/:chatId`) has **no caller
anywhere**.

Callers: `useProjects` → `AIChatSidebar.tsx:124`, `AIChatProjects.tsx:188`,
`ProjectDetailView.tsx:36`, `AIChatMain.tsx:89`, `useTeamData.ts:16` (keys only).
`useProjectChats` → `ProjectDetailView.tsx:37`.

---

## 12. Usage / Quota

`useAIUsage(enabled = true)` (`useAIUsage.ts:15-24`) is a React Query on
`queryKeys.aiUsage` with `queryFn: getAIUsage` →
`GET /api/ai/usage` (`auth/api/index.ts:130-132`), `staleTime: 30_000`,
`refetchInterval: 60_000`, `retry: 1`.

### 12.1 `AIQuotaStatus` shape

`auth/api/index.ts:48-67` — 18 fields:

`plan_id`, `is_lifetime_cap`, `credit_limit_monthly`, `credit_limit_daily`,
`credits_used_month`, `credits_used_day`, `credits_used_week`,
`credits_remaining`, `daily_remaining`, `credits_balance`,
`max_tokens_per_run`, `max_agent_duration_secs`, `concurrent_slots`,
`concurrent_limit`, `allowed_models[]`, `allowed_modes?[]`, `monthly_pct`,
`weekly_reset_at`.

### 12.2 Consumption

| Consumer | Use |
| --- | --- |
| `AIChatMain.tsx:88` | fetches the status unconditionally |
| `AIChatMain.tsx:210` → `getProactiveQuotaError` (`useAIUsage.ts:60-75`) | daily/monthly exhaustion message; `quotaError` **blocks sends** (see §13 step 4) |
| `AIChatMain.tsx:211` → `getQuotaWarning` (`useAIUsage.ts:90-134`) | 75 % / 90 % advisory banner (`:521`) |
| `AIChatMain.tsx:217-220` | reactive fallback: scans `activeError` for `QUOTA_KEYWORDS` = `['credit limit','quota','limit reached','upgrade','quota exceeded','token quota','daily limit','monthly limit']` — case-insensitive substring match |
| `UsageSettings.tsx:71` | billing page (reads `concurrent_slots`, `:363`) |

Daily reset is computed client-side as **next UTC midnight**
(`useAIUsage.ts:39-49`), explicitly *not* the weekly Sunday reset — the comment
at `:57-59` states "The weekly reset time is for the weekly credits tracker
only". Humanised as `"X hr Y min"` / `"Y min"` (`:29-36`).

Agent modes are gated by `allowed_modes` from the same payload
(`lib/modes.ts:4-5`), consumed in billing (`PlansSettings.tsx:533,820`) — the
runtime section does not read it.

---

## 13. Send Orchestration

`useChatSendOrchestrator` (`src/components/ai/chat/hooks/useChatSendOrchestrator.ts:40-349`)
returns `{ handleSend, handleQuickSend }`. Two entry points, materially
different. `handleSend` is the composer path and the one wired to the Enter key
(`useChatInputState.ts:129-132` → `onSend` → `handleSendRef` at
`AIChatMain.tsx:223,260`).

### 13.1 `handleSend` — numbered flow

| # | Step | Code |
| --- | --- | --- |
| 1 | Destructure `{ input, attachedFiles, resetInput, setIsUploading, showUploadError }` from `inputState` | `:183` |
| 2 | **Validation A:** return if `(input.trim() === '' && attachedFiles.length === 0)` | `:184` |
| 3 | **Validation B:** return if `isStreaming` (one turn at a time; `isStreaming = agentMode ? agentStatus === 'running' : streamStatus === 'streaming'`, `AIChatMain.tsx:194`) | `:184` |
| 4 | **Clarification branch:** if `hasPausedRun` (= `agentMode && (awaitingClarification || Boolean(pausedRunId))`, `AIChatMain.tsx:207`) → `answer = input.trim()`, `await resumeAgent(answer)` | `:187-189` |
| 4a | ↳ on `true`: `resetInput()`; mark **every** clarification artifact on every assistant message `{ answered: true, answer }`; append `{ id: user-<ts>, role:'user', content: answer }` + `{ id:'streaming', role:'assistant', content:'', isStreaming:true, isAgent:true }`; **return** — no new run, no context re-assembly | `:190-210` |
| 4b | ↳ on `false` (resume failed): fall through and send the text as a **brand-new** message | `:210` then `:214` |
| 5 | **Quota gate:** if `quotaError` → `logger.warn('[useChatSendOrchestrator] Send blocked: quota exhausted')` and **return**. Nothing is dispatched, the composer is *not* cleared, no optimistic message is added | `:214-217` |
| 6 | `messageText = input.trim()` | `:219` |
| 7 | **Context assembly (1) — mentions:** `Array.from(messageText.matchAll(/@(\w+)/g)).map(m => m[1]).filter(t => availableTables.includes(t))` | `:220-222` |
| 8 | `effectiveTables = mentionedTables.length > 0 ? mentionedTables : (aiContextTable ? [aiContextTable] : [])` | `:223` |
| 9 | `effectiveSchema = aiContextSchema \|\| 'public'` | `:224` |
| 10 | Snapshot `filesToUpload = [...attachedFiles]`; `userMessageId = 'user-' + Date.now()` | `:226-227` |
| 11 | **Optimistic insert:** user message with the **real filenames** (not a placeholder string — see the comment at `:236-238`), `attachmentsUploading: filesToUpload.length > 0`, `mentionedTable: effectiveTables[0]`; plus the `{ id:'streaming' }` assistant placeholder carrying `isAgent: agentMode` | `:229-243` |
| 12 | `resetInput()` — clears the persisted draft (`useChatInputState.ts:173`), attachments, scroll, upload error and textarea height | `:245` |
| 13 | **File upload** (skipped when no files): `setIsUploading(true)`; `uploadFilesForAI(files, { chatId })` → `POST /api/ai/files/upload` multipart | `:252`, `:254` |
| 13a | ↳ on `uploadRes.ok && files.length > 0`: collect `fileIds = files.map(f => f.file_id)` and `uploadedFileNames`; build one `type:'attachment'` `AgentArtifact` per file carrying `id`, `file_id`, `fileName`, `filename`, `fileType`, `fileSize`, `size_bytes`, `downloadUrl` (`f.download_url` else the fallback `/api/ai/files/${file_id}/content`), `preview`, `rawContent` (`text_content`), `extracted_components` | `:255-271` |
| 13b | ↳ on a non-ok but resolved response: `showUploadError('File upload failed — files were not attached to this message.')` and continue with `fileIds = []` | `:272-274` |
| 13c | ↳ on a thrown error: `showUploadError('File upload failed. Your message will be sent without file context.')` — **the message is still sent** | `:275-277` |
| 13d | ↳ `finally`: `setIsUploading(false)`, `setWorkspaceRefreshCount(c => c + 1)`, and rewrite the optimistic user message in place with `files: uploadedFileNames`, `artifacts: userAttachmentArtifacts`, `attachmentsUploading: false` | `:278-291` |
| 14 | **Context assembly (2) — history:** `history = localMessages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content }))`. This reads the render-time `localMessages` closure, i.e. the state **before** step 11, so the just-typed message is not duplicated | `:294` |
| 15a | **Dispatch (agent):** `if (agentMode && connectionId)` → `await sendAgent({ connectionId, message: messageText, chatId, schemaName: effectiveSchema, databaseName: dbName, history, mentionedTables: effectiveTables, agentMode: mode, thinking, projectId: activeProjectId ?? undefined, fileIds })` | `:296-309` |
| 15b | **Dispatch (legacy):** else → `await sendStream({ connectionId, chatId, message: messageText, history, mentionedTables: effectiveTables, tableContext: effectiveTables.length > 0 ? { tableName: effectiveTables[0], schemaName: effectiveSchema } : undefined, projectId: activeProjectId ?? undefined, fileIds })` | `:311-320` |

**Error rollback: there is none in this hook.** No `catch`, no removal of the
optimistic messages, no restore of the draft. Failures surface as
`agent.error` / `stream.error` → `activeError` (`AIChatMain.tsx:208`), and the
orphaned streaming placeholder is closed out by the finalize effect
(`AIChatMain.tsx:315-386`), which converts it into a real assistant message with
`toolSteps` marked `error` and summary `'Failed'` (`:336`) or
`'Stopped by user'` (`:336`, aborted). The two cases that leave *nothing* behind
are step 3 (streaming) and step 5 (quota), both of which return before step 11.

### 13.2 Inside `sendAgent` (`useAIAgent.ts:560-628`)

1. Abort any in-flight controller; create a new `AbortController` (`:561-563`).
2. Clear `runIdRef`, `pausedRef`, `pauseEventIndexRef`, `setPausedRunId(null)` (`:564-567`).
3. `setState({ ...INITIAL_STATE, status:'running', chatId: request.chatId ?? null })` (`:569`).
4. `sessionId` precedence: `request.chatId ?? request.sessionId ?? sessionIdRef.current` (`:573`), where `sessionIdRef` is a per-hook `crypto.randomUUID()` (`:117`).
5. `startAgentStream(request, dispatchEvent, signal, { onRunId, onReconnect: resetForReplay })` (`:572-586`).
6. `onRunId` → `runIdRef`, `state.runId`, and `sessionStorage.setItem('sw_durable_pending_run', { runId, request, at })` (`:577-583`).
7. `startAgentStream` = `POST /api/ai/runs` then `connectDurableRunStream` (`useAgentStream.ts:69-72`); a `null` create result means a terminal frame was already dispatched (`:70`).
8. Post-stream patch: if `status` is still `running`, force `done`, complete in-flight tools/steps, drop `loading` artifacts (`:588-596`).
9. `catch`: `AbortError` → `aborted`; anything else → `error` with `err.message` (`:598-621`).
10. `finally`: null the controller ref; `clearPending()` **unless** `pausedRef.current` (`:622-627`).

### 13.3 `handleQuickSend` — divergences

Same shape, but every difference matters:

| Aspect | `handleSend` | `handleQuickSend` |
| --- | --- | --- |
| Validation | steps 2-3 | `:64-65` — blank + no files, and `isStreaming` |
| Draft | via `resetInput()` `:245` | explicit `clearDraft(chatId, connectionId)` `:67`; `resetInput()` is **not** called, so composer text/attachments survive |
| Quota gate | yes `:214-217` | **absent** |
| Clarification resume | yes `:187-212` | yes `:70-93`, but it does not clear the composer |
| `@mentions` parsed | yes `:220-222` | **no** — `effectiveTables = aiContextTable ? [aiContextTable] : []` `:96` |
| Optimistic filenames | real `f.name` `:238` | literal `'uploading…'` `:102` (the exact anti-pattern `handleSend`'s comment at `:236-238` calls out) |
| Upload errors | surfaced via `showUploadError` `:273,277` | **silent** — only `logger.warn` `:132`; no `showUploadError` |
| `setIsUploading` | yes `:252,279` | no |
| Project id | `activeProjectId ?? undefined` `:307` | `projectId` `:159` |
| Non-agent fallback | `sendStream(...)` `:311-320` | **none** — `if (agentMode && connectionId)` only `:148`, so in stream mode a quick send dispatches nothing |

---

## Sanitisation Boundary (`toolSanitize`)

`src/components/ai/tools/toolSanitize.ts` — a leaf module with no imports
(`:23`). Call sites, all of which must be re-checked when the allowlist changes:

| Call site | Context |
| --- | --- |
| `useAIAgent.ts:253` | SSE `tool_call` ingress — `sanitizeToolInput` |
| `useAIAgent.ts:267` | SSE `tool_result` ingress — `sanitizeToolSummary` |
| `ToolCallCard.tsx:37,43` | render time, "defense in depth" (`toolSanitize.ts:6-8`) |
| `messageMapper.ts:114,134` | history rehydration |
| `useDashboard.ts:135,152` | dashboard run (Section 11) |
| `useSidePanelChat.ts:332,349` | dashboard side panel (Section 11) |
| `transcriptMapper.ts:140,161,163,210,217,280,337` | side-panel transcript (Section 11) |
| `GenerateProgress.tsx:32,35` | dashboard progress banner |

### What it removes — inputs (`sanitizeToolInput`, `:88-105`)

1. Non-object / `null` / `undefined` input → `{}` (`:92`).
2. **Always-strip keys**, exact-match, case-sensitive, checked *before* the
   allowlist so no allowlist can re-admit one (`:96-97`): `connection_id`,
   `connectionId`, `user_id`, `userId`, `session_id`, `sessionId`, `run_id`,
   `runId`, `dashboard_id`, `dashboardId`, `sql`, `query`, `config`,
   `html_template`, `htmlTemplate`, `panels`, `sections`, `request_payload`,
   `usage`, `token`, `secret`, `api_key`, `apiKey` (`:28-52`).
3. **Allowlisted tools** — only the listed keys survive, everything else
   dropped (`:97-99`):

   | Tool | Allowed keys |
   | --- | --- |
   | `run_query` | *(none)* `:56` |
   | `get_schema_context` | `tables` `:57` |
   | `add_panel` | `panel_key, title, chart_type, section_id, section_title, explanation` `:58-65` |
   | `edit_panel` | same six `:66-73` |
   | `remove_panel` | `panel_key, explanation` `:74` |
   | `save_dashboard` | `title, description` `:75` |
   | `thinking` | *(none)* `:77` |

4. **All other tools** — denylist only: keys matching
   `ID_KEY_SUFFIX = /(^|_)(id|uuid|guid|token|secret|key)$/i` are dropped
   (`:81,101`); **everything else passes through verbatim**.

Always returns a fresh object; the input is never mutated (`:87,94,104`).

### What it removes — summaries (`sanitizeToolSummary`, `:123-130`)

Applied in order:

1. `SQL_RE` — the tail from the first `SELECT | INSERT INTO | UPDATE | DELETE FROM
   | WITH | CREATE TABLE | ALTER TABLE | DROP TABLE` (case-insensitive) to
   **end of string** (`[\s\S]*`) → `'[query]'` (`:116-117,126`).
2. `UUID_RE` — any UUID, any version → `'…'` (`:108-109,127`).
3. `JSON_ID_RE` — `"<field>": <value>` or `<field>=<value>` for `dashboard_id`,
   `connection_id`, `user_id`, `session_id`, `run_id`, `panel_id`, `id` →
   `'[redacted]'` (`:112-113,128`).

`null`/`undefined` → `''`; non-strings are `String()`-coerced (`:124-125`).

### What it does NOT remove (residual exposure)

- **Artifact payloads are never sanitised.** `applyArtifact` stores the event
  object verbatim (`useAgentArtifacts.ts:31,60`); artifacts carry `sql`, full
  `rows`, `rawContent`, slide-deck `content`, `mermaid`, `config`-shaped blobs
  by design (`types.ts:176-319`). `toolSanitize` is not in that path.
- **Values are not inspected, only top-level keys.** `ToolCallCard` renders
  objects with `JSON.stringify(v)` (`ToolCallCard.tsx:135`). For any tool
  without an allowlist, a parameter whose key is neither always-strip nor
  id-suffixed is displayed in full — including every nested key and string
  inside it. Depth is never traversed and string contents are never scanned for
  SQL or UUIDs.
- `downloadUrl` and `filename` from `tool_result` are stored raw
  (`useAIAgent.ts:272-273`) and rendered as an anchor target/href
  (`ToolCallCard.tsx:151-162`).
- **Warnings bypass the sanitiser entirely.** `AgentWarning.message` and
  `.code` are stored raw (`:313,323,333,349,367`) and rendered verbatim as
  banner text (`ChatInput.tsx:326`).
- `phaseDetail` (`status.detail`) is stored raw (`:213`) and rendered as the
  status-bar text (`AgentStatusBar.tsx:56,81`).
- `DecisionEvent.reasoning` is stored raw into the timeline (`:304`).
- The `timeline` array records the **unsanitised** `tool_result.summary` and
  `warning.message` (`:277`, `:314`) alongside the sanitised copies. No
  consumer exists today, but the raw text is resident in React state.
- Thinking-step summaries are deliberately **not** redacted
  (`ToolCallCard.tsx:40-43`) — a model that echoes SQL in its reasoning will
  have that text rendered verbatim.
- `ALWAYS_STRIP` is an exact, case-sensitive list. `API_KEY`, `Secret`,
  `password`, `authorization`, `access_token`, `refresh_token`, `private_key`,
  `credentials`, `dsn`, `url`, `host` are **not** in it. Keys ending in
  `_token` / `_secret` are caught by `ID_KEY_SUFFIX`, but only for tools without
  an allowlist, and only for the exact suffixes `id|uuid|guid|token|secret|key`.
- `getToolKeyParam` keeps its **own, weaker** `UNSAFE_PREVIEW_KEYS` set
  (`ToolIcon.tsx:75-78`) — missing `userId`, `runId`, `api_key`, `token`,
  `secret`, `request_payload`, `usage`, `htmlTemplate`. It is applied only to
  the generic fallback branch (`:133-138`); the named per-tool branches
  (`:83-130`) run first. At its only call site it receives the already-sanitised
  input (`ToolCallCard.tsx:52`), so raw values are not reachable through it.
- **Dead consequence of that interaction:** the `web_search` / `search_memory`
  branches (`ToolIcon.tsx:109-112`) read `input.query`, but `query` is in
  `ALWAYS_STRIP` (`toolSanitize.ts:40`) → `safeInput` is `{}` →
  `getToolKeyParam` returns `null` at its first line (`:81`). Those two tool
  rows never show a key param.

---

## Dead / Unused Code

### Written but never read

| Item | Written at | Read by |
| --- | --- | --- |
| `AgentState.timeline` + `tl()` helper | `useAIAgent.ts:67-71`, seeded `:64`, appended in 9 handlers (`:203,208,213,236,254,277,287,292,304,314,324`) | **nothing** outside the hook |
| `AgentState.granularUsage` (`GranularUsage`, `types.ts:415-428`) | `useAIAgent.ts:436-443` | **nothing** |
| `AgentState.isReconnecting` | set `true` at `:190`, cleared in 20 handlers | **nothing** |
| `TimelineItem` / `TimelineItemInput` variants `decision`, `artifact`, `budget_warning`, `warning`, `plan_update`, `tool_call`, `tool_result`, `status`, `plan`, `thinking` | `types.ts:391-413` | nothing — the type exists only for `timeline` |
| `WarningEvent.tool` | `types.ts:478` | never read |
| `BudgetExhaustedEvent.reason` / `.usage` | `types.ts:480` | never read |
| `DecisionEvent.context_tokens` | `types.ts:483` | never read |
| `QuotaExceededEvent.credits_used` | `types.ts:538` | never read (dispatcher maps only `reason`/`message`, `:497-501`) |
| `QuotaUpdateEvent.credits_remaining` / `.daily_remaining` / `.monthly_pct` | `types.ts:539` | never read |
| `ContextMeta.iteration` | `types.ts:333` | never read |
| `ArtifactStartEvent.toolCallId` | `types.ts:484` | never read (`applyArtifactStart` ignores it, `useAgentArtifacts.ts:17`) |
| `ToolResultEvent.name` | `types.ts:477` | only written to the unread timeline (`:277`) |
| `ToolCallCardProps.isLive` / `defaultExpanded` | `ToolCallCard.tsx:10-11` | used internally; `LiveToolSteps` is the only caller |

### Exported with zero callers

| Item | Declared | Notes |
| --- | --- | --- |
| `ThinkingClearEvent` | `types.ts:475` | exported type, zero references |
| `useAIStream` `sqlArtifacts` / `sql` artifact path | `useAIStream.ts:165-177` | populated; `AIChatMain.tsx:285` uses only `sqlArtifacts[0]?.sql` |
| `useDatasetCache`: `get`, `has`, `remove`, `clearAll`, `stats` | `useDatasetCache.ts:201` | only `set` (`AIChatMain.tsx:379`) and `getCachedAt` (`ChatMessage.tsx:341`) are called |
| `useCharts`: `useSavedCharts`, `useGenerateChart`, `useDeleteChart` | `useCharts.ts:48,62,102` | `AIChatLibrary.tsx:24` and `:40` define local same-named hooks; `useGenerateChart` has no replacement and no caller |
| `useProjects.useUpdateProject` | `useProjects.ts:63` | comment at `:107-108` claims it was already removed — it is still present |
| `aiQueryKeys.health` | `useAIChats.ts:45` | `useAIHealth` removed (`:152-154`) |
| `runQuery`, `saveQuery`, `checkAIHealth` | `api/index.ts:258,272,325` | retained intentionally (`:152-154`), zero callers |
| `assignChatToProject` | `api/projects.ts:90` | zero callers |
| `AIQuotaStatus.max_tokens_per_run`, `.max_agent_duration_secs` | `auth/api/index.ts:59-60` | zero readers |
| `TOOL_CONFIG[*].color` | `ToolIcon.tsx:14` | `ToolIcon` reads only `.icon` (`:63-65`) |
| `UNSAFE_PREVIEW_KEYS` branches for `web_search` / `search_memory` | `ToolIcon.tsx:109-112` | unreachable from the only call site — `query` is always stripped first |
| `ChartConfig.chartType` `'area'` | `api/charts.ts:12` | `AgentArtifact.chartType` (`:195`) has no `'area'` — the two unions disagree |
| `status` re-connect flag on `context_compacted` | `useAIAgent.ts:455-471` | the only handler that leaves `isReconnecting` set (moot: nothing reads it) |

### Duplicated / contradictory declarations

| Item | Contradiction |
| --- | --- |
| `useDatasetCache.ts:4` | header says "keyed by SHA-256(sql + connectionId)"; implementation is djb2 (`:35-43`) |
| `useAIChats.ts:147-154` and `:156-163` | the same `useArtifactHistory` header block is duplicated verbatim |
| `useProjects.ts:107-108` vs `:63` | comment says `useUpdateProject` "had zero consumers" and was removed; the hook is still exported |
| `useCharts.ts:30-41` vs `useAIStream.ts:165-177` | agent chart artifacts and the legacy `sql` event use disjoint shapes |
| `AgentPhase` (`types.ts:324`) vs `AgentStatusBar.PHASE_DEFAULTS` (`AgentStatusBar.tsx:7-12`) | the UI knows a phase (`single_llm_start`) the type union does not |

---

## Open Questions

UNVERIFIED: The maximum number of agent iterations per run. `iterations` is written only from server frames (`useAIAgent.ts:213`, `:411`, `:426`); no client constant or server-side default is present in any file read, and a search for `max_iterations` / `maxIterations` / `MAX_ITER` under `src/` returns nothing. Previously published docs claiming a specific iteration limit could not be confirmed from this repo.

UNVERIFIED: The agent wall-clock timeout. `agent_timeout.duration_secs` (`types.ts:482`) is the only trace of it; `AIQuotaStatus.max_agent_duration_secs` (`auth/api/index.ts:60`) is delivered to the client but never read. The configured cap is not locatable in this repo.

UNVERIFIED: The per-run token budget. Same situation — `max_tokens_per_run` (`auth/api/index.ts:59`) is fetched and unused; `done.usage.input_tokens` is declared (`types.ts:501`) and never read by the dispatcher.

UNVERIFIED: What actually emits the `oscillation` and `circuit_breaker` warnings. There is no SSE case for either event name in `dispatchEvent` (`useAIAgent.ts:195-520`), so `AgentWarning.kind` can only ever be `warning`, `budget_warning`, `budget_exhausted`, `timeout` or `cancelled`. Either the backend reports them as a `warning` frame with `code` (the only path the UI's amber/red styling can be reached by, `ChatInput.tsx:311-312`), or nothing emits them at all.

UNVERIFIED: The full vocabulary of `WarningEvent.code`. Only `circuit_breaker`, `oscillation` and `loop_oscillation` are read (`ChatInput.tsx:311-312`); any other code falls through to the default yellow banner with no distinguishing treatment.

UNVERIFIED: The wire positions of `budget_exhausted` and `agent_timeout` relative to `done`. The dispatcher marks `budget_exhausted` non-terminal (`:334-335`) but `agent_timeout` terminal (`:374`); whether the backend emits a following `done` in the budget case cannot be determined from this repo.

UNVERIFIED: The exact set of event names the backend emits beyond the 25 handled here. `dispatchEvent` has no `default` branch (`:521`), so any additional frame is silently discarded — including, potentially, progress or per-iteration frames the UI never sees.

UNVERIFIED: `ArtifactEvent`'s full payload. The interface carries an index signature `[k: string]: unknown` (`types.ts:485`), so only `id`, `type`, `sql`, `rows`, `columns`, `title`, `streaming` and `previewType` are named; the rest of the ~90 `AgentArtifact` fields are populated by structural spread (`useAgentArtifacts.ts:31`) with no client-side schema.

UNVERIFIED: Whether `AgentArtifact.locked` (`types.ts:187-192`) is ever set. No writer exists in any file read; only `loading` and `streaming` are written client-side.

UNVERIFIED: The real content of `AIQuotaStatus.max_tokens_per_run` / `max_agent_duration_secs` and whether any server-side or gateway cap exists. The values are typed but never read client-side, so the numbers are not obtainable here.

UNVERIFIED: Whether `useAIUsage`'s `refetchInterval: 60_000` is overridden anywhere for an active run. No such override appears in `AIChatMain.tsx:88` or elsewhere read.

UNVERIFIED: The SSE heartbeat/`retry:` semantics. `_readStream` ignores `retry:` and comment lines entirely (`useAgentStream.ts:277-292`), so server-directed reconnection intervals are not honoured.

UNVERIFIED: Whether the `/api/ai/runs` Node proxy and the Python `AgentRequest` agree on every duplicated field. `useAgentStream.ts:132-162` sends both casings for everything except `schema_name`/`schemaName` (both sent), so the double-write is complete on the client side, but the server-side acceptance is outside this repo.

UNVERIFIED: `AgentStatusBar`'s `iteration` display threshold intent. It shows `step {n}` only for `iteration > 1` (`AgentStatusBar.tsx:91`), implying iteration 0/1 is a first pass — but no client code defines what an iteration is.

UNVERIFIED: `ContextWindowBar`'s `128_000` default is described as a fallback for "the backend's model context table" (`ContextWindowBar.tsx:16-17`), but no client code reads a per-model context length; the real value comes from `contextMeta.context_limit` set by the `context_meta` / `context_compacted` events.