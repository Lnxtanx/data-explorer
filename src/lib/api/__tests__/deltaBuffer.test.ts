/**
 * DeltaBuffer tests — the streaming coalescing policy.
 *
 * These pin the contract the agent hook depends on: text is never lost, never
 * duplicated, never reordered, and a terminal flush is synchronous.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeltaBuffer } from '../deltaBuffer';

function chunk(text: string, size: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
    return out;
}

describe('DeltaBuffer', () => {
    let emitted: string[];
    let buf: DeltaBuffer;

    beforeEach(() => {
        vi.useFakeTimers();
        emitted = [];
        buf = new DeltaBuffer(t => emitted.push(t), 60);
    });

    afterEach(() => vi.useRealTimers());

    it('does not emit until the flush window closes', () => {
        buf.push('Hello');
        buf.push(' world');
        expect(emitted).toEqual([]);
        expect(buf.hasPending).toBe(true);
        vi.advanceTimersByTime(60);
        expect(emitted).toEqual(['Hello world']);
        expect(buf.hasPending).toBe(false);
    });

    it('coalesces many chunks into ONE emission', () => {
        const answer = 'The quick brown fox jumps over the lazy dog. '.repeat(10);
        const chunks = chunk(answer, 5);
        expect(chunks.length).toBeGreaterThan(50);

        for (const c of chunks) buf.push(c);
        vi.advanceTimersByTime(60);

        // 51 chunks -> a single render, and the text is byte-exact.
        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toBe(answer);
    });

    it('flush() emits synchronously and cancels the pending timer', () => {
        buf.push('a');
        buf.push('b');
        buf.flush();
        expect(emitted).toEqual(['ab']);
        // the scheduled timer must not double-emit
        vi.advanceTimersByTime(600);
        expect(emitted).toEqual(['ab']);
    });

    it('supports multiple flush windows across a long answer', () => {
        const answer = 'abcdefghij'.repeat(20);
        for (const c of chunk(answer, 4)) {
            buf.push(c);
            vi.advanceTimersByTime(60);
        }
        buf.flush();
        expect(emitted.join('')).toBe(answer);
    });

    it('preserves exact text: no loss, duplication or reordering', () => {
        const answer = 'row 1, row 2, row 3 — total 42 (Δ 7%)';
        for (const c of chunk(answer, 3)) buf.push(c);
        buf.flush();
        expect(emitted.join('')).toBe(answer);
    });

    it('handles unicode / multi-byte chunks intact', () => {
        const answer = 'héllo wörld 🌍 — 日本語テキスト';
        for (const c of chunk(answer, 2)) buf.push(c);
        buf.flush();
        expect(emitted.join('')).toBe(answer);
    });

    it('ignores empty / missing chunks', () => {
        buf.push('');
        buf.push(undefined as unknown as string);
        buf.push(null as unknown as string);
        vi.advanceTimersByTime(60);
        expect(emitted).toEqual([]);
        expect(buf.hasPending).toBe(false);
    });

    it('flush() on an empty buffer is a no-op', () => {
        buf.flush();
        expect(emitted).toEqual([]);
    });

    it('dispose() drops buffered text and cancels the timer', () => {
        buf.push('lost');
        buf.dispose();
        vi.advanceTimersByTime(600);
        expect(emitted).toEqual([]);
        expect(buf.hasPending).toBe(false);
    });

    it('counts renders, not chunks', () => {
        const chunks = chunk('x'.repeat(3000), 10);
        let renders = 0;
        const b = new DeltaBuffer(() => { renders += 1; }, 60);
        for (const c of chunks) {
            b.push(c);
            vi.advanceTimersByTime(60);
        }
        // 300 chunks arriving one per window => 300 renders. The point of the
        // buffer is the OTHER case: many chunks inside one window.
        expect(renders).toBe(chunks.length);

        renders = 0;
        const b2 = new DeltaBuffer(() => { renders += 1; }, 60);
        for (const c of chunks) b2.push(c);
        vi.advanceTimersByTime(60);
        b2.flush();
        expect(renders).toBe(1);
    });
});
