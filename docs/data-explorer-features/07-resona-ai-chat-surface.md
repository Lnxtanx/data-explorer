---
title: Resona AI Chat Surface
section: 7
area: ai-chat
sources: 38
status: rough
---

# 07. Resona AI Chat Surface

Scope: the Resona AI full-chat surface — the composer (`ChatInput`) and its state hook, the `@table` mention picker, file attachments and their upload path, the context-window indicator, the Flash/Deep mode selector, per-chat draft persistence, message rendering and the markdown renderer, plan/status/tool-step visualisation, the turn navigator, scroll behaviour, pinned artifacts, the voice wiring on the chat side, and the first-run empty state / loading skeleton. The voice subsystem itself (`src/components/voice/**`), the agent SSE pipeline (`useAIAgent` / `useAgentStream`), artifact rendering (`artifacts/**`), the sidebar/projects/library shell and the Dashboard AI side panel are other sections; they are cited here only where the chat surface calls into them.

## Component / File Map

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/components/ai/chat/ChatInput.tsx` | Composer: two layouts (empty-state card / bottom pill), transparent-textarea + mention overlay trick, paste interception, format sniffing, mode/voice/toolbar, quota + upload + agent-warning banners, disclaimer copy | 747 |
| `src/components/ai/chat/hooks/useChatInputState.ts` | Composer state: input text, autosize height, mention query derivation, mention insertion/trigger, key handling, file queue + count cap, draft debounce, reset | 203 |
| `src/components/ai/chat/ChatMessage.tsx` | One bubble: user (avatar-less right bubble, collapse, attachments, @pill) vs assistant (status bar, plan, tool steps, markdown, artifacts, credits footer), copy button, image lightbox | 386 |
| `src/components/ai/chat/types.ts` | `LocalMessage` — the render-side message shape | 27 |
| `src/components/ai/messages/MarkdownText.tsx` | Hand-rolled markdown renderer: inline marks, pipe tables, fences, KaTeX math, callouts, hr, lists, memoised | 677 |
| `src/components/ai/messages/AgentStatusBar.tsx` | Live phase pill: pulse dot + phase detail + iteration counter | 99 |
| `src/components/ai/messages/PlanSteps.tsx` | Plan checklist with progress bar and status dots | 79 |
| `src/components/ai/messages/TablePreview.tsx` | Hover card body for a `@table`: schema columns + 3 sample rows | 66 |
| `src/components/ai/tools/LiveToolSteps.tsx` | Collapsible tool-call stack rendered between the plan and the narrative (read as a cross-reference) | 154 |
| `src/components/ai/chat/ContextWindowBar.tsx` | Context % / message count / compacted indicator in the composer footer | 74 |
| `src/components/ai/chat/TurnNavigator.tsx` | Dash rail + hover turn menu + scroll-to-bottom FAB | 270 |
| `src/components/ai/chat/hooks/useChatScroll.ts` | Scroll container, bottom detection, stick-to-bottom, turn IntersectionObserver | 152 |
| `src/components/ai/chat/hooks/useChatHistory.ts` | Chat switch, message rehydration, `system` filtering, older-page pagination, cross-surface guard | 118 |
| `src/components/ai/chat/hooks/useChatVoiceIntegration.ts` | Chat-side glue for the shared voice session: binds chat/user name, commits voice turns, merges interim voice text | 141 |
| `src/components/ai/chat/hooks/usePinnedArtifacts.ts` | localStorage-backed pinned artifact list + expanded-artifact toggle | 114 |
| `src/components/ai/chat/hooks/useChatSendOrchestrator.ts` | Send pipeline: mention extraction, optimistic messages, upload, dispatch to agent or plain stream (read as a cross-reference) | 349 |
| `src/components/ai/chat/utils/fileValidation.ts` | Extension allowlist, 25 MB cap, image detection, sent-attachment image URL resolution | 82 |
| `src/components/ai/chat/utils/messageMapper.ts` | DB message → `LocalMessage`: artifact filter/dedup, tool-step rehydration, XML tag stripping entry point | 182 |
| `src/components/ai/chat/AttachmentChip.tsx` | Composer attachment pill (object-URL thumbnail for images) | 66 |
| `src/components/ai/chat/AttachmentThumb.tsx` | Sent-message attachment thumbnail (network fetch, error fallback) | 45 |
| `src/components/ai/chat/ImageLightbox.tsx` | Full-screen image preview, Escape/backdrop close, download + open-original | 93 |
| `src/components/ai/chat/components/ChatEmptyState.tsx` | First-run hero: logo, greeting, centred composer, prompt chips | 86 |
| `src/components/ai/chat/components/ChatLoadingSkeleton.tsx` | Shimmer placeholders while a chat is being switched to | 34 |
| `src/components/ai/input/MentionPicker.tsx` | Table suggestion list with window-level keyboard capture | 100 |
| `src/components/ai/models/ModeSelector.tsx` | Flash/Deep popover + Thinking switch; re-exports `AgentMode` | 156 |
| `src/components/ai/storage/chatDrafts.ts` | Draft read/write/clear, TTL, LRU sweep, legacy migration | 179 |
| `src/components/ai/AIChatMain.tsx` | The host: wires every prop above, owns mode/thinking/panel state, mode restore, display-message merge (read as a cross-reference) | 725 |
| `src/components/ai/types.ts` | `AgentStatus`, `AgentPhase`, `PlanStep`, `ContextMeta`, `AgentWarning`, `AgentRequest` (cross-reference) | 540 |
| `src/lib/modes.ts` | Canonical `AgentMode` union + `MODE_META` (read as a cross-reference) | 56 |
| `src/components/ai/api/index.ts` | `uploadFilesForAI`, `getChatMessages`, `TableContext`/`ChatRequest` shapes (cross-reference) | 375 |
| `src/components/ai/hooks/useAgentStream.ts` | `POST /api/ai/runs` body construction (cross-reference, partial) | 300 |
| `src/components/ai/hooks/useAIAgent.ts` | SSE reducer; writes `contextMeta` from `context_meta` / `context_compacted` (cross-reference, partial) | 789 |
| `src/components/ai/hooks/useAIStream.ts` | Non-agent path: `POST /api/ai/chat` (cross-reference, grepped only) | 239 |
| `src/lib/utils.ts` | `stripTemporalTag` used on every user bubble and turn label (cross-reference) | 61 |
| `src/components/voice/components/MicButton.tsx` | Web Speech dictation button mounted in the composer (cross-reference) | 89 |
| `src/components/voice/components/VoicePanel.tsx` | Live voice-session toggle mounted in the composer (cross-reference) | 66 |
| `src/components/voice/hooks/useSpeechToText.ts` | SpeechRecognition wrapper behind `MicButton` (cross-reference) | 129 |
| `src/components/auth/hooks/useGreeting.ts` | Empty-state heading/subtitle + `firstName` used for the voice greeting (cross-reference) | 124 |

Cross-referenced files (the last 14 rows) were read because the requested facts — mention payload, upload endpoint, mode persistence, global keyboard shortcuts, greeting copy, the agent request body and the `contextMeta` writer — live outside the assigned list; `useAgentStream.ts` and `useAIAgent.ts` were read only in part (the run-create body and the context/status reducer branches). No file under `C:\schema-weaver\sw-docs` was read or modified, and no file other than this document was written.

---

## 1. Input composer

### 1.1 Two layouts, one component

`ChatInput` returns two entirely separate JSX trees from the same props (`src/components/ai/chat/ChatInput.tsx:349` for the empty-state card, `:539` for the active pill). Only the container differs; the textarea, toolbar, mention picker and banners are duplicated markup rather than shared sub-components.

| | Empty state (`isEmptyState`) | Active |
| --- | --- | --- |
| Container | static, centred card `rounded-2xl` (`:353`) | `absolute bottom-0 left-0 right-0 z-20` with `bg-gradient-to-t from-background via-background/98 to-transparent pt-3 pb-3 px-4` (`:543`), inner `max-w-3xl mx-auto` (`:545`) |
| Placeholder | `'Ask about your data… (use @ to reference tables)'` (`:381`) | `'Reply to Resona AI…'` (`:582`) |
| Textarea min height | `min-h-[34px] sm:min-h-[38px]` (`:382`) | `min-h-[26px]` (`:583`) |
| Mode selector wrapper | `mr-1` (`:453`) | `mr-0.5 scale-95 origin-right` (`:654`) |
| Disclaimer | `Resona AI is AI and can make mistakes. Please double-check cited sources.` + `Docs` link (`:521-531`) | `Resona AI can make mistakes. Check sources.` + `Docs` link (`:723-733`) |
| Footer | — | Context window bar, only when `agentMode` (`:735-741`) |

Both branches render `<textarea id="ai-chat-textarea">` (`:375`, `:576`). The disclaimer links to `https://docs.schemaweaver.vivekmind.com` with `target="_blank" rel="noopener noreferrer"` (`:523-530`, `:725-732`).

### 1.2 Text rendering technique (mention overlay)

