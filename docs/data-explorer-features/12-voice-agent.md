---
title: Voice Agent
section: 12
area: voice
sources: 31
status: rough
---

# 12. Voice Agent

Scope: the frontend Resona Voice subsystem — `src/components/voice/**` in full (the Gemini Live WebSocket client, the session hook, the recorder/player pair, the provider that owns the session above the view switch, the orb renderers and their drag maths, the controls), plus the chat-side bridge `useChatVoiceIntegration.ts` and the `VoiceSessionProvider` / `FloatingVoiceOrb` wiring in `DataExplorerPage.tsx`. Also read for verification: `public/worklets/voice-recorder-worklet.js` (the capture DSP), `orbs/__tests__/orb-position.test.ts`, and — as cross-references only — `AIChatMain.tsx`, `ChatInput.tsx`, `src/index.css`. The server side (`/api/voice/session`, the Node WS handler, the Python gateway, Gemini Live itself) is not in this repo's frontend and is **not** documented here; every statement below is derived from frontend source only.

## Component / File Map

| File | Responsibility | ~Lines |
| --- | --- | --- |
| `src/components/voice/hooks/useVoiceSession.ts` | The core hook: state flags, event router (barge-in / audio / transcriptions / turn-complete / tool calls), session start + teardown, reconnect backoff, 60-minute cap, orb-state derivation | 686 |
| `src/components/voice/hooks/VoiceSessionProvider.tsx` | React context that owns the session above the view switch; chat binding; presence (`expanded`/`minimized`); overlay-mounted flag | 114 |
| `src/components/voice/voice-socket-client.ts` | `VoiceSocketClient`: URL build, envelope send, pre-open queue, frame dispatch, close | 162 |
| `src/components/voice/types.ts` | `VoiceMessage`, `GeminiEvent`, `ServerFrame`, `ClientMessage`, `ToolCallInfo`, `UseVoiceSessionReturn` | 81 |
| `src/components/voice/audio/voice-audio-recorder.ts` | `getUserMedia` + AudioContext + AudioWorklet + AnalyserNode; mute-as-silence; level read | 128 |
| `public/worklets/voice-recorder-worklet.js` | Box-average decimator to 16 kHz Int16; posts a transferable `ArrayBuffer` every 100 ms | 63 |
| `src/components/voice/audio/voice-audio-player.ts` | Base64 24 kHz PCM → `AudioBufferSourceNode` queue with a 30 ms lead-in; barge-in `stopAndClear` | 147 |
| `src/components/voice/hooks/useVoiceAudioLevel.ts` | rAF loop mirroring recorder level into a mutable ref (no re-render) | 39 |
| `src/components/voice/hooks/useSpeechToText.ts` | Browser-native Web Speech dictation hook (separate feature from the live call) | 129 |
| `src/components/voice/hooks/useVoiceChatSync.ts` | Reconciles finalized `VoiceMessage[]` into the chat's `localMessages` | 70 |
| `src/components/voice/orbs/orb-state.ts` | `OrbState` vocabulary, per-state palette, motion/energy maths, `createStateMix`, `orbVars` | 196 |
| `src/components/voice/orbs/IridescentFlow.tsx` | WebGL orb: fullscreen-triangle fragment shader, state mixing, CSS-gradient fallback, context-loss handling | 480 |
| `src/components/voice/orbs/PulseOrb.tsx` | Pure-CSS/DOM orb: glow, 3 ring sets, conic arc, core; per-state CSS custom properties | 281 |
| `src/components/voice/orbs/use-orb-level.ts` | Writes `--orb-level/-bass/-mid/-treble` each frame; reduced-motion short-circuit | 90 |
| `src/components/voice/orbs/use-in-view.ts` | `observeActivity` (IntersectionObserver + `visibilitychange`) and the unused `useInView` hook | 66 |
| `src/components/voice/orbs/use-webgl-support.ts` | Module-cached WebGL/WebGL2 probe with `failIfMajorPerformanceCaveat: true` | 25 |
| `src/components/voice/orbs/orb-position.ts` | Pure drag/snap/persist maths + `localStorage` persistence | 56 |
| `src/components/voice/orbs/__tests__/orb-position.test.ts` | Vitest coverage of clamp/isDrag/snap/load/save/defaultPos | 102 |
| `src/components/voice/components/FloatingVoiceOrb.tsx` | Body-portal orb: drag, keyboard nudge, renderer toggle, hover mute/end/expand buttons | 251 |
| `src/components/voice/components/VoiceOrbStage.tsx` | In-stream orb stage (`hero` 160 px / `docked` 112 px / compact 68 px) | 87 |
| `src/components/voice/components/VoiceControlBar.tsx` | `+ Type` toggle, status dot + 5-bar equalizer, mute, minimize, end | 178 |
| `src/components/voice/components/VoiceSessionOverlay.tsx` | Container: registers `isOverlayMounted`, `hero` vs `docked` layout, returns `null` when minimized | 122 |
| `src/components/voice/components/VoicePanel.tsx` | Composer entry button (waveform icon, spinner while connecting) | 66 |
| `src/components/voice/components/VoiceWaveformIcon.tsx` | 4-bar (ChatGPT-style) and 5-bar (Claude-style) SVG icons | 159 |
| `src/components/voice/components/MicButton.tsx` | Composer **dictation** button wired to `useSpeechToText` | 89 |
| `src/components/voice/index.ts` | Feature barrel (with a written two-rule import policy) | 40 |
| `src/components/ai/chat/hooks/useChatVoiceIntegration.ts` | Chat-side glue: binds chat + user name, start/stop, interim-voice merge | 141 |
| `src/pages/DataExplorerPage.tsx` | `VoiceSessionProvider` mounted above the view switch; `FloatingVoiceOrb` at the page root | 518 |

## Two distinct voice features

There are **two unrelated voice features** in this codebase. They share the `voice/` folder and neither knows about the other.

| | A — Agentic live call | B — Composer dictation |
| --- | --- | --- |
| Entry control | `VoicePanel` (`VoicePanel.tsx:23-65`, used at `ChatInput.tsx:460,661`) | `MicButton` (`MicButton.tsx:12-89`, used at `ChatInput.tsx:459,660`) |
| Engine | `VoiceSocketClient` → `/api/voice/session` (`voice-socket-client.ts:51`) | `window.SpeechRecognition` / `webkitSpeechRecognition` (`useSpeechToText.ts:42-45`) |
| Transcription | **Server-side**, via `server_content.input_transcription` / `output_transcription` (`useVoiceSession.ts:210,253`) | **Browser-native**, `recognition.onresult` (`useSpeechToText.ts:56-75`) |
| Audio leaves the browser | Yes — mic PCM frames over WebSocket | No audio leaves; only text |
| Output | Model audio played through `VoiceAudioPlayer` | Text appended into the composer textarea |
| Barge-in | Yes (`useVoiceSession.ts:176-190`) | No |
| Owner | `VoiceSessionProvider`, above the view switch | `MicButton`, inside the composer |
| Rendered when | `!isStreaming` (`ChatInput.tsx:457`) | `!isStreaming` (`ChatInput.tsx:457`) |

Both buttons are hidden while a text answer is streaming (`ChatInput.tsx:457,658`). Dictation does **not** auto-send: `onTranscript` appends to the input and focuses the textarea (`AIChatMain.tsx:516-519`), and the user still presses send. Section B is documented here only to fix the distinction; its states/copy are also covered in section 07.

## Transport — `VoiceSocketClient`

- **Scheme/URL.** Same-origin only, derived from `window.location`: `wss:` when `window.location.protocol === 'https:'`, else `ws:`; host is `window.location.host` (`voice-socket-client.ts:45-46`). Final URL is `` `${wsProto}//${wsHost}/api/voice/session?${query}` `` (`voice-socket-client.ts:51`). There is no configurable base URL, no dev-server proxy target and no feature flag in the client.
- **Subprotocol.** None. The constructor is called with a single argument — `new WebSocket(wsUrl)` (`voice-socket-client.ts:53`) — so no `Sec-WebSocket-Protocol` is negotiated.
- **Auth handshake.** No token, no `Authorization` header, no first-frame handshake message. Identity is passed as **URL query parameters**: `connection_id` (if truthy), `session_id` (if truthy), `user_name` (if truthy), built with `URLSearchParams` (`voice-socket-client.ts:47-50`). The handshake therefore depends entirely on same-origin cookies the browser attaches to the upgrade request; no credential is read from app state in this file. Privacy note: `user_name` travels in the query string, i.e. it lands in server access logs.
- **Client → server envelope.** Text frames, JSON (`types.ts:55-58`):
  - `{ type: 'AUDIO_CHUNK', data: <base64>, mime: 'audio/pcm;rate=16000' }` — `AUDIO_MIME` is a module constant (`voice-socket-client.ts:7`), sent at `voice-socket-client.ts:93-99`.
  - `{ type: 'TEXT', text }` (`voice-socket-client.ts:110`) — **no callers** (see Dead Code).
  - `{ type: 'CLOSE' }` (`voice-socket-client.ts:120`).
