/**
 * Tests for SSE chunk reassembly.
 *
 * These mirror backend-ai `src/streaming/emitter.py` exactly: payloads over
 * 64 KB are emitted as N frames of the same event name, each carrying
 * { chunk_index, total_chunks, chunk }, sliced on BYTE boundaries.
 */
import { describe, it, expect } from 'vitest';
import { SseChunkAssembler, isChunkEnvelope } from '../sseChunks';

/** Byte-for-byte reimplementation of the backend's sse() splitting logic. */
function backendSplit(event: string, data: unknown, maxBytes = 65_536, sliceSize = 63_000) {
    const payload = JSON.stringify(data);
    const bytes = new TextEncoder().encode(payload);
    if (bytes.length <= maxBytes) return [{ event, data }];
    const total = Math.ceil(bytes.length / sliceSize);
    const out: { event: string; data: unknown }[] = [];
    for (let i = 0; i < total; i++) {
        const slice = bytes.slice(i * sliceSize, (i + 1) * sliceSize);
        out.push({
            event,
            data: {
                chunk_index: i,
                total_chunks: total,
                // mirrors Python's .decode("utf-8", errors="replace")
                chunk: new TextDecoder('utf-8', { fatal: false }).decode(slice),
            },
        });
    }
    return out;
}

/** Drive the assembler over backend frames, collecting completed events. */
function run(event: string, data: unknown) {
    const a = new SseChunkAssembler();
    const events: { event: string; data: unknown }[] = [];
    for (const f of backendSplit(event, data)) {
        const assembled = a.push(f.event, f.data);
        if (assembled !== undefined) events.push({ event: f.event, data: assembled });
    }
    return events;
}

describe('isChunkEnvelope', () => {
    it('identifies a chunk wrapper', () => {
        expect(isChunkEnvelope({ chunk_index: 0, total_chunks: 2, chunk: 'a' })).toBe(true);
    });

    it('rejects a real payload that happens to have one of those keys', () => {
        expect(isChunkEnvelope({ run_id: 'r1', html: '<div/>' })).toBe(false);
        expect(isChunkEnvelope({ chunk: 'x' })).toBe(false);
        expect(isChunkEnvelope(null)).toBe(false);
        expect(isChunkEnvelope('done')).toBe(false);
    });
});

describe('SseChunkAssembler', () => {
    it('passes a small payload straight through', () => {
        expect(run('done', { run_id: 'r1', dashboard_id: 'd1' })).toEqual([
            { event: 'done', data: { run_id: 'r1', dashboard_id: 'd1' } },
        ]);
    });

    it('reassembles a large dashboard done frame (the real bug)', () => {
        // This payload is ~130 KB, i.e. always chunked in production.
        const filler = 'x'.repeat(90_000);
        const html = `<div>${filler}</div>`;
        const payload = {
            run_id: 'run-1',
            session_id: 'sess-1',
            dashboard_id: 'dash-1',
            title: 'Sales',
            html,
            panelData: { revenue: { rows: Array.from({ length: 200 }, () => ({ v: 'y'.repeat(200) })) } },
            panels: Array.from({ length: 8 }, (_, i) => ({ key: `p${i}` })),
        };
        expect(backendSplit('done', payload).length).toBeGreaterThan(1);

        const events = run('done', payload);
        expect(events).toHaveLength(1);
        // The whole point: the payload survives intact, not as a chunk wrapper.
        expect(events[0].data).toEqual(payload);
        expect((events[0].data as any).html).toBe(html);
    });

    it('reassembles a wide artifact_rows batch', () => {
        const rows = Array.from({ length: 40 }, (_, i) => ({
            id: i,
            note: 'z'.repeat(4_000),
        }));
        const events = run('artifact_rows', { artifactId: 'a1', rows, done: true });
        expect(events).toHaveLength(1);
        expect((events[0].data as any).rows).toHaveLength(40);
    });

    it('emits nothing until every chunk has arrived', () => {
        const frames = backendSplit('done', { v: 'q'.repeat(200_000) });
        expect(frames.length).toBeGreaterThan(2);
        const a = new SseChunkAssembler();
        for (let i = 0; i < frames.length - 1; i++) {
            expect(a.push(frames[i].event, frames[i].data)).toBeUndefined();
        }
        const last = a.push(frames[frames.length - 1].event, frames[frames.length - 1].data);
        expect((last as any).v).toHaveLength(200_000);
    });

    it('keeps interleaved event names separate', () => {
        const a = new SseChunkAssembler();
        const done = backendSplit('done', { html: 'h'.repeat(150_000) });
        const art = backendSplit('artifact', { rows: [{ a: 1 }] });
        expect(done.length).toBeGreaterThan(1);

        // interleave one frame of each
        expect(a.push(done[0].event, done[0].data)).toBeUndefined();
        const artDone = a.push(art[0].event, art[0].data);
        expect(artDone).toEqual({ rows: [{ a: 1 }] });
        for (let i = 1; i < done.length; i++) a.push(done[i].event, done[i].data);
    });

    it('recovers when a reconnect restarts a chunked message at index 0', () => {
        const a = new SseChunkAssembler();
        const html = `<div>${'w'.repeat(150_000)}</div>`;
        const frames = backendSplit('done', { html });
        // partial first attempt
        a.push(frames[0].event, frames[0].data);
        // replay from since=0 restarts
        let out: unknown;
        for (const f of frames) {
            const r = a.push(f.event, f.data);
            if (r !== undefined) out = r;
        }
        expect((out as any).html).toBe(html);
    });

    it('drops an out-of-range chunk index without completing', () => {
        const a = new SseChunkAssembler();
        expect(a.push('done', { chunk_index: 5, total_chunks: 2, chunk: '{}' })).toBeUndefined();
    });

    it('dropped state is discarded on reset()', () => {
        const a = new SseChunkAssembler();
        const frames = backendSplit('done', { v: 'p'.repeat(200_000) });
        a.push(frames[0].event, frames[0].data);
        a.reset();
        // after reset the sequence must restart cleanly
        let out: unknown;
        for (const f of frames) {
            const r = a.push(f.event, f.data);
            if (r !== undefined) out = r;
        }
        expect((out as any).v).toHaveLength(200_000);
    });
});