The textarea is `text-transparent` with a visible `caret-foreground`, and an absolutely-positioned, `pointer-events-none`, `select-none` overlay mirrors the text (`:33`, `:382`). The overlay splits on `/(@\w+)/g` (`:31`) and wraps any `@name` that exists in `availableTables` in a blue pill with a `HoverCard` (`openDelay={200} closeDelay={100}`, `:45-64`) whose body is `TablePreview`. The overlay is translated by `-scrollTop` so it tracks the textarea scroll (`:39`); `scrollTop` is pushed from the textarea's own `onScroll` handler (`AIChatMain.tsx:486`). Any `@`+`\w+` token is styled; a table name that is not in `availableTables` renders as plain text (`:43`, `:67`).

Interim dictation text is appended inside the overlay as `text-muted-foreground/50 animate-pulse`, with a space inserted only when the committed text does not already end in a space or newline (`:69-74`).

### 1.3 Autosize

Height is set imperatively in two places to `Math.min(scrollHeight, 160)` px: on every keystroke (`useChatInputState.ts:91-92`) and on programmatic input changes (`:80-85`). The CSS ceiling matches: `max-h-[160px]` (`ChatInput.tsx:382`, `:583`). `scrollbar-none [&::-webkit-scrollbar]:hidden` hides the inner scrollbar; `MentionPicker` auto-scrolls the highlighted row with `block: 'nearest'` (`MentionPicker.tsx:57-59`).

There is **no character limit and no counter**: the textarea has no `maxLength` attribute and no length guard anywhere in `useChatInputState`.

### 1.4 Keyboard shortcuts

| Keys | Location | Behaviour |
| --- | --- | --- |
| `Enter` | `useChatInputState.ts:129-132` | Sends. Condition is exactly `e.key === 'Enter' && !e.shiftKey && mentionQuery === null`; calls `e.preventDefault()` then `onSend()` |
| `Shift+Enter` | same | Not intercepted — falls through to the textarea default, i.e. a newline |
| `Backspace` (caret inside a mention, no selection) | `:133-152` | Deletes the whole `@table` token: if `input.slice(0, selectionStart)` ends in `/@(\w+)$/` and the name is in `availableTables`, the token is removed, then the caret, height and `scrollTop` are restored in a `setTimeout(…, 0)` |
| `ArrowDown` / `ArrowUp` | `MentionPicker.tsx:29-36` | Wrapping move of `selectedIndex` (`(prev ± 1) mod filtered.length`), `preventDefault` + `stopPropagation` |
| `Enter` or `Tab` | `MentionPicker.tsx:37-42` | Accepts the highlighted table (also why `Enter` does not send while the picker is open — the composer guard is `mentionQuery === null`) |
| `Escape` | `MentionPicker.tsx:43-47` | Closes the picker (`onClose` → `setMentionQuery(null)`, `AIChatMain.tsx:498`) |
| `Escape` | `TurnNavigator.tsx:85-93` | Closes the turn popover |
| `Escape` | `ImageLightbox.tsx:22-32` | Closes the image preview (and restores `document.body.style.overflow`) |
| `Enter` / `Space` on the Thinking row | `ModeSelector.tsx:130-135` | Toggles `thinking` (the row is a `role="button" tabIndex={0}` div) |
| `mousedown` outside the turn popover | `TurnNavigator.tsx:73-82` | Closes it |
| `Enter` / `Space` on the turn rail | `TurnNavigator.tsx:121-127` | **No handler.** The rail is `role="button" tabIndex={0}` with only an `onClick`, so the jump menu is not keyboard-reachable |

Advertised-but-absent: the stop button tooltip claims `shortcut="Esc"` (`ChatInput.tsx:470`, `:671`). No `Escape` key handler exists anywhere in the chat surface — the only `Escape` listeners are the three listed above (`MentionPicker`, `TurnNavigator`, `ImageLightbox`). Abort is button-only: `onAbort` → `abortAgent()`/`abortStream()` (`AIChatMain.tsx:489`).

**IME:** `handleKeyDown` (`useChatInputState.ts:128-153`) contains no `isComposing` / `compositionstart` / `compositionend` check, and no such attribute exists on the textarea. While an IME composition is active, `Enter` produces `key === 'Enter'` and would satisfy the send condition, so a composition-confirm keystroke can submit the message. This is an observation about the code as written, not an observed bug report.

### 1.5 Send / disabled / loading states

The send button is disabled when `(!input.trim() && attachedFiles.length === 0) || !!quotaError` (`:494`, `:695`), and gets the filled `bg-foreground` treatment only under the same condition. Precedence of the right-hand slot (`:469-504`):

1. `isStreaming` → square "Stop Generating" button → `onAbort`.
2. `isUploading` → disabled button with a spinning `Loader2`, `aria-label="Uploading files"`.
3. Otherwise → the Send button.

Two further guards sit in the send path itself, so the keyboard path cannot bypass them: `handleSend` returns early on `(!input.trim() && attachedFiles.length === 0) || isStreaming` (`useChatSendOrchestrator.ts:184`) and again on `quotaError` (`:214-217`, logging `'Send blocked: quota exhausted'`). The textarea placeholder switches to `'Credit limit reached — upgrade to continue'` when `quotaError` is set (`:381`, `:582`), but the textarea itself is never `disabled`.

`ModeSelector` is rendered with `disabled={isStreaming}` (`:454`, `:655`). `MicButton` and `VoicePanel` are only mounted when `!isStreaming` (`:457-468`, `:658-669`) — dictation cannot be started mid-stream, and a dictation already running is not stopped by the send path.

### 1.6 Paste handling

`handlePaste` (`ChatInput.tsx:217-241`) runs two branches, in order:

1. **Native clipboard files.** If `e.clipboardData.files` is non-empty, `preventDefault()`, forward to `onFilesAdd`, and toast `` `Attached ${n} file${s} from clipboard` `` (`:219-225`).
2. **Large text → synthesised attachment.** If `text.length >= 2000 || lineCount >= 35` **and** `onFilesAdd` exists, `preventDefault()`, sniff the format, wrap the text in a `Blob`, build a `File`, attach it, and toast `` `Pasted text converted to attachment (${filename})` `` (`:228-240`).

Anything smaller is inserted normally. `detectPastedFormat` (`:82-134`) names the file `pasted_*_<timestamp>.<ext>` where `timestamp = new Date().toISOString().replace(/[^0-9]/g,'').slice(0, 12)` (`:84`), and classifies in this order:

| Order | Test | Result filename / MIME |
| --- | --- | --- |
| 1 | starts `{`…`}` or `[`…`]` and `JSON.parse` succeeds (`:87-92`) | `pasted_data_<ts>.json` / `application/json` |
| 2 | `/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|EXPLAIN)\b/i` (`:95`) | `pasted_query_<ts>.sql` / `application/sql` |
| 3 | ≥2 non-empty lines among the first 5; every line has the same comma count ≥2 (`:100-105`) | `pasted_table_<ts>.csv` / `text/csv` |
| 3b | same, tab count ≥2 (`:106-109`) | `pasted_table_<ts>.tsv` / `text/tab-separated-values` |
| 4 | `/^\s*<!DOCTYPE html|^\s*<html|^\s*<\?xml/i` (`:113`) | `pasted_document_<ts>.html` / `text/html` |
| 5 | `/^\s*(def \|class \|import \|from \w+ import \|@\w+)/m` (`:118`) | `pasted_script_<ts>.py` / `text/x-python` |
| 6 | `/^\s*(interface \|type \|const \|let \|function \|export \|import \|return <)/m` (`:123`) | `pasted_code_<ts>.ts` / `text/typescript` |
| 7 | `/^#+\s\|\*\*\|```/m` (`:128`) | `pasted_doc_<ts>.md` / `text/markdown` |
| 8 | fallback (`:133`) | `pasted_text_<ts>.txt` / `text/plain` |

Note the branch order is checked in code as 1,2,3(csv),3(tsv),4,5,6,7 — the numbering above reflects the source order. A pasted SVG or a pasted blob whose detected extension is outside the allowlist will be rejected by `validateFiles` and surfaced as an upload error.

### 1.7 Banners

Rendered above the card in both layouts (`:253-344`):

- **Quota exhausted** (amber, `AlertTriangle`): shows `quotaError` and a `View plans` button when `onOpenPlans` is supplied (`:256-269`).
- **Quota warning** (yellow for `level: 'warning'`, orange for `'critical'`), only when there is no hard error, with an `Upgrade` button and a dismiss `X` (`:271-299`). Dismissal auto-resets when the warning identity changes: `warningKey = \`${level}-${message.slice(0,20)}\`` is compared during render and the dismissed flag is cleared when the key changes (`:208-213`).
- **Upload error** (red, non-dismissible) — `uploadError` from the input hook (`:301-306`).
- **Agent warnings** — one stacked banner per `AgentWarning`, coloured red when `kind`/`code` is `circuit_breaker` or `kind === 'budget_exhausted'`, amber when `kind === 'oscillation'` or `code` is `oscillation` / `loop_oscillation`, else yellow; each dismissible via `onDismissWarning(warning.id)` (`:308-342`).