- **Base64 conversion.** Chunked to avoid a spread-arg blow-up: `const CHUNK = 0x4000` (16 384) bytes per `String.fromCharCode(...)` call, then `btoa` (`voice-socket-client.ts:10-18`). Base64 inflates the wire payload by ~33 % over raw PCM.
- **Pre-open queue.** Chunks produced while `readyState === CONNECTING` are buffered in `preopenQueue` up to `MAX_PREOPEN_QUEUE = 50` (`voice-socket-client.ts:8,100-105`) and drained in order inside `onopen` (`voice-socket-client.ts:56-64`). Chunks sent while `CLOSING`/`CLOSED` are dropped silently (`voice-socket-client.ts:88-89`).
- **Server → client envelope.** Text frames parsed as `ServerFrame` (`types.ts:39-53`), dispatched in `dispatchFrame` (`voice-socket-client.ts:140-161`):

  | `type` | Payload fields | Callback |
  | --- | --- | --- |
  | `session_ready` | `model?`, `voice?` | `onSessionReady(model, voice)` |
  | `gemini_event` | `data: GeminiEvent` | `onGeminiEvent(data)` |
  | `tool_result` | `id?`, `name?`, `sql?`, `payload?` | `onToolResult(name, sql, payload, id)` |
  | `turn_formatted` | `turn_index?`, `content?`, `artifacts?`, `toolSteps?`, `credits_charged?`, `was_interrupted?` | `onTurnFormatted(frame)` |
  | `session_ended` | `reason?`, `message?` | `onSessionEnded(reason, message)` |
  | `error` | `code?`, `message?` | `onError(message \|\| code \|\| 'Voice error', code)` |

  `dispatchFrame` has no `default` branch — an unknown frame `type` is silently ignored (`voice-socket-client.ts:141-160`).
- **Keepalive / ping.** **None.** There is no ping frame, no `pong`, no `setInterval` heartbeat and no `bufferedAmount` back-pressure check anywhere in the client (`voice-socket-client.ts` has no timer of any kind). The only `setTimeout` calls in the feature are the reconnect delay and the 60-minute cap in `useVoiceSession.ts:161,400`.
- **Teardown.** `close(code = 1000, reason = 'user ended session')` sends `{type:'CLOSE'}` (best-effort, inside `try`), calls `socket.close(code, reason)`, nulls `this.ws` and clears `preopenQueue` (`voice-socket-client.ts:114-130`). `connect()` calls `this.close()` first, so re-connecting cannot leak a socket (`voice-socket-client.ts:41`).

## Session lifecycle

### State table

Flags are React state in `useVoiceSession` (`useVoiceSession.ts:42-49`); `orbState` is derived, in this exact precedence order (`useVoiceSession.ts:659-667`): `error` → `connecting` → `thinking` → `speaking` → `disabled` → `listening` → `idle`.

| Phase | Flag combination | `orbState` | Entered by | Left by | Source |
| --- | --- | --- | --- | --- | --- |
| Idle | all false, `error === null` | `idle` | default `useState` | `startSession()` | `useVoiceSession.ts:42-49`, `:666` |
| Connecting | `isConnecting === true` | `connecting` | `setIsConnecting(true)` at the top of `startSession` (`:373`) and again on each reconnect (`:160`) | `onSessionReady` (`:404`); `onClose` (`:618`); catch block (`:628`); fatal `error` frame (`:608`) | `useVoiceSession.ts:373,160,404,618,628,608` |
| Ready / listening | `isConnected === true` | `listening` | `onSessionReady` → `setIsConnected(true)` after the server sends `session_ready` (`:405`) | close / error / end | `useVoiceSession.ts:397-407` |
| Recording (implicit) | `isConnected === true`, mic track enabled, no server event yet | `listening` | Recorder begins pushing chunks from the moment `recorder.start()` resolves (`:377-382`) — i.e. capture starts **before** the socket exists | — | `useVoiceSession.ts:377-382` |
| Streaming (client → server) | any active state; chunks in flight | unchanged | worklet `port.postMessage` every 100 ms | — | `public/worklets/voice-recorder-worklet.js:54` |
| Thinking | `isThinking === true` | `thinking` | `tool_call.function_calls` (`:312`); `onToolResult` (`:412`) | `output_transcription` (`:255`); `turn_complete` (`:295`); barge-in (`:180`) | `useVoiceSession.ts:308-312,411-412,255,295,180` |
| Responding / speaking | `isTalking === true` | `speaking` | any `model_turn.parts[].inline_data.data` → `player.enqueueChunk` (`:202-205`) | `turn_complete` (`:294`); barge-in (`:179`) | `useVoiceSession.ts:193-206` |
| Turn closed | both false, still connected | `listening` | `turn_complete` (`:292-305`) | next event | `useVoiceSession.ts:292-305` |
| Muted | `isMuted === true`, connected, not busy | `disabled` | `toggleMute` (`:104-111`) | `toggleMute` again | `useVoiceSession.ts:104-111,664` |
| Error | `error !== null` | `error` | any `showError(msg)` (`:73-76`) | `showError(null)` on `startSession` (`:372`) and on `onSessionReady` (`:406`) | `useVoiceSession.ts:73-76,372,406` |
| Disconnected | all false | `idle` or `error` | `endSession()` (`:121-141`) or `onClose` (`:614-624`) | — | `useVoiceSession.ts:121-141,614-624` |

There is no separate `recording` or `streaming` boolean — capture and uplink are unconditional once the recorder exists; the orb only reflects `isTalking` / `isThinking`.

### Start sequence (strict order)

`startSession` (`useVoiceSession.ts:368-636`) does, in order:

1. Bail out if a socket is already `OPEN` or `CONNECTING` (`:369`).
2. `userEndedRef.current = false`, `showError(null)`, `setIsConnecting(true)` (`:371-373`).
3. **Microphone first** — construct `VoiceAudioRecorder`, apply current mute state, `await recorder.start(...)` with the callback `chunk => socketClientRef.current?.sendAudioChunk(chunk)` (`:377-382`). Consequence: every chunk produced before step 5 assigns `socketClientRef.current` is **dropped**, not queued.
4. **Playback engine second** — `new VoiceAudioPlayer()` then `await player.resume()` (`:385-387`). The comment states the ordering intent: hardware routing first, audio engine after.
5. **Socket last** — `new VoiceSocketClient()`, then `client.connect(connectionId, sessionId, {...callbacks}, userName)` (`:390-393,625`).

### Ready handshake

`onSessionReady` (`:397-407`): resets `reconnectAttemptsRef` to 0, clears any pending session-limit timer, arms a new one for `VOICE_SESSION_LIMIT_MS`, clears `isConnecting`, sets `isConnected`, clears the error. `VOICE_SESSION_LIMIT_MS = 60 * 60 * 1000 + 5000` = **3 605 000 ms** (60 min + 5 s), and expiry shows the string `'Voice session reached the 60-minute limit'` then calls `endSession()` (`:21`, `:400-403`). The limit is client-enforced only; the counter starts at `session_ready`, so connection time is not counted.

### Reconnect / backoff

`scheduleReconnect(closeCode?, closeReason?)` (`:144-168`):

