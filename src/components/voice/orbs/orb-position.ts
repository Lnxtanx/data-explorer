// =============================================================================
// Floating orb position maths — pure, no React.
//
// Extracted from FloatingVoiceOrb so the drag/snap/persist rules are unit
// testable; the repo has no React component-test harness.
//
// Why snapping at all: free-floating is what the user asked for, but a dropped
// position that lands half off-screen or behind a panel is unusable, and a
// position saved on a wide monitor strands the orb on a laptop. So the drag is
// free, and the RELEASE is corrected.
export const ORB_SIZE = 64;
export const SNAP_MARGIN = 16;
/** Pointer movement (px) before a press is treated as a drag, not a click. */
export const DRAG_THRESHOLD = 5;

export interface Pos { x: number; y: number }

export const POS_KEY = 'sw-data-explorer:voice-orb-position';

export const clamp = (v: number, lo: number, hi: number): number =>
  hi < lo ? lo : Math.min(hi, Math.max(lo, v));

/** Snap to the nearest horizontal edge, and keep the orb fully on screen. */
export function snap(p: Pos, vw: number, vh: number): Pos {
  const w = vw ?? 0;
  const h = vh ?? 0;
  const x = p.x < SNAP_MARGIN + ORB_SIZE / 2
    ? SNAP_MARGIN
    : p.x > w - SNAP_MARGIN - ORB_SIZE / 2
      ? w - ORB_SIZE - SNAP_MARGIN
      : clamp(p.x, SNAP_MARGIN, w - ORB_SIZE - SNAP_MARGIN);
  const y = clamp(p.y, SNAP_MARGIN, h - ORB_SIZE - SNAP_MARGIN);
  return { x, y };
}

/** True once a press has moved far enough to be a drag, not a click. */
export const isDrag = (fromX: number, fromY: number, toX: number, toY: number): boolean =>
  Math.hypot(toX - fromX, toY - fromY) >= DRAG_THRESHOLD;

export function loadPos(storageKey = POS_KEY): Pos | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? p : null;
  } catch { return null; }
}

export function savePos(p: Pos, storageKey = POS_KEY): void {
  try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch { /* private mode */ }
}

/** Default resting spot: right side, a little above centre. */
export function defaultPos(vw: number, vh: number): Pos {
  return { x: Math.max(SNAP_MARGIN, vw - ORB_SIZE - 32), y: Math.max(SNAP_MARGIN, vh * 0.34) };
}