---

## 2. `@` mention picker

### 2.1 What it searches

`MentionPicker` filters a caller-supplied flat list of table **names** with a case-insensitive substring test: `tables.filter(t => t.toLowerCase().includes(query.toLowerCase()))` (`MentionPicker.tsx:17`). There is no column search, no schema search, and no ranking — insertion order is preserved. The list handed in is `useTableList(connectionId, 'public').tables.map(t => t.name)` (`AIChatMain.tsx:85-86`), i.e. **`public` schema only**. `selectedIndex` resets to `0` on every query change (`:20-22`); if `filtered.length === 0` the component returns `null` (`:61`).

### 2.2 Trigger and insertion

- **Typing:** on each change, `val.slice(0, cursor).match(/@(\w*)$/)` sets `mentionQuery` to the captured word or `null` (`useChatInputState.ts:93-95`). The `@` must be immediately followed by `\w*` up to the caret.
- **Button:** the `AtSign` toolbar button (only rendered when `connectionId` is set, `ChatInput.tsx:409-420`) inserts `@` at the caret, sets `mentionQuery = ''` and restores the caret in `setTimeout(…, 0)` (`useChatInputState.ts:116-126`). Its tooltip advertises `shortcut="@"` (`ChatInput.tsx:410`).
- **Selection:** `handleMentionSelect` finds the last `@` before the caret, replaces through the caret with `'@' + table + ' '`, strips one leading space from the remainder (`.replace(/^ /, '')`), and puts the caret at `atIdx + table.length + 2` (`useChatInputState.ts:98-114`). Trailing-space stripping means `@users list` becomes `@users list` but `@userslist`-style adjacency can be rewritten — the regex is not length-checked, it only needs `@` before the caret.
- The picker is rendered when `mentionQuery !== null` (`ChatInput.tsx:509-517`, `:710-718`) and positioned `absolute bottom-full mb-2 left-0 w-64` (`:65`). Header text is `` `Tables in ${dbName}` `` when a connection name is available, else `Reference a table`, with a `↵ select` hint (`MentionPicker.tsx:68-71`). `onMouseDown` is `preventDefault`ed on both the container and each row so the textarea does not lose focus (`:66`, `:87-90`); selection follows the mouse via `onMouseEnter` (`:86`).

### 2.3 What a mention contributes to the request

A mention is **only a name in the text plus a name in an array**. On send, every `@(\w+)` in the trimmed message is extracted and filtered against `availableTables` (`useChatSendOrchestrator.ts:220-222`); if the result is empty the chat's context table is used instead (`:223`). The request payload (`useChatSendOrchestrator.ts:297-309`) is:

```
{ connectionId, message, chatId, schemaName, databaseName, history,
  mentionedTables: string[], agentMode: 'flash' | 'deep', thinking: boolean,
  projectId, fileIds: string[] }
```

which reaches the wire (duplicated snake_case + camelCase) as `POST /api/ai/runs` (`useAgentStream.ts:129-162`): `mentioned_tables` / `mentionedTables`, `schema_name` / `schemaName` (default `'public'`), `database_name` / `databaseName`, `agent_mode` / `agentMode`, `thinking_enabled` / `thinkingEnabled`, `file_ids` / `fileIds`, `history`, `chat_id`, `project_id`, `client_time`, `client_timezone`.

**No schema, sample rows or row counts are attached to a mention on the client.** The only place sample data is fetched is the hover card, which is display-only and client-side: `TablePreview` calls `useTableSchema(connectionId, tableName, schemaName)` and `useTableRowsSimple(connectionId, tableName, { limit: 3 })` (`TablePreview.tsx:8-9`), shows the first 8 columns plus a `+ N more` chip (`:27-34`) and the first 3 columns × 3 rows (`:44-58`), with the section label `Sample Data Preview`. When `schemaName` is not passed — and neither caller passes it (`ChatInput.tsx:56`, `MarkdownText.tsx:141`, `ChatMessage.tsx:92`) — it defaults to `'public'` (`TablePreview.tsx:5`).

The non-agent path (only reachable when `agentMode` is false, i.e. no `connectionId`, `AIChatMain.tsx:82`) sends `tableContext` with just `{ tableName: effectiveTables[0], schemaName }` (`useChatSendOrchestrator.ts:317`). The `TableContext` type permits `columns`, `sampleRows` and `stats.total_rows` (`api/index.ts:18-24`) but nothing populates them from the chat surface.

### 2.4 Mentions in rendered output

- In the composer: hoverable blue pill + preview (`ChatInput.tsx:41-66`).
- On a sent user message: an `AtSign` + name button above the bubble, hoverable for the same `TablePreview`, falling back to a plain span if the table is no longer in `availableTables` (`ChatMessage.tsx:77-106`). The pill is populated from `msg.mentionedTable`, which the send path sets to `effectiveTables[0]` **only** (`useChatSendOrchestrator.ts:240`) — with multiple mentions only the first is labelled, although all are sent.
- Inside assistant markdown: `@name` becomes a clickable button calling `onTableClick` (`MarkdownText.tsx:114-126`), hover-wrapped in the same preview when the table exists (`:128-150`). The inline regex restricts names to `[a-zA-Z0-9_]+` (`:52`).

---

## 3. Attachments / file upload

### 3.1 Accepted types

There are two independent lists and they disagree:

- The hidden `<input type="file" multiple accept="…">` lists `.pdf,.docx,.xlsx,.xls,.csv,.tsv,.pptx,.txt,.md,.json,.sql,.py,.ts,.js,.tsx,.jsx,.yaml,.yml,.xml,.html,.css,.sh,.env,.log,.toml,.rs,.go,.java,.png,.jpg,.jpeg,.webp,.svg,.gif` (`ChatInput.tsx:397`, `:598`).
- `ALLOWED_FILE_EXTENSIONS` (`utils/fileValidation.ts:9-15`) is the same list **plus `.dockerfile`** (`:13`). Files are matched by lower-cased extension only.

Validation is extension-based. There is **no MIME allowlist and no content sniffing**: `validateFiles` computes `'.' + f.name.split('.').pop()?.toLowerCase()` and rejects anything not in the set (`:70-73`).

### 3.2 Limits (verbatim)

| Limit / rule | Value | Source |
| --- | --- | --- |
| Max file size | `MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB — must match backend` | `fileValidation.ts:6` |
| Max files per message | `MAX_FILE_COUNT = 10` | `fileValidation.ts:7` |
| Rejection message (type) | `` `${f.name}: unsupported file type (${ext})` `` | `fileValidation.ts:72` |
| Rejection message (size) | `` `${f.name}: exceeds 25 MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB)` `` | `fileValidation.ts:76` |
| Count overflow message | `` `Maximum ${MAX_FILE_COUNT} files allowed. Only the first ${MAX_FILE_COUNT} will be attached.` `` | `useChatInputState.ts:164` |
| Over-count handling | Truncates to the first 10 (`combined.slice(0, MAX_FILE_COUNT)`), so silently drops the extras | `useChatInputState.ts:163-166` |
| Upload failure (no files returned) | `'File upload failed — files were not attached to this message.'` | `useChatSendOrchestrator.ts:273` |
| Upload throw | `'File upload failed. Your message will be sent without file context.'` | `useChatSendOrchestrator.ts:277` |
| Upload error auto-dismiss | `6000` ms | `useChatInputState.ts:47-51` |
| Thumbnailable image extensions | `.png .jpg .jpeg .webp .gif` — SVG deliberately excluded ("it is markup, not a bitmap … rendering it inline from a user-supplied blob would execute whatever SVG it contains") | `fileValidation.ts:22-26` |

### 3.3 Upload endpoint and how attachments reach the model

`uploadFilesForAI(files, { chatId })` builds `FormData` with one `files` entry per file plus an optional `chatId` field, and `POST`s to **`/api/ai/files/upload`** (`api/index.ts:357-373`). Response shape `UploadFilesResponse = { ok, files: UploadedFileItem[] }`, where each item is `{ file_id, filename, file_type, size_bytes, token_estimate, preview, metadata, download_url?, storage_path?, extracted_components?, text_content? }` (`api/index.ts:331-348`).

Sequence on send (`useChatSendOrchestrator.ts:226-292`):

1. Optimistic user message appended with real filenames and `attachmentsUploading: true` (`:229-243`); `resetInput()` clears the composer immediately (`:245`).
2. `setIsUploading(true)` → `uploadFilesForAI` (`:252-254`).
3. `fileIds = uploadRes.files.map(f => f.file_id)` (`:256`) — **only the ids travel to the model**, as `fileIds` on the agent request (`:308`) / `file_ids` on the wire (`useAgentStream.ts:152-153`).
4. Each response file is turned into a local `AgentArtifact` of `type: 'attachment'` carrying `id`, `file_id`, `fileName`, `filename`, `fileType`, `fileSize`, `size_bytes`, `downloadUrl` (`download_url` or the client fallback `/api/ai/files/{file_id}/content`), `preview`, `rawContent` (`text_content`) and `extracted_components` (`:257-271`).
5. In `finally`, the optimistic message is patched with the real filenames, the artifacts and `attachmentsUploading: false`; `workspaceRefreshCount` is bumped so the workspace panel refetches (`:278-291`).

