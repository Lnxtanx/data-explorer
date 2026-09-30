// Pure position maths for the floating voice orb: drag threshold, edge
// snapping, and persistence. Guards the "free drag but never off-screen"
// contract without needing a React test harness.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    ORB_SIZE,
    SNAP_MARGIN,
    DRAG_THRESHOLD,
    POS_KEY,
    clamp,
    snap,
    isDrag,
    loadPos,
    savePos,
    defaultPos,
} from '../orb-position';

const W = 1200, H = 800;

describe('clamp', () => {
    it('bounds a value', () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(50, 0, 10)).toBe(10);
    });
    it('never inverts when the viewport is smaller than the orb', () => {
        // A 40px-wide window must not produce hi < lo and flip the position.
        expect(clamp(10, SNAP_MARGIN, 40 - ORB_SIZE - SNAP_MARGIN)).toBe(SNAP_MARGIN);
    });
});

describe('isDrag', () => {
    it('treats a jittery press as a click', () => {
        expect(isDrag(100, 100, 101, 101)).toBe(false);
        expect(isDrag(100, 100, 100 + DRAG_THRESHOLD - 1, 100)).toBe(false);
    });
    it('treats real movement as a drag', () => {
        expect(isDrag(100, 100, 140, 100)).toBe(true);
        expect(isDrag(100, 100, 100, 160)).toBe(true);
    });
});

describe('snap', () => {
    it('snaps to the left edge when dropped near it', () => {
        expect(snap({ x: 2, y: 300 }, W, H).x).toBe(SNAP_MARGIN);
    });
    it('snaps to the right edge when dropped near it', () => {
        expect(snap({ x: W - 10, y: 300 }, W, H).x).toBe(W - ORB_SIZE - SNAP_MARGIN);
    });
    it('leaves a mid-screen position alone', () => {
        expect(snap({ x: 500, y: 400 }, W, H)).toEqual({ x: 500, y: 400 });
    });
    it('pulls back on-screen when the window shrank under a saved position', () => {
        // Saved on a 2560px monitor, restored on a 1200px one.
        const p = snap({ x: 2400, y: 900 }, W, H);
        expect(p.x).toBeLessThanOrEqual(W - ORB_SIZE - SNAP_MARGIN);
        expect(p.y).toBeLessThanOrEqual(H - ORB_SIZE - SNAP_MARGIN);
    });
    it('never returns a negative or off-screen y', () => {
        expect(snap({ x: 500, y: -80 }, W, H).y).toBe(SNAP_MARGIN);
        expect(snap({ x: 500, y: 99999 }, W, H).y).toBe(H - ORB_SIZE - SNAP_MARGIN);
    });
});

describe('persistence', () => {
    beforeEach(() => { localStorage.clear(); });
    afterEach(() => { localStorage.clear(); });

    it('round-trips a position', () => {
        savePos({ x: 321, y: 654 });
        expect(loadPos()).toEqual({ x: 321, y: 654 });
        expect(JSON.parse(localStorage.getItem(POS_KEY)!)).toEqual({ x: 321, y: 654 });
    });
    it('returns null when unset or corrupt', () => {
        expect(loadPos()).toBeNull();
        localStorage.setItem(POS_KEY, 'not json');
        expect(loadPos()).toBeNull();
        localStorage.setItem(POS_KEY, '{"x":"a","y":1}');
        expect(loadPos()).toBeNull();
    });
    it('survives a storage write failure (private mode)', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        expect(() => savePos({ x: 1, y: 1 })).not.toThrow();
        spy.mockRestore();
    });
});

describe('defaultPos', () => {
    it('rests on the right, above centre, fully on screen', () => {
        const p = defaultPos(W, H);
        expect(p.x + ORB_SIZE).toBeLessThanOrEqual(W);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(H / 2);
    });
    it('stays valid on a tiny viewport', () => {
        const p = defaultPos(320, 480);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
    });
});
