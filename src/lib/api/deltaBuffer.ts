/**
 * deltaBuffer.ts — coalesces streamed `delta` frames.
 *
 * The backend emits one `delta` frame per model chunk (often 10-30/s). Applying
 * each one directly to React state meant one render per chunk, and the streaming
 * bubble re-parses the WHOLE accumulated answer on every render (MarkdownText
 * splits and walks all of `text`) — quadratic in answer length, and enough to
 * saturate the main thread on a long answer.
 *
 * This buffers chunks and flushes at most once per `intervalMs`, so a
 * 150-chunk answer costs ~12 renders instead of 150. Text is preserved exactly:
 * no loss, no duplication, no reordering. Callers MUST `flush()` synchronously
 * before handling a terminal event so the final text is never left buffered.
 *
 * Framework-agnostic on purpose: the timing policy is the part worth testing, and
 * keeping it out of the hook means it needs no React test harness.
 */
export class DeltaBuffer {
    private pending = '';
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly onFlush: (text: string) => void,
        private readonly intervalMs: number = 60,
    ) {}

    /** Append a chunk. Schedules a flush if none is pending. */
    push(text: string | undefined | null): void {
        if (!text) return;
        this.pending += text;
        if (this.timer !== null) return;          // a flush is already scheduled
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flush();
        }, this.intervalMs);
    }

    /**
     * Emit everything buffered right now and cancel any scheduled flush.
     * Call before any terminal event, and on teardown.
     */
    flush(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (!this.pending) return;
        const text = this.pending;
        this.pending = '';
        this.onFlush(text);
    }

    /** True when text is buffered but not yet emitted. */
    get hasPending(): boolean {
        return this.pending.length > 0;
    }

    /** Drop buffered text and cancel the timer without emitting. */
    dispose(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.pending = '';
    }
}