### 3.4 Chips, thumbnails, preview

- **Composer chips** — `AttachmentChip` (`AttachmentChip.tsx`): `bg-muted/50` pill, `FileText` icon for non-images, a real `<img>` thumbnail from `URL.createObjectURL(file)` for images, revoked on unmount (`:25-30`). Sizes `md` (composer empty state) and `sm` (active composer, `ChatInput.tsx:554-560`); name is `truncate`d to `max-w-[120px]`. Remove button `aria-label={`Remove ${file.name}`}` (`:58`).
- **Sent-message card** — `ChatMessage.tsx:129-229`. If attachment artifacts exist they render with `AttachmentThumb`, a `w-6 h-6` preview, the filename, and a size line computed as `((size_bytes || fileSize) / 1024).toFixed(0)} KB` (`:158-162`), plus an eye button and a download anchor. If only `msg.files` exist (pre-upload response), they render compact with a spinner and `title='Uploading…'` while `attachmentsUploading` (`:192-227`).
- **Image URL resolution** — `imagePreviewUrl` tries, in order: `key` → `/ai-api/ai/exports/content?key=…`, then `file_id | fileId | id` → `/ai-api/ai/files/{id}/raw`, then `download_url | downloadUrl`, else `null` (`fileValidation.ts:52-64`). `AttachmentThumb` fetches through this and falls back to a `FileText` icon on `onError` (`AttachmentThumb.tsx:28-44`); the header comment explains that the *text* endpoints return extracted content (a vision description for images), which an `<img>` cannot decode (`:1-12`).
- **Lightbox** — clicking an image attachment opens `ImageLightbox` instead of the artifact panel (`ChatMessage.tsx:136-141`, `:376-383`). It is `fixed inset-0 z-[10000] bg-black/80`, closes on backdrop click, the `X` button, or `Escape`, sets `document.body.style.overflow = 'hidden'` while open, and offers `Download original` / `Open original in a new tab` anchors when a `downloadUrl` exists (`ImageLightbox.tsx:22-92`). Clicking inside the image itself does **not** close it (`e.stopPropagation()` at `:42`, `:82`); a failed image load hides the `<img>` instead of showing a broken glyph (`:88`).

---

## 4. Context window bar

`ContextWindowBar` is rendered in the active composer footer only when `agentMode` (`ChatInput.tsx:735-741`).

Derived values (`ContextWindowBar.tsx:25-28`):

```
msgCount = contextMeta?.messages_in_window ?? localMessageCount ?? 0
tokens   = contextMeta?.tokens_estimated ?? tokenCount ?? null
limit    = contextMeta?.context_limit ?? 128_000
pct      = tokens != null && limit > 0 ? Math.round((tokens / limit) * 100) : null
```

It returns `null` when `msgCount === 0 && tokens === null` (`:30`). `localMessageCount` is `localMessages.filter(m => !m.isStreaming).length` (`AIChatMain.tsx:481`) and `tokenCount` is the live agent token count.

### 4.1 Threshold table (verbatim)

| Condition | Colour | Icon | Label |
| --- | --- | --- | --- |
| `contextMeta.compacted` **or** `saved_tokens > 0` | `text-muted-foreground/50` base; icon `text-emerald-500` | `Archive` | `compacted (${Math.round(saved_tokens / 1000)}k saved)` (`:32`, `:53-54`, `:62-63`) |
| `pct >= 95` (`atLimit`) | `text-amber-500 dark:text-amber-400 font-semibold` | `Archive` | `${pct}% context (near limit)` (`:34`, `:40-41`, `:56`, `:64-65`) |
| `pct >= 80` (`nearLimit`) | `text-amber-500/80 dark:text-amber-400/80` | `MessageSquare` | `${msgCount} msgs · ${pct}% context` (`:33`, `:42-43`, `:66-67`) |
| `0 < pct < 80` | `text-muted-foreground/50 hover:text-muted-foreground/80` | `MessageSquare` | same as above (`:44`, `:66-67`) |
| `pct === null` or `0` | same base colour | `MessageSquare` | `${msgCount} message${s} in context` (`:69`) |

Tooltips: `Context window: {tokens} / {limit} tokens (~{pct}%). Auto-compacted when approaching capacity.` when tokens are known, else `{n} message(s) in context.` (`:47-51`).

### 4.2 Compaction is server-driven

Nothing in the client requests compaction. `contextMeta` is written only by the SSE reducer, from a `context_meta` frame (`useAIAgent.ts:472-475`) or a `context_compacted` frame, which sets `tokens_estimated = after_tokens`, `before_tokens`, `after_tokens`, `saved_tokens`, `context_limit` (falling back to the previous value) and `compacted: true`, and resets `tokenCount` to `after_tokens` (`useAIAgent.ts:455-471`). `ContextMeta` also declares `context_pct` (`ai/types.ts:332`) which the bar never reads — the percentage is recomputed locally. The bar's own doc comment states the limit "comes from the backend's model context table via `contextMeta.context_limit`, defaulting to 128k, with LLM compaction retaining a full-fidelity tail" (`ContextWindowBar.tsx:13-18`).

---

## 5. Agent mode selector (flash / deep)

### 5.1 UI

`ModeSelector` is a Radix `Popover` + `ActionTooltip` (`ModeSelector.tsx:49-54`). The trigger is an `h-7` pill showing the mode name `capitalize`d, a `w-1.5 h-1.5 rounded-full bg-primary` dot when `thinking` is on, and a chevron that rotates `180°` when open; `aria-label={`Select model mode: current is ${mode}`}` (`:56-81`). Tooltip label is `'Flash mode'` / `'Deep mode'` (`:52`). `disabled` (passed as `isStreaming`) applies `opacity-40 cursor-not-allowed` (`:64`).

The popover (`side="top" align="end" sideOffset={6}`, `w-44`, `:85-90`) contains exactly three rows: `Flash` and `Deep` buttons with a `Check` on the active one (`:93-119`), a 1px divider (`:123`), and a `Thinking` toggle row implemented as a `w-7 h-4` pill that goes `bg-primary` with a `translate-x-3` knob when on (`:126-152`). Selecting a mode also forces thinking: `deep` → `true`, `flash` → `false` (`handleSelectMode`, `:39-46`), which is redundant with the parent handler (`AIChatMain.tsx:500-503`).

### 5.2 Canonical metadata — `src/lib/modes.ts`

| Field | `flash` | `deep` |
| --- | --- | --- |
| `id` | `'flash'` (`:43`) | `'deep'` (`:50`) |
| `name` | `'Flash'` (`:44`) | `'Deep'` (`:51`) |
| `primaryModel` | `'DeepSeek V4 Flash'` (`:45`) | `'DeepSeek V4 Pro'` (`:52`) |
| `rateTier` | `'2x'` (`:46`) | `'7x'` (`:53`) |
| `creditRate` | `'~29 credits'` (`:47`) | `'~88 credits'` (`:54`) |

`MODE_META` has **no importer** in this app: the selector only ever compares the string to `'flash'`/`'deep'` (`ModeSelector.tsx:36-37`), and availability is decided server-side from `billing.sw_plans.allowed_modes` per the file header (`modes.ts:4-9`). The header also records that `icon`, `accent`, `tagline`, `description` and `thinkingNote` were deleted as dead fields (`modes.ts:21-24`). `AgentMode` is declared once here and re-exported by `ModeSelector` (`ModeSelector.tsx:10-11`).

### 5.3 Persistence and request attachment

There is **no local persistence of the toggle**. State is `useState<AgentMode>('flash')` + `useState(false)` for thinking (`AIChatMain.tsx:74-75`) and is restored per chat from the server record when a chat is opened: `chatHistory.chat.agent_mode` → `setMode`, and `thinking_enabled != null` → `setThinking`, else `deep` implies thinking on (`:399-409`). On send it is passed as `agentMode` + `thinking` (`useChatSendOrchestrator.ts:305-306`) and serialised as `agent_mode`/`agentMode` and `thinking_enabled`/`thinkingEnabled` (`useAgentStream.ts:148-151`). A newly created chat clears the draft for the connection (`AIChatMain.tsx:390-396`).

The `ModeSelector` is only mounted when `agentMode` is true (`ChatInput.tsx:452-456`, `:653-657`).

---

## 6. Chat drafts

`storage/chatDrafts.ts` persists the unsent composer text per conversation in `localStorage`.

