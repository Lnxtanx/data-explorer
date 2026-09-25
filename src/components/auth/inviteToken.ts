// Persists an invitation token across the OAuth redirect round-trip.
// The "Sign in to Accept" flow does a full-page redirect to Google/GitHub and
// comes back to a bare origin - without this, the token in the URL is lost.

const KEY = 'sw.pendingInvite';

export interface StoredInvite {
    t: string;
    k: 'team' | 'project';
}

export function storePendingInvite(token: string, kind: 'team' | 'project'): void {
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ t: token, k: kind }));
    } catch {
        // Storage unavailable (private mode etc.) - invite still works if the
        // user completes login without navigating away.
    }
}

export function getPendingInvite(): StoredInvite | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.t === 'string' && typeof parsed.k === 'string') {
            return parsed as StoredInvite;
        }
        return null;
    } catch {
        return null;
    }
}

export function clearPendingInvite(): void {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        // ignore
    }
}