- `MAX_RECONNECT_ATTEMPTS = 2` (`:19`), `RECONNECT_BASE_DELAY_MS = 500` (`:20`).
- Delay is linear, not exponential: `RECONNECT_BASE_DELAY_MS * (attempt + 1)` → **500 ms** for the 1st retry, **1000 ms** for the 2nd (`:159`). No jitter.
- On exhaustion (`attempt >= 2`): counter reset to 0, `showError` with the sticky `errorRef.current` if set, otherwise the template `Voice connection lost (code ${closeCode}): ${closeReason}` (`:147-154`) — components are omitted when the corresponding argument is falsy. `isConnecting` is set false; the socket and media are already torn down by `onClose`.
- `onClose` skips reconnection when `userEndedRef.current` is true or the code is `1000` or `1001` (`:622`).
- A fatal `error` frame sets `userEndedRef.current = true`, which suppresses reconnection (`:610-612`). Fatal codes: `session_duration_exceeded`, `quota_exhausted`, `quota_unavailable`, `model_not_allowed`, `concurrent_limit` (`:22-29`).
- A thrown exception during `startSession` (e.g. `getUserMedia` rejection, worklet load failure) routes to `scheduleReconnect` when `reconnectAttemptsRef.current > 0`, otherwise to `showError(message)` (`:626-635`).
- The reconnect timer calls `startSessionRef.current`, a ref kept fresh by an effect (`:639-641`, `:164`) so the retry never calls a stale closure.

### Survival across view-mode switches and re-renders