| Aspect | Value | Source |
| --- | --- | --- |
| Namespace prefix | `sw_draft:` | `chatDrafts.ts:18` |
| Key, existing chat | `sw_draft:chat:{chatId}` | `chatDrafts.ts:54-57` |
| Key, no chat | `sw_draft:new:{connectionId || 'default'}` | `chatDrafts.ts:58` |
| Payload | `{ text: string }` in a versioned envelope (`DRAFT_VERSION = 1`); fallback `{ text: '' }`, validator `isStoredDraft` | `chatDrafts.ts:19`, `:24-37` |
| TTL | `MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days` | `chatDrafts.ts:20` |
| Capacity | `MAX_STORED_DRAFTS = 30`, oldest evicted first | `chatDrafts.ts:21`, `:169-175` |
| Legacy migration | raw string or `{ text, updatedAt }` mapped onto the envelope, carrying `updatedAt` as `ts` so old drafts don't get a fresh lease | `chatDrafts.ts:38-48`, `:62-73` |
| Registry | `registerKey(key, 'ai-agent')` on every write | `chatDrafts.ts:98` |
| Bulk clear | `clearAllDrafts()` sweeps every `sw_draft:` key (logout / cache purge) | `chatDrafts.ts:125-140` |

Behaviour:

- **Initial load:** `useState(() => getDraft(chatId, connectionId))` (`useChatInputState.ts:23`).
- **Debounce:** `300` ms (`useChatInputState.ts:55-60`), applied on every keystroke (`:90`).
- **Save:** `saveDraft` deletes the key immediately when the text is empty or whitespace-only, otherwise writes and runs `pruneDrafts()` (`chatDrafts.ts:91-109`). All failures are swallowed.
- **Chat switch:** the pending timer is cancelled, the previous `(chatId, connectionId)` draft is flushed, the new one is restored, and attachments / mention query / upload error are cleared (`useChatInputState.ts:63-77`).
- **Cleared on send:** `resetInput` calls `clearDraft` and empties input, attachments, scrollTop and the upload error (`useChatInputState.ts:172-179`), invoked from the send pipeline (`useChatSendOrchestrator.ts:245`) and from `handleQuickSend`'s clarification-resume branch (`:67`).
- **Cleared when a chat is created:** `clearDraft(null, connectionId)` (`AIChatMain.tsx:392`).
- **Only text is persisted.** Attachments, mention state and the composer mode are not.

---

## 7. Message rendering

### 7.1 Roles

`LocalMessage.role` is only `'user' | 'assistant'` (`chat/types.ts:5`). `system` rows exist on the wire (`api/index.ts:65`) and are filtered out during rehydration (`useChatHistory.ts:61`, `:90`) and during pagination (`:90`), so **no system message is ever rendered** in the chat surface.

User vs assistant are distinguished structurally in `ChatMessage`:

| | User (`:116-265`) | Assistant (`:268-354`) |
| --- | --- | --- |
| Alignment | `justify-end`, `items-end`, `max-w-[85%] sm:max-w-[75%] lg:max-w-[68%]` (`:71`, `:74`) | `justify-start`, `items-start w-full` (`:71`, `:74`) |
| Container | `bg-muted/60 rounded-2xl px-4 py-2.5 text-[15px]` (`:120`) | no bubble; `flex flex-col gap-2 w-full` (`:269`) |
| DOM anchors | `id={`turn-${msg.id}`}` and `data-turn-id` (`:69-70`) — the turn-navigation hook target | none |
| Extra chrome | `@table` pill, `by {authorName \|\| authorEmail}` when `isMine === false` (`:109-113`), attachments, collapse toggle | status bar, plan steps, tool steps, artifacts, credits footer |
| Scroll offset | `scroll-mt-14` (`:71`) | — |

Long user messages collapse: `isUserLong = displayContent.length > 240 || lineCount > 4` (`:64-65`); collapsed state is `max-h-28 overflow-hidden select-none cursor-pointer` with a bottom fade (`:121`, `:236-238`) and a click anywhere in the bubble expands it (`:123-126`); the toggle reads `Show more ({n} lines)` — or `({chars} chars)` for a single line — and `Show less` (`:242-263`). Expanded bodies cap at `max-h-[380px] overflow-y-auto` (`:231`). User content is passed through `stripTemporalTag`, which removes leading `[Sent: …]` tags (`ChatMessage.tsx:63`, `lib/utils.ts:57-60`).

Both roles render markdown (`:232`, `:307-312`), and both get a hover-revealed copy button once `!isStreaming && msg.content`, with a `Check` for 2000 ms (`ChatMessage.tsx:357-373`, `AIChatMain.tsx:411-415`). Assistant streaming shows a two-dot `StreamingCursor` with `animationDuration: '0.8s'` and a `200ms` delay on the second dot (`ChatMessage.tsx:45-52`, `:313`).

### 7.2 Credits / usage footer

Rendered when `!msg.isStreaming && msg.creditsUsed != null && msg.creditsUsed > 0`: `{creditsUsed} credit{s} used` in `text-[11px] font-mono text-muted-foreground/75` (`ChatMessage.tsx:348-352`). Values come from the SSE `done` frame or, after reload, from `m.usage.credits_used ?? m.usage.creditsUsed` (`utils/messageMapper.ts:171-176`).

### 7.3 History rehydration (`utils/messageMapper.ts`)

- Artifacts are filtered by `hasArtifactData` (`:22-44`), which is per-type: `table`/`sample`/`search` need `rows && columns`; `stats`/`stat_block` need stats/summary/columnStats; `diagram` needs `mermaid`; `file` and `attachment` need a url/filename/file_id; `chart` always passes; `query` needs `sql` or rows+columns; `tool_call` and `thinking` are always dropped here (`:40-41`).
- `file` artifacts are deduplicated by lower-cased `fileName || filename || title`, keeping the last and attaching earlier ones as `previousVersions` (`:63-89`).
- Tool steps are rebuilt from `execution_trace.toolSteps` when present, else from `tool_call` artifacts; status is coerced to `done | error | calling`, and both `input` and `result.summary` pass through `sanitizeToolInput` / `sanitizeToolSummary` (`:107-145`).
- A `thinking` artifact is prepended as a synthetic step `{ id: 'thinking-rehydrated', name: 'thinking', type: 'thinking', label: 'Thinking Process', status: 'done' }` (`:147-162`).
- A `clarification` artifact is marked `answered: true` with `answer` when a later user message exists in the same page (`:92-104`).
- `stripXmlTags` unwraps `<response>…</response>`, deletes `<thinking>…</thinking>` blocks and bare `thinking|response|answer` tags (`:12-20`); it is applied to the finalised agent text at `AIChatMain.tsx:363` and to non-streaming content in the display merge (`:424`).

### 7.4 Markdown — what `MarkdownText.tsx` enables

The renderer is a hand-written line scanner (`MarkdownTextImpl`, `:488-666`), memoised on a shallow prop compare (`:676-677`, rationale at `:668-675`).

**Block level**

| Construct | Trigger | Rendering |
| --- | --- | --- |
| Block math `$$…$$` | line starts with `$$` (`:499`), single-line form at `:501-507`, otherwise consumes until a line ending in `$$` (`:511-519`) | `MathBlock`: KaTeX `displayMode: true`, copy-TeX button, `overflow-x-auto` |
| Fenced code | line starts with ```` ``` ```` (`:525-538`) | `CodeBlock` with the language as an uppercase label and a Copy button (`:456-485`) |
| Callout / blockquote | line starts with `>` (`:541-558`) | `[!NOTE] [!TIP] [!IMPORTANT] [!WARNING] [!CAUTION] [!INSIGHT]` styled block, else a left-bordered italic `<blockquote>` (`:365-441`) |
| Pipe table | line starts with `\|` (`:561-582`) | `MarkdownTable` with per-column alignment and a copy button on the last header cell (`:210-324`) |
| Heading | `/^#{1,3}\s/` (`:585`) | `<p>` with h1/h2/h3 text sizes |
| Bullet list | `/^[-*]\s/` (`:599`) | `<ul>` with a `w-1.5 h-1.5` round marker |
| Numbered list | `/^\d+\.\s/` (`:619`) | `<ol className="list-none">` with a mono `j+1.` prefix |
| Horizontal rule | `/^([─═\-_=*])\1{2,}$/` (`:639`) | `<hr>` |
| Blank line | (`:646`) | `h-1.5` spacer |
| Paragraph | default (`:652-658`) | `<p className="text-[15px] … [overflow-wrap:anywhere]">` |

**Inline level** — one regex, applied per line (`:52`):

| Mark | Handling |
| --- | --- |
| `**bold**` | `<strong>` (`:59-61`) |
| `*italic*` | `<em>` (`:111-113`) |
| `` `code` `` | `<code>` in `bg-muted/60 font-mono text-[12.5px]` (`:79-88`) |
| `[text](url)` | `<a>` — see below (`:62-78`) |
| `$math$` | KaTeX inline if `isLikelyMath`, else the literal `$…$` is emitted (`:89-110`) |
| `@name` | table button + hover preview (`:114-154`) |

