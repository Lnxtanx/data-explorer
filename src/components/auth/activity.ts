// =============================================================================
// User Activity Tracker (self-hosted, zero third-party SDK)
//
// Sends a "heartbeat" every 45s while the tab is visible AND the user is
// signed in, so the backend can compute per-user engaged time ("10 min today",
// "1 hour last week", …). Also sends sparse events like login/logout/export.
//
// Design notes:
//  • Uses fetch with keepalive (survives tab close) + credentials:'include'
//    because the explorer and the API run on different subdomains.
//  • Never blocks the app: all failures are swallowed.
//  • One stable device id per browser (localStorage) so multi-tab heartbeats
//    can be de-duplicated / counted per device.
// =============================================================================

import { API_BASE_URL, apiRequestFetch } from '@/lib/api/client';

const HEARTBEAT_INTERVAL_MS = 45_000;
const DEVICE_KEY            = 'sw_device_id';
const MIN_BEAT_GAP_MS       = 10_000; // don't spam beats on rapid visibility toggles

type ActivityKind = 'login' | 'logout' | 'pageview' | 'export' | 'connection_open';

// ─── device id ────────────────────────────────────────────────────────────────
function getDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_KEY);
  } catch { /* storage unavailable — fall through */ }

  if (!id) {
    try {
      id = crypto.randomUUID();
    } catch {
      id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch { /* storage unavailable */ }
  }
  return id;
}

// ─── transport ────────────────────────────────────────────────────────────────
function postActivity(path: string, body: Record<string, unknown>): void {
  try {
    // Routed through apiRequestFetch (non-throwing) so telemetry remains
    // fire-and-forget, never logs errors to console, and never dispatches 401 events.
    const res = apiRequestFetch(path, {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify(body),
    });
    if (res && typeof res.catch === 'function') res.catch(() => {});
  } catch {
    try {
      navigator.sendBeacon(
        `${API_BASE_URL}${path}`,
        new Blob([JSON.stringify(body)], { type: 'application/json' }),
      );
    } catch { /* ignore */ }
  }
}

// ─── sparse events ────────────────────────────────────────────────────────────
export function trackEvent(kind: ActivityKind, meta?: Record<string, unknown>): void {
  postActivity('/api/activity/event', {
    kind,
    device_id: getDeviceId(),
    meta: meta || {},
  });
}

// ─── heartbeat ────────────────────────────────────────────────────────────────
let lastBeatAt = 0;

function sendHeartbeat(): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastBeatAt < MIN_BEAT_GAP_MS) return;
  lastBeatAt = now;

  postActivity('/api/activity/heartbeat', {
    device_id: getDeviceId(),
  });
}

let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

const onVisibility = () => {
  if (document.visibilityState === 'visible') sendHeartbeat();
};
const onPageHidden = () => sendHeartbeat();

export function startActivityTracking(): void {
  if (started) return;
  started = true;

  sendHeartbeat(); // immediate beat so "right now" is captured
  timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHidden);
}

export function stopActivityTracking(): void {
  started = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHidden);
}