- `VoiceSessionProvider` wraps everything **above** the `mode` ternary in `DataExplorerPage`: `<VoiceSessionProvider connectionId={connectionId ?? undefined}>` at `DataExplorerPage.tsx:369`, closing at `:516`, with the rationale comment at `:364-368`. `AIChatMain` (and therefore `useVoiceSession`'s former host) unmounts when the view leaves `ai`.
- `useVoiceSession`'s only unmount cleanup sets `userEndedRef = true`, clears both timers, closes the socket and disposes recorder + player (`:644-656`) — that path is now reached only when the whole page/provider unmounts.
- Media and socket live in refs (`socketClientRef`, `playerRef`, `recorderRef`, `:52-54`); all live audio levels live in a mutable ref (`useVoiceAudioLevel.ts:12`) so per-frame level reads never re-render the tree.
- `presence` (`'expanded' | 'minimized'`, default `'expanded'`) and `isOverlayMounted` live in the provider (`VoiceSessionProvider.tsx:63-64`). The overlay registers itself on mount/unmount and returns `null` when minimized (`VoiceSessionOverlay.tsx:50-59,65`); the floating orb shows when `presence === 'minimized'` **or** `isOutsideChat` **or** the overlay is not mounted (`FloatingVoiceOrb.tsx:115-117`).
- `FloatingVoiceOrb` renders `null` unless `mounted` (post-mount effect, to avoid a flash at 0,0) **and** a context exists **and** `voice.isActive` (`:107-110`). `isActive = isConnected || isConnecting` (`VoiceSessionProvider.tsx:73`). So the orb is absent until a call is started.
- Chat binding: `useChatVoiceIntegration` pushes the viewed `chatId` and `userName` into the provider (`useChatVoiceIntegration.ts:48-56`), and the provider copies `sessionChatId` into the `session_id` sent on the wire (`:66-70`). Switching chats while a call is live therefore **re-points** the next `startSession` at the new chat rather than tearing anything down.
- The `userName` comment documents the reason for early propagation: the gateway greets by name and degrades to "Hey there" if it arrives late (`useChatVoiceIntegration.ts:52-56`).

## Audio capture

`VoiceAudioRecorder.start()` (`voice-audio-recorder.ts:18-73`), preceded by `this.dispose()` (`:19`).

- **Constraints** (`voice-audio-recorder.ts:22-29`), verbatim: `{ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }`. **No `sampleRate` and no `deviceId`** — there is no device picker anywhere in the feature (`enumerateDevices` / `setSinkId` / `deviceId` do not occur in `src/`), so the OS default input is always used.
- **Context**: `window.AudioContext || window.webkitAudioContext`, no forced sample rate (`:38-41`).
- **Worklet**: `await ctx.audioWorklet.addModule('/worklets/voice-recorder-worklet.js')` (`:44`), then `new AudioWorkletNode(ctx, 'voice-recorder-worklet')` (`:58`).
- **Graph**: `MediaStreamAudioSourceNode` → both the analyser (`:53`) and the worklet (`:60`). The worklet's `port.postMessage` is **not connected to any output node** — the node exists purely to pull data.
- **Analyser**: `fftSize = 256`, `smoothingTimeConstant = 0.4` (`:51-52`); buffer allocated as `new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))` (`:55`) to keep the typed-array/`ArrayBuffer` TS split happy.
- **Downsampling / format** (`public/worklets/voice-recorder-worklet.js`): `targetSampleRate = 16000` (`:20`), ratio `sampleRate / 16000` (`:22`), fractional `residual` carried across `process()` blocks (`:23,36,58`) so 44.1 k and 48 k contexts both work. Box-average decimation with clamping to [-1, 1] (`:43-46`), scaled to Int16 as `Math.round(x * 0x8000)` when negative and `Math.round(x * 0x7fff)` when positive (`:46`).
- **Chunk size / cadence**: `chunkSamples = Math.round(16000 * 0.1)` = **1600 samples = 3200 bytes = 100 ms**, posted as a **transferable** (`postMessage(out.buffer, [out.buffer])`, `:26,54`) — zero-copy, "no GC churn at 10Hz". So the wire unit is raw **16-bit LE mono PCM at 16 kHz**, 10 frames/second, base64-wrapped by the socket client. No WAV/Opus container is produced client-side.
- **Mute semantics**: `setMuted()` sets `track.enabled = false` on every audio track (`:79-86`), **and** the worklet handler replaces each muted chunk with `new ArrayBuffer(event.data.byteLength)` — i.e. zero-filled silence of the same length (`:62-72`). The in-code rationale is that dropping chunks punched a hole in the session timeline and desynchronised the server-side recording (`:63-66`). Note the interaction: disabling the track does not stop `AudioWorkletProcessor.process()` from being called, so the silence substitution is what actually keeps the cadence.
- **Level read** (`getAudioLevel`, `:91-100`): `getByteFrequencyData` → mean over all bins → `clamp(avg / 128)` into 0..1; returns `0` when muted or when the analyser is absent.
- **Disposal** (`:105-127`): disconnects worklet/analyser/source, calls `t.stop()` on **all** tracks (video too, if any), closes the `AudioContext`.

## Audio playback

`VoiceAudioPlayer` (`voice-audio-player.ts`):

- **Constants**: `OUTPUT_SAMPLE_RATE = 24000`, `JITTER_LEAD_SECONDS = 0.03` (`:17-18`).
- **Context**: default `AudioContext` — deliberately **not** forced to 24 kHz, with the comment that Windows WASAPI/hardware DACs need native 44.1/48 kHz and the browser resamples from the buffer rate (`:28-34`).
- **Graph**: `AudioBufferSourceNode` → `gainNode` (gain `1.0`) → `destination`, plus a parallel `gainNode` → `analyser` tap (`fftSize = 256`, `smoothingTimeConstant = 0.4`) (`:36-45`).
- **Chunk decode** (`enqueueChunk`, `:69-109`): base64 → `Uint8Array` (tolerating URL-safe `-`/`_` and whitespace, `:136`), reject if `< 2` bytes, `sampleCount = floor(byteLength / 2)`, `getInt16(i*2, /*littleEndian*/ true) / 32768` into a `Float32Array`, `createBuffer(1, sampleCount, 24000)`.
- **Queueing / jitter handling**: `startAt = Math.max(ctx.currentTime + 0.03, nextPlayTime)`; `nextPlayTime = startAt + audioBuffer.duration` (`:95-99`). Sources are tracked in a `Set` and removed in `onended`; when the set empties, `nextPlayTime` resets to 0 so the next chunk takes a fresh 30 ms lead-in (`:102-108`). This is a fixed lead-in, not an adaptive jitter buffer — the file header's "growing only after an underrun" (`:5-6`) is not what the code does; the lead-in is constant at 0.03 s.
- **Playback rate**: never modified — no `playbackRate` assignment exists in the file, so chunks play at 1.0.
- **Underrun/suspended-context recovery**: if the context is not `running`, `enqueueChunk` fires `this.ctx.resume()` and logs a warning on failure (`:71-73`). `resume()` is a no-op unless suspended (`:49-53`).
- **Barge-in / interruption**: `stopAndClear()` (`:112-125`) stops + disconnects every live source, clears the set, and zeroes `nextPlayTime`, **keeping the AudioContext open** so the user-gesture resume state survives (`:123-124`). It is invoked from the session hook on `interrupted` (`useVoiceSession.ts:178`) and from `dispose()`.
- **Output level**: `getAudioLevel()` computes `(avg / 128) * 1.6` and returns 0 when no sources are live (`:55-66`) — never called (see Dead Code).
- Model audio only ever arrives as `server_content.model_turn.parts[].inline_data.data` (base64), routed straight into `enqueueChunk` (`useVoiceSession.ts:201-206`).

## Speech-to-text

- **Engine**: browser-native Web Speech API. `isSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window` (`useSpeechToText.ts:32-34`); the instance is `window.SpeechRecognition || window.webkitSpeechRecognition` (`:42-45`).
- **Configuration**: `lang = 'en-US'` default (`:24`), `continuous = false` default (`:25,47`), `interimResults = true` (`:48`), `maxAlternatives = 1` (`:49`). Recogniser options are set inside a `useEffect` keyed on `[isSupported, lang, continuous]` (`:98`), so changing any option **recreates and `abort()`s** the recogniser (`:95-97`).
- **Result handling** (`onresult`, `:56-75`): iterates from `event.resultIndex`; `isFinal` fragments are concatenated into `finalTranscript` and delivered with `isFinal = true` after `status` briefly flips to `'processing'` (`:68-71`); non-final fragments become `interimTranscript` delivered with `isFinal = false` (`:72-74`). Text is `.trim()`ed before delivery.
- **Statuses**: `'idle' | 'listening' | 'processing' | 'error' | 'unsupported'` (`:3`). `onend` resets `'listening'` → `'idle'` (`:89-91`). `stop()` calls `recognition.stop()` and forces `'idle'` (`:109-113`).
- **Unsupported browser**: the effect sets `status = 'unsupported'` and returns (`:37-40`); `MicButton` renders `null` — the control simply disappears, with no message (`MicButton.tsx:17`).
- **UI** (`MicButton.tsx`): tooltip `'Stop recording'` / `errorMessage ?? 'Microphone error'` / `'Dictate message'` (`:25-31`); `aria-label` `'Stop recording'` or `'Start voice input'` (`:38`); button disabled while processing or when the caller passes `disabled` (`:37`, wired to `isStreaming` at `ChatInput.tsx:459,660`). While listening: red icon + `animate-ping` ring (`:53-56`) and a 4-bar live indicator with heights `${6 + (i % 3) * 3}px` and delays `${i * 0.15}s` (`:73-85`). Error state renders an extra tooltip bubble with the raw message (`:66-70`).
- **Where the text goes**: interim → `interimSpeech` state → rendered inside the mention overlay in muted, pulsing text (`ChatInput.tsx:243-249`, `:69-74`, `:367,569`); final → `onTranscript` → appended to the input with a space separator and the textarea focused (`AIChatMain.tsx:516-519`).
- **Agentic-path transcription** is entirely server-side: `input_transcription` (user) and `output_transcription` (model) inside `gemini_event` frames (`useVoiceSession.ts:209-289`). Interim/final is derived from `input_transcription.finished` → `isInterim: !isFinished` (`:212,229,237`); assistant tokens are appended to a single pending bubble until the turn closes (`:264-288`).

## Audio level and reactivity

- **Sampling**: a `requestAnimationFrame` loop, i.e. display refresh rate, not a fixed interval. `useVoiceAudioLevel(recorderRef, isConnected)` starts only while connected (`useVoiceSession.ts:71`), writes `audioLevelRef.current = recorderRef.current.getAudioLevel()` each frame and forces `0` when inactive or on cleanup (`useVoiceAudioLevel.ts:14-36`).
- **Source**: the **recorder's** (microphone) level only — `AnalyserNode` `fftSize 256`, `smoothingTimeConstant 0.4`, mean-of-bins `/ 128` (`voice-audio-recorder.ts:50-55,91-100`). The player's analyser is not wired to the orb.
- **Orb smoothing**: `useOrbLevel` exponentially approaches the target with rate **7.7** and `dt` clamped to **0.1 s** (`use-orb-level.ts:41,47`), then writes four CSS variables each frame with 3-decimal precision: `--orb-level`, `--orb-bass`, `--orb-mid`, `--orb-treble` (`:57-60`). Fallback target when no live level exists is `stateEnergy(state, clock)` (`:46`); the bass/mid/treble "bands" are synthesised as `level * (0.78 + 0.22 * sin(...))` with three different frequencies (2.3 / 3.4+2.1 / 4.6+4.2) (`:53-56`) — no real band split exists.
- **WebGL orb smoothing**: a second, independent smoother inside the render loop, rate **8**, same `dt` cap of 0.1 (`IridescentFlow.tsx:348,371`); flow rate is separately smoothed at rate **4** (`:351`).
- **Where the level is consumed**: `--orb-level` drives the PulseOrb core scale `1 + 0.14 * level`, glow opacity `0.5 + 0.5 * level`, ring emission opacity `0.4 + 0.5 * level` (`PulseOrb.tsx:99,129,138,204`) and the IridescentFlow `uLevel` uniform (`IridescentFlow.tsx:307,357`) plus the CSS fallback box-shadow radius (`IridescentFlow.tsx:438`).
- **Bar-chart equalizer in the control bar is decorative**: five fixed-height spans with staggered `animate-[soundbar_…]` classes (`VoiceControlBar.tsx:116-122`), gated on `!isMuted && !isConnecting`; `@keyframes soundbar` is `scaleY(0.4) → 1 → 0.4` (`src/index.css:5-8`). It is **not** driven by `audioLevelRef`.

## The orb

### Visual state machine (`orbs/orb-state.ts`)

`OrbState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error' | 'disabled'` (`orb-state.ts:30-37`). `error` and `disabled` are absent from the `ORB_STATES` array (`:39-45`).

| State | Produced when | Palette `from` → `to` | `glow` | `stateMotion` | `stateEnergy(t)` | PulseOrb per-state CSS | IridescentFlow `FLOW_RATE` / fallback opacity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `idle` | nothing active (`:666`) | `#6366f1` → `#818cf8` | `rgba(99,102,241,0.18)` | `none` (`:99-106`) | `0` (default, `:122`) | base values: glow `0.55`, ring-scale `2.3`, breathe-idle `1`; ring-set `idle` opacity `0.45` (`:45-59,105`) | `0.22` (`:32`) / `0.85` (`:187`) |
| `connecting` | `isConnecting` (`:661`) | `#8b5cf6` → `#a78bfa` | `rgba(139,92,246,0.20)` | `none` | `0.12 + 0.1·|sin(1.6t)|` (`:118`) | glow `0.35`, breathe-idle `0.45`; arcs opacity `0.75`; core `filter: saturate(0.75) brightness(0.98)` (`:60-63,115,135`) | `0.55` (`:33`) / `0.7` (`:183`) |
| `listening` | `isConnected`, not busy, not muted (`:665`) | `#10b981` → `#34d399` | `rgba(16,185,129,0.20)` | `ripple` (`:98-99`) | `0.4 + 0.32·|sin(8.5t)| + 0.18·|sin(4.1t + 1.5)|` (`:112`) | glow `0.85`, ring-scale `2.5`, breathe-idle `0.35`; ring-set `listen` opacity `1` (`:64-68,106`) | `0.72` (`:34`) / `1` (`:178-179`) |
| `thinking` | `isThinking` (`:662`) | `#f59e0b` → `#fbbf24` | `rgba(245,158,11,0.20)` | `pulse` (`:100-101`) | `0.24 + 0.2·|sin(2.4t)|` (`:116`) | glow `0.65`, breathe-idle `0.2`, breathe-think `1.7`; arcs opacity `1`; turbo spin un-paused; core-shell `breathe-think 3s` (`:69-73,116,124,126`) | `0.46` (`:35`) / `0.9` (`:181`) |
| `speaking` | `isTalking` (`:663`) | `#0ea5e9` → `#38bdf8` | `rgba(14,165,233,0.20)` | `flow` (`:102-103`) | `0.3 + 0.24·|sin(6.2t)| + 0.16·|sin(3t + 0.6)|` (`:114`) | glow `1`, ring-scale `2.85`, breathe-idle `0.55`; ring-set `speak` opacity `1` (`:74-78,107`) | `1.35` (`:36`) / `1` (`:178`) |
| `error` | any `error !== null` (`:660`) | `#fb7185` → `#f43f5e` (`ERROR_COLOR_FROM/TO`, `:47-48,75`) | `rgba(244,63,94,0.22)` | `none` | `0.2` constant (`:120`) | overrides `--ptw-from/to` to the error constants, glow `0.8`, breathe-idle `0.3`, `--ptw-blink: 1` (drives the blink keyframes) (`:79-85`) | `0.4` (`:37`) / `0.95` + the error gradient layer is shown instead of the state gradient (`:185,474-475`) |
| `disabled` | `isMuted` while connected and idle (`:664`) | `#94a3b8` → `#cbd5e1` | `rgba(148,163,184,0.14)` | `none` | `0` (default) | glow `0.15`, breathe-idle `0`, `filter: grayscale(0.85)`, `opacity: 0.45` (`:86-91`) | `0.02` (`:38`) / host `opacity: 0.5` + `grayscale(0.85)`, and the shader desaturates via `uDisabled` (`:138-140,164-166,456-457`) |

Palettes are consumed by both orbs (so the CSS fallback and the WebGL orb are the same colours) via `paletteFor(state)` (`orb-state.ts:79`; `PulseOrb.tsx:172-174`, `IridescentFlow.tsx:209-211`), and by the halo/glow layers in `VoiceOrbStage` (`VoiceOrbStage.tsx:52-58`) and `FloatingVoiceOrb` (`FloatingVoiceOrb.tsx:174-177`). Colour transitions in the WebGL orb are lerped 8 % per frame rather than snapped (`IridescentFlow.tsx:232-235`).

### Rendering techniques

- **WebGL detection** (`use-webgl-support.ts`): a module-level cached probe creating a throwaway `<canvas>` and requesting `webgl2` then `webgl` with `{ failIfMajorPerformanceCaveat: true }` (`:9-13`); exceptions cache `false` (`:14-16`). It is exposed via `useSyncExternalStore` whose `subscribe` is a **no-op** (`:20`) and whose `getServerSnapshot` returns `null` (`:22`), so the answer never changes in a session and SSR renders nothing.
- **Selection rule**: `const isWebGL = webgl && useShader` in both hosts (`FloatingVoiceOrb.tsx:120`, `VoiceOrbStage.tsx:34`). `useShader` is **component-local, non-persisted** state: `true` initially, toggled by **double-click** on the floating orb (`FloatingVoiceOrb.tsx:45,163`) and by **click** on the docked/hero orb stage, whose `title` reads `'Click to toggle Orb renderer style'` (`VoiceOrbStage.tsx:32,66-67`). The two toggles are independent.
- **`IridescentFlow`** (WebGL2-or-webgl `getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' })`, `:245-250`): a single oversized triangle `[-1,-1, 3,-1, -1,3]` (`:299`); canvas sized `size * min(devicePixelRatio, 2)` (`:291-295`); a ~110-line fragment shader with 3-octave fbm, a circular mask `1 - smoothstep(0.86, 0.92, r)` (`:109`), and per-state uniforms `uConnect/uListen/uThink/uSpeak/uError/uDisabled` fed from `createStateMix` weights (`:360-365`). The mix is an exponential cross-fade, default rate **6**, with a `0.001` snap-to-zero and renormalisation each frame (`orb-state.ts:148-160`).
- **Fallbacks inside `IridescentFlow`**: if `getContext` returns null, either shader fails to compile, or linking fails, it sets `lost` and renders CSS-gradient layers instead (`:251-288`); `webglcontextlost` calls `preventDefault()`, stops the loop and sets `lost` (`:414-419`). The fallback is two absolutely-positioned layers (state gradient + error gradient) cross-faded by `isError`, with a conic-gradient body, a white radial highlight, and a level-reactive `box-shadow` (`IridescentFlow.tsx:433-440,464-476`).
- **`PulseOrb`** is DOM+CSS only: a radial-gradient glow, three ring sets of three rings each (`RINGS` base `3.2` s, delays `0 / 0.8 / 1.6`, scales `2.3 / 2.55 / 2.8`, mixes `75 / 50 / 25`; `RING_SETS` idle `1 s normal`, listen `0.75 s reverse`, speak `0.55 s normal` — `PulseOrb.tsx:7-17`), a conic-gradient arc with a radial mask and a spinning dot (`:235-258`), and a shaded core (`:259-278`). All per-state values are registered `@property` custom properties so they can be transitioned (`:19-44`).
- **Reduced motion**: `useOrbLevel` checks `window.matchMedia('(prefers-reduced-motion: reduce)')` once per effect run and, on a match, pins all four CSS variables to `0` and returns **without starting the rAF loop** (`use-orb-level.ts:27-33`). `IridescentFlow` installs its own `matchMedia` listener: on match it stops the loop and draws one static frame with `clock` forced to `4.7` so the noise field is not degenerate, and it re-evaluates on `change` (`IridescentFlow.tsx:378-381,395-405`). `PulseOrb` has **no** reduced-motion handling of its own — its CSS keyframe animations (ring emit, arc spin, breathe, blink) keep running; only the level-driven scaling is frozen.
- **In-view detection for performance**: `observeActivity` (`use-in-view.ts:4-39`) combines an `IntersectionObserver` (last entry wins, default `true`) with a `visibilitychange` listener and calls `onChange` only on transitions. If `IntersectionObserver` is undefined it returns a no-op cleanup and leaves the state at `true`, i.e. animation never pauses. `useOrbLevel` halts/cancels its rAF on inactive and resets `last` (`:65-83`); `IridescentFlow` calls `stopLoop()`/`startLoop()` the same way (`:383-409`).

## Dragging and positioning

All maths is pure and unit-tested (`orbs/orb-position.ts`, `orbs/__tests__/orb-position.test.ts`).

- **Constants**: `ORB_SIZE = 64`, `SNAP_MARGIN = 16`, `DRAG_THRESHOLD = 5` (`orb-position.ts:11-14`).
- **Persistence key**: `POS_KEY = 'sw-data-explorer:voice-orb-position'`, value `JSON.stringify({x, y})` (`:18,49-51`). `loadPos` validates that both `x` and `y` are numbers and returns `null` on any throw (`:40-47`); `savePos` swallows write failures for private mode (`:50`). The position is global, not per chat or per connection, and never expires.
- **Clamping**: `clamp(v, lo, hi)` returns `lo` when `hi < lo`, so a viewport narrower than the orb cannot invert the range (`:20-21`; asserted at `__tests__/orb-position.test.ts:26-29`).
- **Edge snapping** (`snap`, `:24-34`): horizontally, if `x < SNAP_MARGIN + ORB_SIZE/2` (48) → `SNAP_MARGIN`; if `x > w - SNAP_MARGIN - ORB_SIZE/2` → `w - ORB_SIZE - SNAP_MARGIN`; otherwise the plain clamp. Vertically it only clamps to `[16, h - 80]`. **There is no vertical edge snapping** — the orb does not dock to top or bottom.
- **Default resting place**: `defaultPos` = `{ x: max(16, vw - 64 - 32), y: max(16, vh * 0.34) }` (`:54-55`) — right side, 34 % down.
- **Interaction** (`FloatingVoiceOrb.tsx`): `setPointerCapture` on press (`:81`); movement is only applied once `Math.hypot(dx, dy) >= 5` (`:90-91`, `orb-position.ts:37-38`); snap + persist happen **only on release** (`:96-105`); `onPointerCancel` reuses the release handler (`:146`); a click that follows a drag is swallowed by `movedRef` so dragging never re-parks the orb (`:127-131`).
- **Restore and re-clamp**: on mount, load then `snap(...)` against the current viewport, else `defaultPos` (`:60-66`); a `resize` listener re-snaps the live position (`:69-77`). The comment states the intent: a position saved on a wider monitor must not strand the orb off-screen.
- **Keyboard**: the orb is `role="button" tabIndex={0}`; `Enter`/`Space` expand (`:148-149`); arrow keys nudge by **12 px**, or **40 px** with Shift, then snap and save immediately (`:150-161`). `touchAction: 'none'` prevents scroll interception (`:171`).
- **Positioning container**: `fixed z-[9998]` with explicit `left/top/width/height` in pixels, portaled to `document.body` (`:133-137`, `:249`). Animate-in classes `fade-in zoom-in-95 duration-200` on first paint (`:135`).

## Controls

| Control | Where | Exact label / tooltip | Behaviour | Source |
| --- | --- | --- | --- | --- |
| Start / stop voice | Composer, waveform icon button | `'Start Resona Voice'` / `'End Resona Voice'` / `'Connecting to Resona Voice…'` (tooltip and `aria-label`) | `handleToggleVoice`: ends the session if active, else ensures a chat exists (`justCreatedChatRef` + `onChatCreated(voiceSessionId)`) and awaits `startSession()` | `VoicePanel.tsx:30-34,42`; `useChatVoiceIntegration.ts:71-81` |
| Show/hide composer while in a call | Control bar left | Button text `'+ Type'` / `'Hide Input'` (`Keyboard` icon) | Toggles `isTypeOpen`; when open, `AIChatMain` renders a `ChatInput` inside the overlay | `VoiceControlBar.tsx:100-102`; `AIChatMain.tsx:566,571-575,666,671-673` |
| Mute / unmute | Control bar right | Tooltip `'Unmute microphone'` / `'Mute microphone'`; icon `Mic`/`MicOff` | Disabled while connecting | `VoiceControlBar.tsx:127-143` |
| Mute / unmute | Floating orb (hover) | `aria-label` `'Unmute microphone'` / `'Mute microphone'` | `stopPropagation` on click and pointerdown so the drag handler does not fire | `FloatingVoiceOrb.tsx:213-221` |
| Mute / unmute | Floating orb body overlay | icon-only: `MicOff` on a `bg-black/35` disc when `isMuted` | — | `FloatingVoiceOrb.tsx:200-204` |
| Minimize | Control bar right | Tooltip `'Minimize voice'` (`Minimize2` icon) | `setPresence('minimized')`; disabled while connecting | `VoiceControlBar.tsx:145-158`; `AIChatMain.tsx:569,669` |
| End / cancel call | Control bar right | Tooltip `isConnecting ? "Cancel connection" : "End Resona Voice"`; spinner while connecting, else `X` | `endSession()`; **not** disabled while connecting | `VoiceControlBar.tsx:160-174` |
| End voice call | Floating orb (hover) | `aria-label` `'End voice call'` (`PhoneOff`, destructive) | `voice.endSession()` | `FloatingVoiceOrb.tsx:222-230` |
| Expand | Floating orb (always) | `aria-label` and `title` `'Expand voice chat'` (`Maximize2`) | `setPresence('expanded')` + `onExpand` → `setMode('ai')` | `FloatingVoiceOrb.tsx:122-125,234-246`; `DataExplorerPage.tsx:513` |
| Expand (orb body) | Floating orb | `aria-label` `"Connecting to Resona Voice..."` while connecting, else `"Voice chat minimised — click to expand, drag to move"`; `title` `"Connecting to Resona Voice..."` / `"Click to expand · Drag to move"` | Click → expand; `Enter`/`Space` → expand; arrows nudge; double-click → swap renderer | `FloatingVoiceOrb.tsx:141-142,147-163` |
| Toggle orb renderer | Orb stage | `title` `'Click to toggle Orb renderer style'` | Flips `useShaderOrb` (WebGL ⇄ PulseOrb) | `VoiceOrbStage.tsx:66-67` |
| Dictation | Composer | `'Dictate message'` / `'Stop recording'`, `aria-label` `'Start voice input'` | Web Speech toggle | `MicButton.tsx:25-31,38` |

**Microphone mode is toggle, not push-to-talk.** Mute is a latch: `toggleMute` flips `isMuted` and calls `recorder.setMuted(next)` (`useVoiceSession.ts:104-111`). There is no hold-to-talk gesture anywhere in the feature, and there is **no keyboard shortcut at all** for starting or stopping a voice session — the only keyboard handling in the feature is the floating orb's `Enter`/`Space`/arrow keys (`FloatingVoiceOrb.tsx:148-162`). (For contrast, the adjacent Resona AI panel button documents `Ctrl+J` at `DataExplorerPage.tsx:427`; no voice equivalent exists.)

Status copy in the control bar: `'Connecting...'` in amber while `isConnecting` (`VoiceControlBar.tsx:109-113`); the status dot/bar colours are `amber` (connecting), `rose` (muted), `amber` + `animate-ping` (thinking), `sky` (speaking), `emerald` (default) (`:45-74`).

## Chat sync — `useVoiceChatSync`

`useVoiceChatSync(voiceMessages, setLocalMessages, agentMode)` (`useVoiceChatSync.ts:8-69`) runs on every `voiceMessages` change and maps voice turns into the chat's `LocalMessage[]`:

- **Which messages sync**: a message is skipped while interim, *unless* it is an assistant message that already has tool steps (`isAssistantToolActive`, `:21-22`); a message with neither non-empty text nor tool steps is skipped (`:23`).
- **Upsert by id** (`:24`): if the id exists, it is patched only when one of seven fields differs — `content`, `creditsUsed`, `toolSteps`, `artifacts`, `sql`, `isStreaming`, or a newly-arrived `wasInterrupted` (`:27-35`). New entries are appended with `{ id, role, content, isAgent: role === 'assistant' ? agentMode : undefined, isStreaming, sql, toolSteps, artifacts, creditsUsed, wasInterrupted }` (`:49-60`). The setter returns the previous array untouched when nothing changed, avoiding a re-render (`:67`).
- **Interim display**: `getFinalDisplayMessages` in `useChatVoiceIntegration.ts:87-120` additionally finds the single active interim voice message (gated on `isVoiceActive`, `:88-90`), overwrites or appends it with `isStreaming: true`, and carries `sql`/`toolSteps`/`artifacts` through. It is applied when building the display list (`AIChatMain.tsx:442`).
- **Turn lifecycle in the session hook**: a pending user bubble and a pending assistant bubble are kept in refs, committed (`isInterim: false`) when the counterpart starts, on interruption, on `turn_complete`, or in `finalizeMessages` at teardown (`:85-102,181-188,195-199,215-222,258-262,297-304`). `turnCounterRef` increments on each assistant commit so each turn gets its own bubble (`:59,184,218,300,543`).
- **Artifacts/tool steps from voice**: `onToolResult` builds `AgentArtifact` objects of `type: 'table'` when the payload has `rows` or `columns`, de-duplicating by `art_${id}` or by SQL (`:464-495`); `onTurnFormatted` lets the server's authoritative `turn_formatted` frame overwrite the locally accumulated bubble, marks any still-`calling` step as `done`, and adopts `credits_charged` / `was_interrupted` (`:507-602`).
- **Can voice drive the agent?** Not the text agent. Tool execution happens server-side and is reported back as `tool_call` / `tool_result` frames; the client has **no** code path that injects typed text into the voice socket (`sendText` is uncalled), and no local SQL execution in the voice path. What voice *can* do is coexist with the text chat in the same transcript: voice turns are written into the same `localMessages` array, and the user can keep typing (`'+ Type'`) while the call is live.

## Connection scoping

- `DataExplorerPage` passes the active connection to the provider: `<VoiceSessionProvider connectionId={connectionId ?? undefined}>` (`DataExplorerPage.tsx:369`).
- The provider forwards it as the first argument of the hook, coercing a missing value to `''`: `useVoiceSession(connectionId || '', voiceSessionId, sessionUserName ?? undefined)` (`VoiceSessionProvider.tsx:70`).
- The hook's `startSession` closure passes it straight to `client.connect(connectionId, sessionId, {...}, userName)` (`useVoiceSession.ts:393-395,625`).
- The socket client turns it into the query parameter `connection_id`, **only if truthy** (`voice-socket-client.ts:48`). An empty connection id means the parameter is omitted entirely — the session then runs with no connection scope.
- **What it is used for**: nothing beyond that query parameter. No schema, table list, dashboard context, SQL or credential is read from the connection in any voice source file, and the client never executes SQL. Which tools the model may call, and against what, is decided entirely server-side.
- `sessionId` likewise becomes `session_id` (`voice-socket-client.ts:49`); its value is the provider's `voiceSessionId`, which starts as a fresh UUID (`VoiceSessionProvider.tsx:51-55,60`) and is **replaced by the bound chat id** once a chat is selected (`:66-68`).
- `userName` becomes `user_name` when truthy (`voice-socket-client.ts:50`); the chat view pushes it into the provider as soon as it mounts (`useChatVoiceIntegration.ts:54-56`), with the in-code note that the gateway greets by name and degrades to "Hey there" if it arrives late.

## Error and permission handling

| Path | Trigger | Handling | User-facing string | Source |
| --- | --- | --- | --- | --- |
| Microphone denied / `getUserMedia` rejects | `recorder.start()` throws inside `startSession` | `teardownMedia()`, `isConnecting = false`; routed to `scheduleReconnect` only if a reconnect was already in flight, else `showError(err.message)` | **No dedicated copy** — the raw browser `Error.message` (e.g. `Permission denied`) is shown; `error` drives `orbState = 'error'` | `useVoiceSession.ts:626-635`; `voice-audio-recorder.ts:22-29` |
| Worklet module fails to load | `addModule('/worklets/voice-recorder-worklet.js')` rejects | Same catch path as above | Raw `Error.message` | `voice-audio-recorder.ts:44`; `useVoiceSession.ts:626-635` |
| `AudioContext` unavailable | `new AudioCtx()` throws (both `AudioContext` and `webkitAudioContext` missing) | Same catch path | Raw `Error.message` | `voice-audio-recorder.ts:38-41` |
| Socket error event | `WebSocket.onerror` | `onError('Voice WebSocket connection error')` → `isConnecting = false`, `showError` | `'Voice WebSocket connection error'` | `voice-socket-client.ts:77-79`; `useVoiceSession.ts:607-609` |
| Malformed frame | `JSON.parse` throws in `onmessage` | `onError(err.message)` or a fixed fallback | `err.message` or `'Invalid frame received from server'` | `voice-socket-client.ts:66-75` |
| Server `error` frame | `{ type: 'error' }` | `onError(frame.message \|\| frame.code \|\| 'Voice error', frame.code)`; if `code` is fatal, sets `userEndedRef = true` to block reconnects | server-provided `message`, else `code`, else `'Voice error'` | `voice-socket-client.ts:157-159`; `useVoiceSession.ts:607-612`; fatal set at `:22-29` |
| Reconnect exhausted | > `MAX_RECONNECT_ATTEMPTS` (2) | `reconnectAttemptsRef = 0`, `showError`, `isConnecting = false` | sticky previous error, else `` `Voice connection lost (code ${closeCode}): ${closeReason}` `` | `useVoiceSession.ts:147-157` |
| Session duration cap | timer armed at `session_ready` for `3 605 000` ms | `showError` then `endSession()` | `'Voice session reached the 60-minute limit'` | `useVoiceSession.ts:21,400-403` |
| Server `session_ended` | `{ type: 'session_ended' }` | `endSession()` — **reason and message are discarded** | none | `useVoiceSession.ts:604-606`; `voice-socket-client.ts:154-156` |
| Normal close | code `1000` / `1001`, or `userEndedRef` | media torn down, messages finalized, no reconnect | none | `useVoiceSession.ts:614-624,622` |
| No-speech | dictation only | `errorMessage` set, status `'error'`, auto-clears to `'idle'` after **3000 ms** | `'No speech detected.'` | `useSpeechToText.ts:81-86` |
| Dictation permission denied | `event.error === 'not-allowed'` | Same as above; amber `MicOff` + tooltip bubble | `'Microphone access denied.'` | `useSpeechToText.ts:78-84`; `MicButton.tsx:43-44,66-70` |
| Other dictation error | any other `event.error` | Same as above | `` `Error: ${event.error}` `` | `useSpeechToText.ts:83` |
| Dictation unsupported | no `SpeechRecognition` / `webkitSpeechRecognition` | `status = 'unsupported'`; `MicButton` renders `null` — control vanishes silently | none | `useSpeechToText.ts:32-40`; `MicButton.tsx:17` |
| Live call in an unsupported browser | no `navigator.mediaDevices` | **No capability check exists** — the property access in `getUserMedia` throws and surfaces via the generic catch as a raw message | raw `Error.message` | `voice-audio-recorder.ts:22`; `useVoiceSession.ts:626-635` |
| WebGL unavailable | probe returns `false` | Host renders `PulseOrb` instead of `IridescentFlow`; if WebGL is present but context creation/linking fails or the context is lost, `IridescentFlow` degrades to its own CSS-gradient layers | none | `use-webgl-support.ts:9-16`; `FloatingVoiceOrb.tsx:120,179-193`; `VoiceOrbStage.tsx:34,69-83`; `IridescentFlow.tsx:216,251-288,414-419` |
| Base64 decode failure on playback | `atob` throws | Logged via `logger.error('[VoiceAudioPlayer] decodeBase64 error:', err)` and an empty `Uint8Array` returned, so the chunk is dropped by the `< 2 bytes` guard | none | `voice-audio-player.ts:134-147,76` |

Note that the session hook surfaces errors **only through the orb state and the `error` string**. No voice toast, banner or inline error component exists in this feature — `error` is returned by the hook but is not part of `VoiceSessionContextValue` (`VoiceSessionProvider.tsx:19-42`), so at present only the orb's `error` colour/`blink` treatment reflects it.

## Privacy

- **What is captured**: the default system microphone, mono, with `echoCancellation`, `noiseSuppression` and `autoGainControl` enabled and no `deviceId`/`sampleRate` constraint (`voice-audio-recorder.ts:22-29`). No camera, no screen capture, no other track is requested; the `MediaStream` created contains audio only.
- **What leaves the browser**: continuous raw microphone audio, decimated to 16 kHz 16-bit LE PCM and cut into 100 ms / 3200-byte frames, each base64-encoded and JSON-wrapped as `{ type: 'AUDIO_CHUNK', data, mime: 'audio/pcm;rate=16000' }` (`voice-socket-client.ts:7,87-99`; `public/worklets/voice-recorder-worklet.js:20,26,46,54`). Frames are sent to the **same origin** over `ws(s)://<window.location.host>/api/voice/session` (`voice-socket-client.ts:45-51`) with no subprotocol and no in-band credential. Base64 adds ~33 % overhead.
- **Also in the URL**: `connection_id`, `session_id` and `user_name` as query parameters (`voice-socket-client.ts:47-50`) — the display name therefore appears in the WebSocket request URL and in server-side request logs.
- **Mute is not a stop switch.** Muting disables the track and transmits **silence of the same length** so the server-side timeline stays continuous (`voice-audio-recorder.ts:62-86`). Audio capture and transmission continue at 10 Hz while muted.
- **Client-side persistence**: none for audio. The only `localStorage` write in the feature is the orb position under `'sw-data-explorer:voice-orb-position'` (`orb-position.ts:18,49-51`); the two recogniser buffers are transferred, not retained (`voice-recorder-worklet.js:54`). Nothing in `src/components/voice/**` uploads, downloads or caches a recording, and there is no IndexedDB / Cache Storage usage.
- **Server-side recording**: the prior analysis document claims the gateway buffers a WAV to Node persistence (`VOICE_SESSION_ANALYSIS_2026-09-26.md:24`, `:317`). That is backend behaviour and **cannot be verified or refuted from this repo's frontend**; the frontend has no code that would request, receive or delete such a recording. If a post-session WAV is retained server-side, that retention is outside the control of this section and outside the frontend's data-deletion surface.
- **Transcript**: voice transcripts are held in React state in the provider (which sits above the view switch) and mirrored into the chat's `localMessages` (`useVoiceChatSync.ts:16-68`), which follows the chat view's own persistence rules.

## Prior Analysis Disagreements

`VOICE_SESSION_ANALYSIS_2026-09-26.md` is a backend/session-log study. Where it describes the frontend, the source code wins.

1. **"Audio Payload 35.5 MB (WAV) — 16 kHz PCM bi-directional streaming, cleanly buffered to Node persistence"** (doc `:24`). The frontend never produces or uploads a WAV; it streams raw 16 kHz Int16 PCM frames base64-wrapped per 100 ms (`voice-socket-client.ts:7,87-99`, `voice-recorder-worklet.js:26,46,54`). Any WAV assembly/persistence is backend and unverifiable here. Additionally the stream is **not symmetric at 16 kHz**: input is 16 kHz, output is decoded and played as 24 kHz (`voice-audio-player.ts:17,84`).
2. **Model `models/gemini-3.8-live` and voice profile `Aoede`** (doc `:4-5`). No model or voice identifier exists anywhere in the frontend; `session_ready` carries `model`/`voice` and the handler discards both arguments (`voice-socket-client.ts:21,142-144`; `useVoiceSession.ts:397`). The strings `Aoede`, `gemini-3` and `models/gemini` do not occur in `src/`.
3. **"Node … passes `chat_id: chatId`, while a fresh UUID is generated for `session_id` (the individual voice call attempt)"** (doc `:313-314`). The frontend sends `connection_id`, `session_id` and `user_name` only (`voice-socket-client.ts:47-51`), and once a chat is bound the provider sets `session_id` **to the chat id** (`VoiceSessionProvider.tsx:66-68`). A fresh UUID (`newSessionId`, `:51-55`) is only the pre-binding default.
4. **"the agent smoothly emitted the `session_ended` protocol message"** (doc `:119`). The client's `session_ended` handler takes no arguments and calls `endSession()` unconditionally — no reason or message is inspected or displayed (`useVoiceSession.ts:604-606`).
5. **Reconnection amnesia, rated 2/10** (doc `:499`). The *conclusion* is consistent with the frontend — no client code replays prior turns, and `scheduleReconnect` re-runs a cold `startSession` (`useVoiceSession.ts:144-168,368-393`) — but the doc's stated mechanism (fresh `session_id` per attempt) does not hold for a chat-bound session (see disagreement 3).
6. **Tool names `run_query`, `web_search`, `end_voice_session`** (doc `:16-18`). The frontend is tool-agnostic: it renders `tool_call.function_calls[].name` as an opaque string and falls back to `'tool'` when absent (`useVoiceSession.ts:342-347`), and only special-cases `args.sql` (`:337-340`). No tool registry or allowlist exists in `src/components/voice/**`.
7. **"0 interruptions recorded (`interrupted=False` across all turns)"** (doc `:25`). Consistent with the client: `interrupted` clears playback and marks the pending assistant bubble `wasInterrupted` (`useVoiceSession.ts:176-190`), which the prior doc observed as false.

## Dead / Unused Code

| Item | Location | Evidence |
| --- | --- | --- |
| `VoiceSocketClient.sendText()` and the `{ type: 'TEXT' }` client message | `voice-socket-client.ts:108-112`; `types.ts:57` | No caller anywhere in `src/`. There is no way for the chat composer to send text into a live voice session. |
| `toolCallInfo` / `ToolCallInfo` | `useVoiceSession.ts:47,311,674`; `types.ts:60-63` | Written on every `tool_call` frame and returned from the hook, but **not** included in `VoiceSessionContextValue` (`VoiceSessionProvider.tsx:19-42`) and read by no component. The tool name/args never reach the UI. |
| `useVoiceSessionContext()` (the throwing accessor) | `VoiceSessionProvider.tsx:104-108` | No callers; only `useOptionalVoiceSessionContext()` is used (`FloatingVoiceOrb.tsx:43`, `VoiceSessionOverlay.tsx:48`, `useChatVoiceIntegration.ts:37`). |
| `stateMotion()` and the `OrbMotion` type | `orb-state.ts:94-107` | No callers. Nothing maps `OrbState → OrbMotion`. |
| `ORB_STATES` | `orb-state.ts:39-45` | No callers; also omits `error` and `disabled`, so it could not drive a state list even if used. |
| `useInView()` | `use-in-view.ts:41-66` | No callers; both orbs call `observeActivity` directly (`use-orb-level.ts:77`, `IridescentFlow.tsx:406`). |
| `useOrbLevel`'s `bands` / `OrbBandRefs` | `use-orb-level.ts:6-10,18,50-56` | Neither `PulseOrb` (`PulseOrb.tsx:176`) nor `IridescentFlow` (`IridescentFlow.tsx:238`) passes `bands`, so `--orb-bass/-mid/-treble` are always the synthetic `0.78 + 0.22·sin(…)` curves. No real frequency-band analysis exists. |
| `VoiceAudioPlayer.getAudioLevel()` | `voice-audio-player.ts:55-66` | Never called. The player's analyser is wired and allocated but its output is discarded; only microphone level drives the orb. |
| `VoiceWaveformIcon` `variant="bars-5"` | `VoiceWaveformIcon.tsx:26-98` | No caller passes `variant` (`VoicePanel.tsx:54-59`, `AIChatSidebar.tsx:446,607` all use the default `bars-4`). The 5-bar Claude-style icon is unreachable. |
| `VoicePanel`'s `connectionId` prop | `VoicePanel.tsx:15`; passed at `ChatInput.tsx:461,662` | Declared in `VoicePanelProps` but never destructured in the component signature (`VoicePanel.tsx:23-29`) — the button cannot and does not read the connection. |
| camelCase event fallbacks `wasInterrupted` / `turnComplete` | `useVoiceSession.ts:176,292` | `GeminiEvent.server_content` declares only `interrupted` and `turn_complete` (`types.ts:27-28`); the `(content as any)` reads are defensive guesses at an undeclared wire shape. |
| `onSessionReady(model, voice)` arguments | `voice-socket-client.ts:21,142-144` | The handler in `useVoiceSession.ts:397` is declared with no parameters, so the negotiated model and voice are dropped. |
| `onSessionEnded(reason, message)` arguments | `voice-socket-client.ts:25,154-156` | The handler at `useVoiceSession.ts:604-606` ignores both, so a server-supplied hangup reason never reaches the user. |
| `error` string is returned but not surfaced | `useVoiceSession.ts:680`; `VoiceSessionProvider.tsx:19-42` | `error` is in `UseVoiceSessionReturn` but absent from the context value, so no component can render the message; only `orbState === 'error'` is observable. |
| `PulseOrb` under `prefers-reduced-motion` | `PulseOrb.tsx` (whole file) | No `matchMedia` usage; its CSS animations ignore the preference that `useOrbLevel` and `IridescentFlow` honour. |

## Implementation Notes / Inconsistencies

- `defaultPos` uses the literal `32` for the right-hand inset while every other bound uses `SNAP_MARGIN = 16`, so a default drop is 32 px from the right edge but a snapped drop is 16 px (`orb-position.ts:55` vs `:12,29-31`).
- The player's header comment claims a jitter buffer that "grows only after an underrun" (`voice-audio-player.ts:5-6`); the implementation uses a constant `JITTER_LEAD_SECONDS = 0.03` (`:18,96`).
- The recorder is started **before** the socket exists, and the chunk callback dereferences `socketClientRef.current?.` (`useVoiceSession.ts:377-382`), so the first few hundred milliseconds of microphone audio are dropped rather than queued. `MAX_PREOPEN_QUEUE` only covers the much shorter `connect()` → `onopen` window.
- `startSession` clears the sticky error at its top (`showError(null)`, `:372`), which resets `errorRef.current`; consequently the `errorRef.current ?? …` branch in `scheduleReconnect` (`:150`) will normally be `null` on a genuine connection-loss retry sequence, yielding the generic `Voice connection lost …` message.
- Two independent, non-persisted renderer toggles exist (floating orb double-click, orb-stage click) — `useShader` and `useShaderOrb` (`FloatingVoiceOrb.tsx:45`, `VoiceOrbStage.tsx:32`).
- `snap()` handles only horizontal edges; the orb never docks vertically (`orb-position.ts:32`).
- `WebGL` support is cached for the lifetime of the module and `subscribe` is a no-op, so a context created after a GPU-process crash is never re-probed; `IridescentFlow` compensates only for its own canvas via the `webglcontextlost` handler (`use-webgl-support.ts:3,20`; `IridescentFlow.tsx:414-419`).

## Open Questions

- UNVERIFIED: What the `/api/voice/session` server does with `connection_id`, `session_id` and `user_name` — whether it authenticates the WebSocket upgrade, what tools it exposes, and whether it records/transcribes/persists the audio it receives. The endpoint is referenced only at `voice-socket-client.ts:51`; the handler is not in this repo.
- UNVERIFIED: Whether the server sends a WAV recording, transcript or any other artefact back to the client after a session, and whether that recording is retained server-side. No such frame exists in `ServerFrame` (`types.ts:39-53`).
- UNVERIFIED: The exact server-side `error.code` vocabulary. Only the five fatal codes in `FATAL_ERROR_CODES` (`useVoiceSession.ts:22-29`) and `session_duration_exceeded` are known; the rest of `code` is passed through opaquely.
- UNVERIFIED: Whether the negotiated `model` and `voice` from `session_ready` are intended to be surfaced — the frontend currently discards them.
- UNVERIFIED: Whether the gateway accepts `{ type: 'TEXT' }` frames (e.g. for typing into a live call). The client can send them but nothing does.
- UNVERIFIED: Why `sessionChatId` is reused as `session_id` (`VoiceSessionProvider.tsx:66-68`) — whether this is deliberate session-identity reuse for continuity or a leftover.
- UNVERIFIED: Whether there is any server-side barge-in signal beyond `server_content.interrupted`, and whether turn boundaries depend on server-side VAD. The client has no voice-activity detection of its own.
- UNVERIFIED: Whether audio is ever persisted client-side by other code outside `src/components/voice/**` (e.g. a service worker or an upload helper). Nothing in the voice feature does.