`isLikelyMath` (`:34-41`) rejects pure numbers and currency intervals (`/^\d+([.,]\d+)?(\s+(to|-)\s+\d+([.,]\d+)?)?$/`) and otherwise requires one of `[a-zA-Z\\_=^+\-*/<>]` — so `$50` stays literal text while `$x^2$` renders.

**Pipe-table details:** `parsePipeTable` requires ≥2 lines and a separator matching `/^\|?[\s\-:]+(\|[\s\-:]+)*\|?$/` (`:162-199`). Alignment comes from the separator's colons (`:` both = center, trailing = right, leading = left); otherwise a column whose sample cells are ≥70% numeric per `/^-?\$?[\d,]+(\.\d+)?%?$/` is auto-right-aligned (`:187-195`). Copy writes both `text/html` and `text/plain` `ClipboardItem`s when available, falling back to `writeText`, and flips the icon for `2000` ms (`:227-249`).

**Links.** Only `[text](url)` where `url` starts with `https?://`, `/` or `./` is recognised (`:52`). Recognised links always render as `<a target="_blank" rel="noopener noreferrer">` — there is **no internal-router interception**, so a root-relative `/settings` link opens a new browser tab exactly like an external one (`:68-77`). A `download` attribute (using the link text as the filename) is added when the href matches `/\.(csv|xlsx?|json|pdf|tsv|txt)$/i` or contains `/api/ai/files/` (`:66`, `:73`).

### 7.5 Markdown — what is not supported / silently dropped

- **No syntax highlighting.** `CodeBlock` renders the raw code string in `font-mono whitespace-pre-wrap` (`:481-483`); the module imports only `katex`, Radix hover-card, lucide icons, `cn` and `TablePreview` (`:13-21`). No highlighter dependency exists.
- **No images.** There is no `![alt](src)` rule; an image markdown is left as literal text.
- **No nested lists, no loose multi-paragraph list items, no ordered-list start offset, no blockquote nesting.** Each list branch consumes only consecutive matching lines and drops the leading marker (`:599-636`); an indented `- item` falls through to the paragraph branch and renders literally.
- **Headings are capped at `#`–`###`.** `#### foo` matches neither the heading branch nor any other, so it renders as a paragraph containing the hashes (`:585`).
- **Raw HTML is not rendered.** There is no `dangerouslySetInnerHTML` on message text, so HTML in the model output displays literally. (MarkdownText is also used for *user* bubbles, `ChatMessage.tsx:232`.)
- **A malformed pipe-table block is discarded.** Lines beginning with `|` are consumed; if `parsePipeTable` returns `null` the rows are dropped and nothing is rendered (`:561-582`).
- **`$…$` across a newline is not matched** — the inline math group is `\$([^$\n]+?)\$` (`:52`), so only same-line math works inline.

### 7.6 Sanitisation

- The only `dangerouslySetInnerHTML` uses are the two KaTeX outputs (`:102`, `:356`), both from `katex.renderToString` with `throwOnError: false` and a try/catch fallback to the literal `$…$` / `<pre>{tex}</pre>` (`:89-110`, `:327-362`).
- `escapeHtml` (`:201-208`) escapes `& < > " '` and is used **only** to build the `text/html` clipboard payload (`:230`), never for rendering.
- Rehydrated tool inputs and summaries are passed through `sanitizeToolInput` / `sanitizeToolSummary` (`messageMapper.ts:114`, `:117`, `:134`, `:137`), i.e. sanitisation happens on the rehydration path rather than in the markdown renderer.
- Attachment thumbnails deliberately refuse to render user-supplied SVG (`fileValidation.ts:22-26`).

---

## 8. Plan and status rendering

### 8.1 `AgentStatusBar`

Rendered only while the message is live: `msg.isStreaming && isStreaming && agentMode` (`ChatMessage.tsx:271-280`), with `phase === 'idle' || phase === 'done'` rewritten to `'planning'` (`:273`), `isLive = agentStatus === 'running'` (`:277`).

Status text precedence (`AgentStatusBar.tsx:54-56`): `liveThinking` → the literal `'Thinking…'`; else `phaseDetail`; else `PHASE_DEFAULTS[phase]`; else `'Thinking…'`.

| Phase literal | Default label |
| --- | --- |
| `planning` | `'Thinking…'` (`:8`) |
| `single_llm_start` | `'Starting analysis…'` (`:9`) |
| `executing` | `'Working…'` (`:10`) |
| `synthesizing` | `'Writing response…'` (`:11`) |

`AgentPhase` is `'idle' | 'planning' | 'executing' | 'synthesizing' | 'done'` (`ai/types.ts:324`), so `single_llm_start` can only arrive as a custom string — which is why the prop is typed `AgentPhase | string` (`AgentStatusBar.tsx:17`).

Other details: pulse dot is `bg-indigo-400` while `liveThinking`, `bg-amber-500` while any step has `status === 'calling'`, else `bg-blue-500` (`:67-76`); `liveThinking` is shown as the **last 100 characters** of the stream in italic muted text, beside the status, inside a `max-w-[400px]` row (`:79-88`); `step {iteration}` is shown only when `iteration > 1` (`:91-95`); the bar fades out (`duration-300`) and then gets `hidden` + `pointer-events-none` once `isLive` goes false (`:44-46`, `:60-64`).

### 8.2 `PlanSteps`

Rendered whenever `msg.planSteps` is non-empty (`ChatMessage.tsx:283-288`), `isLive = !!msg.isStreaming && isStreaming && agentStatus === 'running'` (`:286`).

- Status literals: `pending | running | done | error` (`ai/types.ts:173`).
- Styles map (`PlanSteps.tsx:9-14`): `pending` → `border-muted-foreground/20 bg-transparent`; `running` → `border-blue-500 bg-blue-500/20 animate-pulse`; `done` → `border-green-500 bg-green-500 scale-100`; `error` → `border-red-500 bg-red-500 scale-100`.
- Header is the literal `PLAN` in violet, a `{doneCount}/{steps.length}` counter and a progress bar whose width is `(doneCount / steps.length) * 100` with `duration-500` (`:28-42`).
- When every step is done and the run is no longer live the whole block drops to `opacity-60` (`:19-20`, `:25`).
- A `running` step renders a muted dot while `!isLive` (`:52-54`); `done` text is `text-muted-foreground/40 line-through` (`:67`), `error` is `text-red-400/70` (`:70`); connector segments turn `bg-green-500/30` after a done step (`:56-61`).
- Step text is `step.goal`; `step.tool` is never displayed.

### 8.3 Tool steps

`ChatMessage` renders `LiveToolSteps` between the plan and the narrative with `defaultExpanded={false}` and `isLive = any step calling || (msg.isStreaming && isStreaming && agentStatus === 'running')` (`ChatMessage.tsx:291-300`). The component opens itself while live and auto-collapses to a summary badge on completion (`LiveToolSteps.tsx:70-82`), merges adjacent thinking steps (`:84-104`), and renders one of two labels: live — `Thinking…`, `Running query…`, `Exporting file…`, `Searching the web…`, `Generating report…`, `Executing {name}…`, `Running query ({n} completed)…`, `Working…` (`:17-36`); settled — `Queried database` / `Ran {n} queries`, `thought`, `exported file` / `exported {n} files`, `generated report`, `searched the web`, joined with commas and capitalised, or `{n} step(s)` (`:38-68`). Durations are formatted `<1000 ms` as `{ms}ms`, otherwise `{s.toFixed(1)}s` (`:12-15`).

---

## 9. Turn navigator

`TurnNavigator` (`TurnNavigator.tsx`) is a right-edge vertical **dash rail** plus a hover menu, and a separate scroll-to-bottom FAB.

**Turn derivation.** A `useMemo` walk over `messages` counts `role === 'user'` messages 1-based and records `{ id, index, content: stripTemporalTag(m.content), timestamp: m.createdAt }` (`:38-53`). There is no scroll-offset math: the DOM id is `turn-${msg.id}` on each user bubble (`ChatMessage.tsx:69`), and selection is `document.getElementById('turn-'+id).scrollIntoView({ behavior: 'smooth', block: 'start' })` (`useChatScroll.ts:89-95`). The active turn is set by an `IntersectionObserver` over `[data-turn-id]` with `root: container`, `rootMargin: '0px 0px -60% 0px'`, `threshold: 0.1` (`useChatScroll.ts:119-137`), re-created whenever the joined id list changes (`:111`, `:139`).

**Visibility.** The rail renders only when there are **≥ 2** user turns: `showTimelineRail = userTurns.length >= 2` (`:108`).

**Rail.** `absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20` (`:118`). One 3px-tall dash per turn: `w-4 bg-primary` when active, `w-2 bg-muted-foreground/30` otherwise (hover `w-3.5`), each with `aria-label={`Jump to turn ${index}: ${preview}`}` where `preview` is whitespace-collapsed (`:129-152`). Hovering the rail opens the menu, leaving closes it after a `250` ms grace delay (`:56-70`); a `mousedown` outside closes it (`:73-82`).

**Menu.** `w-72 sm:w-80` popover titled `Conversation Turns` with the count in parentheses (`:158-166`), a `max-h-72 overflow-y-auto` list where each row shows `#{index}` and the whitespace-collapsed prompt (falling back to the literal `'Prompt'` when empty) (`:206-238`), and header buttons `Jump to beginning` / `Jump to latest` / `Close` (`:169-201`).

**FAB.** Shown when `!isAtBottom`, at `bottom-24 right-4 sm:right-6 z-20` (`:246-247`); filled `bg-primary` with a pulsing `w-2.5 h-2.5` badge when `hasNewMessages`, otherwise `bg-background/90` (`:252-263`); tooltip label is `New response — Scroll to bottom` or `Scroll to bottom` (`:248`).

**Shortcuts:** only `Escape` to close the menu (`:85-93`). The rail itself has no key handler despite `role="button" tabIndex={0}` (`:121-127`).

---

## 10. Scroll behaviour

From `useChatScroll.ts`:

- **Bottom detection:** `distanceToBottom = scrollHeight - scrollTop - clientHeight; atBottom = distanceToBottom < 120` (`:43-45`). The measured `scrollTop` is kept in `lastScrollTopRef` and at-bottom in `wasAtBottomRef` (`:42`, `:46`).
- **Stick-to-bottom:** on every change to `localMessages` or `isStreaming`, if the user was at the bottom it calls `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`, otherwise it sets `hasNewMessages = true` (`:53-59`). `handleScroll` clears `hasNewMessages` as soon as the user returns to the bottom (`:47-49`).
- **Chat switch:** forces `wasAtBottomRef = true`, clears `hasNewMessages`, and jumps with `behavior: 'auto'` after a `60` ms timeout (`:62-69`).
- **Panel toggles** (Workspace / Dashboard / expanded artifact): the position is captured, then after a `50` ms timeout it either re-pins to the bottom or restores the exact `el.scrollTop` (`:72-86`).
- **Programmatic helpers:** `handleScrollToBottom` smooth-scrolls, sets `isAtBottom`/`wasAtBottomRef` true and clears `hasNewMessages` (`:97-102`); `handleScrollToTop` smooth-scrolls the container to 0 (`:104-108`).
- **Anchor:** `messagesEndRef` is a `h-4 shrink-0 scroll-mb-40` div (`AIChatMain.tsx:651`); user turns carry `scroll-mt-14` (`ChatMessage.tsx:71`). The container is a `flex-1 overflow-y-auto` with a 1.5px styled webkit scrollbar (`AIChatMain.tsx:590-593`).

History pagination is separate from auto-scroll: a `Load earlier messages` / `Loading earlier messages…` button is prepended when `hasMoreOlder` (`AIChatMain.tsx:601-618`), calling `getChatMessages(chatId, { before: oldestCursor, limit: 30 })` and prepending the page (`useChatHistory.ts:83-103`).

---

## 11. Pinned artifacts

`usePinnedArtifacts(chatId, onOpenDashboard)` keeps a per-chat list of pinned `AgentArtifact`s:

- **Storage key:** `sw_pinned_${chatId}` in `localStorage` (`usePinnedArtifacts.ts:29`, `:42`, `:55`), read lazily in the `useState` initialiser and re-read whenever `chatId` changes (`:26-47`); write failures are logged as `'[usePinnedArtifacts] Failed to save pinned artifacts:'` (`:57`).
- **Identity for toggle/dedupe:** an artifact counts as already pinned if `title` matches, **or** `sql` matches, **or** `downloadUrl` matches — only when the incoming value is truthy (`:69-74`). `handlePinArtifact` therefore *unpins* when called again, filters by the same predicate (`:76-83`), and always calls `onOpenDashboard?.()` and clears `expandedArtifact` (`:87-88`). `AIChatMain` passes a callback that opens the Dashboard panel and closes the Workspace panel (`AIChatMain.tsx:138-141`).
- **Read side:** `isPinnedArtifact(a)` uses the same predicate (`:93-103`) and is passed to `ArtifactView` via `ChatMessage` (`ChatMessage.tsx:339`); the count drives the composer's dashboard button (`ChatInput.tsx:421-434`, `AIChatMain.tsx:476`).
- **`handleToggleExpand`** is a separate, in-memory concern for the artifact side panel: it toggles `expandedArtifact` to `null` when the same artifact is re-clicked, matching on object identity, `key`, `downloadUrl`, `id` or `fileName` (`:13-24`). Nothing about pinning is sent to the server — `localStorage` is the only store, so pins are per-browser and lost on cache purge.

---

## 12. Voice in the composer

Two independent voice affordances are mounted on the right of the composer, both only when `!isStreaming` (`ChatInput.tsx:457-468`, `:658-669`).

### 12.1 `MicButton` — dictation into the composer

- **Toggle, not push-to-talk.** One `onClick={toggle}` (`MicButton.tsx:36`); `toggle` calls `stop()` when `status === 'listening'` else `start()` (`useSpeechToText.ts:115-118`). The button also disables itself while `status === 'processing'` (`MicButton.tsx:37`).
- **Engine:** Web Speech API, `window.SpeechRecognition || window.webkitSpeechRecognition`; the button renders `null` when neither exists (`useSpeechToText.ts:32-34`, `MicButton.tsx:17`).
- **Configuration:** `lang = 'en-US'`, `continuous = false`, `interimResults = true`, `maxAlternatives = 1` (`useSpeechToText.ts:22-24`, `:46-49`).
- **What it injects:** the composer keeps a local `interimSpeech` string (`ChatInput.tsx:215`). `handleTranscript(text, isFinal)` clears it and calls `onTranscript(text)` when final, otherwise stores the interim text (`:243-250`). Interim text is **display only** — painted in the mention overlay as `text-muted-foreground/50 animate-pulse` (`:69-74`), never into the textarea value. Final text is appended to the input by the host with a separating space when needed, and the textarea is refocused: `setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text)` (`AIChatMain.tsx:516-519`).
- **Feedback states:** `listening` (red, `animate-ping` ring + a 4-bar `soundbar` indicator with heights `6 + (i % 3) * 3` px and `i * 0.15s` delays, `MicButton.tsx:52-86`), `processing` (spinner), `error` (`MicOff` + a hover tooltip). Error copy: `'Microphone access denied.'`, `'No speech detected.'`, `` `Error: ${event.error}` ``, and the error state self-clears after `3000` ms (`useSpeechToText.ts:77-87`). Tooltip: `'Stop recording'` / `'Dictate message'` (`MicButton.tsx:25-31`).

### 12.2 `VoicePanel` — live voice session toggle

A single `onClick={onToggle}` button whose tooltip cycles `Start Resona Voice` → `Connecting to Resona Voice…` → `End Resona Voice`, with a spinner while connecting and an animated waveform while talking (`VoicePanel.tsx:30-62`). `onToggle` is `voice.handleToggleVoice`: it ends the session when active; otherwise, if there is no current `chatId` but a session chat id exists, it adopts that id (flagging `justCreatedChatRef` and calling `onChatCreated`) before `startVoiceSession()` (`useChatVoiceIntegration.ts:71-81`).

`useChatVoiceIntegration` itself owns no socket — it reads the shared `VoiceSessionProvider` context and only does chat-specific work (`useChatVoiceIntegration.ts:3-12`, `:37`): pushes `chatId` into the session (`:48-50`), pushes `userName` so the gateway greeting is personalised (`:52-56`), commits finalised voice turns into `localMessages` through `useVoiceChatSync(voiceMessages, setLocalMessages, agentMode)` (`:84`), and merges the active interim voice turn into the display list as an `isStreaming` message (`:87-120`). While a session is live and no messages exist, `AIChatMain` swaps the message list for `VoiceSessionOverlay` and renders a second `ChatInput` with `isDockedInOverlay` when "type while talking" is toggled (`AIChatMain.tsx:555-576`, `:655-677`); `ChatInput`'s docked variant drops the absolute/gradient wrapper and the footer (`:540-544`).

---

## 13. Empty state and loading skeleton

### 13.1 First-run screen

`ChatEmptyState` renders when `finalDisplayMessages.length === 0` and no voice session is active (`AIChatMain.tsx:577-587`): a `w-12 h-12 sm:w-14 sm:h-14` logo from `/resona.png` (`ChatEmptyState.tsx:29-33`), the greeting `h1` in `font-serif text-3xl sm:text-4xl` (`:36-38`), the subtitle (`:39-41`), and a centred `ChatInput` with `isEmptyState={true}` (`:44-49`). The greeting heading is picked deterministically from 5 time bands (`hour >= 23 || < 5` late_night, `5–7` early_morning, `7–12` morning, `12–17` afternoon, else evening) using `seed = (hour * 7 + (firstName.length || 3)) % templates.length`, and the subtitle is always `'How can I help with your data today?'` (`useGreeting.ts:32-122`, `:118`).

Prompt chips — verbatim:

| Condition | Chips |
| --- | --- |
| A context table is set (`aiContextTable`) | `Describe the ${aiContextTable} table` · `Show top 10 rows from ${aiContextTable}` · `Any anomalies in ${aiContextTable}?` (`ChatEmptyState.tsx:54-58`) |
| Otherwise, if tables exist | Up to the **first 4** tables, each rendered as `@{table}` + the word `overview`, sending `` `Tell me about the @${table} table` `` (`ChatEmptyState.tsx:71-80`) |
| No tables | No chips (`:82`) |

Clicking a chip calls `onSelectPrompt`, which **only fills the composer and focuses it** — it does not send (`AIChatMain.tsx:583-586`).

### 13.2 Loading skeleton

`ChatLoadingSkeleton` is shown while `isSwitchingChat` is true (`AIChatMain.tsx:549-554`), i.e. when `chatId` differs from the last loaded id and the history query has not caught up (`useChatHistory.ts:105-106`). It is a static `animate-pulse` composition with `aria-label="Loading chat conversation"` (`ChatLoadingSkeleton.tsx:8`): a right-aligned `h-10 w-48 sm:w-64` user bubble (`:11`) and a left-aligned `max-w-xl` assistant column with a `w-5 h-5` avatar dot, a `h-4 w-28` bar, three text bars at `w-full` / `w-5/6` / `w-2/3`, and an `h-28` artifact box containing a `h-4 w-36` and an `h-12` bar (`:14-30`). There is no timer, no minimum display duration, and no skeleton for pagination (`isLoadingOlder` only swaps the button label, `AIChatMain.tsx:608-613`).

### 13.3 History guards worth noting

Rehydration refuses chats from the other surface: if `chat.use_case` exists and is neither `'data_explorer'` nor `'general'`, it toasts `'This conversation belongs to Dashboard AI and cannot be viewed in Resona AI Explorer.'` and calls `onNewChat` (`useChatHistory.ts:50-56`). A failed history load toasts `'Unable to load chat conversation.'` and starts a new chat, but only when `localMessages.length > 0` and voice is not active (`:74-80`).

---

## Dead / Unused Code

| Item | Evidence |
| --- | --- |
| `MentionOverlay`'s `isCompact` prop | Declared in the inline prop type and passed as `isCompact={false}` in the empty-state branch, but never referenced in the component body (`ChatInput.tsx:29`, `:371`, body `:31-78`) |
| `AgentStatusBar`'s `model?: string \| null` prop | Declared in `AgentStatusBarProps` but not destructured and never rendered (`AgentStatusBar.tsx:22`, destructuring `:28-35`) |
| `LocalMessage.tokenCount` | Populated on rehydration (`messageMapper.ts:171`) and on finalise (`AIChatMain.tsx:368`) but no renderer reads it; only `creditsUsed` is displayed (`ChatMessage.tsx:348-352`) |
| `LocalMessage.model` | Populated (`messageMapper.ts:176`, `AIChatMain.tsx:370`) and never read anywhere |
| `LocalMessage.isAgent` | Set to `true` on finalise (`AIChatMain.tsx:367`) and on the voice interim merge (`useChatVoiceIntegration.ts:98`, `:113`), but nothing branches on it — `ChatMessage` keys off `msg.role` (`ChatMessage.tsx:59`, `:77`, `:116`, `:268`) |
| `ContextMeta.context_pct` | Declared in the type (`ai/types.ts:332`) and set by the `context_meta` reducer (`useAIAgent.ts:472-475`), but `ContextWindowBar` recomputes the percentage from `tokens_estimated / context_limit` instead (`ContextWindowBar.tsx:28`) |
| `ContextWindowBar`'s `className` prop | Merged via `cn(...)` (`:45`) but no caller passes it (`ChatInput.tsx:736-740`) |
| `useChatVoiceIntegration`'s `isVoiceConnected` | Returned (`:126`) and consumed nowhere; `AIChatMain` destructures only `isVoiceActive`, `presence`, `orbState`, `audioLevelRef`, `isVoiceMuted`, `isVoiceConnecting`, `isVoiceTalking`, `isTypeOpen`, `toggleMute`, `endSession`, `setPresence`, `getFinalDisplayMessages`, `handleToggleVoice` (`AIChatMain.tsx:555-569`, `:655-669`) |
| `MODE_META` (`src/lib/modes.ts:41-56`) | No importer in the app; the selector compares raw strings (`ModeSelector.tsx:36-37`) |
| `MarkdownText`'s exported `ColumnAlignment` type | Used only inside the module (`:165`, `:179`, `:220`); no external importer |
| `.dockerfile` in `ALLOWED_FILE_EXTENSIONS` | Accepted by validation (`fileValidation.ts:13`) but absent from the file-input `accept` list, so it cannot be chosen through the picker (`ChatInput.tsx:397`, `:598`) |
| Turn-rail keyboard affordance | `role="button" tabIndex={0}` with no `onKeyDown` (`TurnNavigator.tsx:121-127`) |

## Contradictions / Correctness Risks

1. **`Esc` to stop generation is advertised but not implemented.** Both stop buttons declare `shortcut="Esc"` (`ChatInput.tsx:470`, `:671`); the only `Escape` listeners in the surface are the mention picker, turn menu and lightbox.
2. **`Enter` during IME composition submits.** `handleKeyDown` has no `isComposing` guard (`useChatInputState.ts:128-153`), so a composition-confirm Enter fires `onSend()`.
3. **Sent image attachments can lose their download link.** The upload response artifact stores the URL as camelCase `downloadUrl` (`useChatSendOrchestrator.ts:267`), but the download anchor and the lightbox payload read `att.download_url` first (`ChatMessage.tsx:141`, `:176`). When the server omits `download_url` and only the `/api/ai/files/{id}/content` fallback is present, preview still works (via `file_id` → `/ai-api/ai/files/{id}/raw`, `fileValidation.ts:59-62`) but no download anchor renders.
4. **Two different route prefixes for file bytes.** `imagePreviewUrl` emits `/ai-api/ai/exports/content?key=…` and `/ai-api/ai/files/{id}/raw` (`fileValidation.ts:59-60`), while the upload fallback stored on artifacts is `/api/ai/files/{id}/content` (`useChatSendOrchestrator.ts:125`, `:267`).
5. **Malformed markdown tables are silently deleted**, not escaped (`MarkdownText.tsx:561-582`).
6. **`#### ` headings and indented list items render as literal text** (`MarkdownText.tsx:585`, `:599`), so deep or nested model output looks broken rather than nested.
7. **`useChatInputState`'s Backspace handler resizes the textarea without the 160 px clamp** — `style.height = scrollHeight` (`:146`) versus `Math.min(scrollHeight, 160)` on every other path (`:83`, `:92`).
8. **Voice-composer rendering and `MentionPicker` both register window-capture key handlers** (`MentionPicker.tsx:50`, `useChatVoiceIntegration` overlay path), so while the picker is open the composer's Enter is unreachable by design (`:37-42`) — correct, but the ordering is implicit.

## Open Questions

- UNVERIFIED: whether the backend enforces the same 25 MB cap and the same extension allowlist. `fileValidation.ts:6` only says "must match backend"; the Python service is outside this repo.
- UNVERIFIED: what the backend does with `mentioned_tables` — whether it injects schema, sample rows or row counts for each mentioned table. The client sends names only (`useChatSendOrchestrator.ts:304`, `useAgentStream.ts:156-157`).
- UNVERIFIED: whether `/ai-api/ai/files/{id}/raw` and `/ai-api/ai/exports/content` resolve in every deployment (proxy rewrite), given the rest of the API client uses `/api/ai/...`.
- UNVERIFIED: whether `.dockerfile` is accepted by the upload endpoint, since the picker cannot select it.
- UNVERIFIED: whether the `Esc`-to-abort shortcut was ever implemented or deliberately dropped; only the tooltip survives.
- UNVERIFIED: whether IME-safe Enter handling (or `beforeinput`/`insertCompositionText` tricks) is planned; nothing in the code addresses composition.
- UNVERIFIED: which server event populates `tokens_estimated` / `context_limit` in practice, and what `context_pct` from the backend is meant to represent, since the client never reads it.
- UNVERIFIED: whether the non-agent `POST /api/ai/chat` path (`useAIStream`) is still reachable in production. `agentMode = Boolean(connectionId)` (`AIChatMain.tsx:82`) makes the branch exist, but no source in this repo documents when `connectionId` is absent while the chat surface is rendered.
- UNVERIFIED: the intended behaviour of `TablePreview` for non-`public` schemas. Every caller omits `schemaName`, so it always previews `public` (`TablePreview.tsx:5`, callers `ChatInput.tsx:56`, `MarkdownText.tsx:141`, `ChatMessage.tsx:92`) while `availableTables` is likewise `public`-only (`AIChatMain.tsx:85`).
- UNVERIFIED: whether `LocalMessage.mentionedTable` intentionally records only the first mention (`useChatSendOrchestrator.ts:240`) while all mentions are transmitted.
- UNVERIFIED: whether the pinned-artifact list in `localStorage` is intended to sync across sessions/devices — no API call exists for pinning.
