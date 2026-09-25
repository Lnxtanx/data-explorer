// =============================================================================
// Google Sheets Export Service (Drive File API - Non-Sensitive Scope)
// Uses https://www.googleapis.com/auth/drive.file which does NOT require
// demo video submission or sensitive scope verification by Google.
// Automatically converts CSV into a native Google Sheet in the user's Drive.
//
// DELIBERATE raw fetch — this targets googleapis.com, not our own API origin, so
// it must not go through lib/api/client: there is no session cookie, no CSRF
// token and no `auth:unauthorized` semantics on that host. Phase 3 audited all
// 12 hand-rolled fetch call sites in the app and converted 10; this is one of
// the two that correctly bypass the shared client.
//
// This module also owns a localStorage OAuth-token cache and an export-history
// store, so it is not really an "api" module at all. Phase 4 moves it under
// features/export/.
// =============================================================================

const DRIVE_TOKEN_PREFIX = 'sw_google_drive_token_v3';

function getStorageKey(userEmail?: string | null): string {
  if (userEmail && userEmail.trim()) {
    return `${DRIVE_TOKEN_PREFIX}_${userEmail.trim().toLowerCase()}`;
  }
  return DRIVE_TOKEN_PREFIX;
}

interface StoredDriveToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

/**
 * Retrieve cached Google Drive/Sheets access token from localStorage if still valid.
 * Persists across all tabs, page reloads, and browser sessions.
 */
export function getStoredDriveToken(userEmail?: string | null): string | null {
  try {
    const key = getStorageKey(userEmail);
    let raw = localStorage.getItem(key);
    if (!raw && key !== DRIVE_TOKEN_PREFIX) {
      raw = localStorage.getItem(DRIVE_TOKEN_PREFIX);
    }
    if (!raw) return null;
    const parsed: StoredDriveToken = JSON.parse(raw);
    // Buffer by 60 seconds before expiration
    if (parsed.expiresAt && Date.now() < parsed.expiresAt - 60000) {
      return parsed.accessToken;
    }
    // Expired
    localStorage.removeItem(key);
    localStorage.removeItem(DRIVE_TOKEN_PREFIX);
    return null;
  } catch {
    return null;
  }
}

/**
 * Cache access token for the remainder of its lifetime across all tabs and browser restarts.
 */
export function setStoredDriveToken(
  accessToken: string,
  expiresInSeconds: number = 3600,
  userEmail?: string | null
): void {
  try {
    const data: StoredDriveToken = {
      accessToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
    const key = getStorageKey(userEmail);
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(DRIVE_TOKEN_PREFIX, JSON.stringify(data));
  } catch {
    // Storage might be restricted in some iframe or private modes
  }
}

/**
 * Remove stored token on logout or authorization error.
 */
export function clearStoredDriveToken(userEmail?: string | null): void {
  try {
    localStorage.removeItem(getStorageKey(userEmail));
    localStorage.removeItem(DRIVE_TOKEN_PREFIX);
    sessionStorage.removeItem('sw_google_drive_token_v2');
    sessionStorage.removeItem('sw_google_drive_token_v1');
  } catch {
    // noop
  }
}

export interface GoogleSheetsUploadResult {
  spreadsheetId: string;
  url: string;
  title: string;
}

/**
 * Upload a CSV Blob to Google Drive REST API v3 using multipart/related upload.
 * Setting mimeType to 'application/vnd.google-apps.spreadsheet' tells Google Drive
 * to automatically convert the uploaded CSV into a native Google Spreadsheet.
 *
 * This uses the non-sensitive scope `https://www.googleapis.com/auth/drive.file`
 * which requires NO demo video or sensitive OAuth verification.
 */
export async function uploadCsvToGoogleSheets({
  accessToken,
  title,
  csvBlob,
}: {
  accessToken: string;
  title: string;
  csvBlob: Blob;
}): Promise<GoogleSheetsUploadResult> {
  const metadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.spreadsheet',
  };

  const boundary = '-------sw_sheets_upload_' + Math.random().toString(36).substring(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const csvText = await csvBlob.text();

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/csv; charset=UTF-8\r\n\r\n' +
    csvText +
    closeDelimiter;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredDriveToken();
      throw new Error('Google authorization expired. Please try exporting again.');
    }
    const errBody = await response.json().catch(() => null);
    const errMessage = errBody?.error?.message || `Google Sheets upload failed (${response.status})`;
    throw new Error(errMessage);
  }

  const result = await response.json();
  const spreadsheetId = result.id as string;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return {
    spreadsheetId,
    url,
    title,
  };
}

// =============================================================================
// Recent Google Sheet Exports History (Local Storage)
// =============================================================================

export interface RecentSheetExport {
  id: string;
  title: string;
  url: string;
  tableName: string;
  schemaName: string;
  rowCount?: number;
  timestamp: number;
}

const RECENT_SHEETS_STORAGE_KEY = 'sw_recent_google_sheets_v1';

/**
 * Retrieve list of recent Google Sheets exports from localStorage.
 */
export function getRecentGoogleSheets(): RecentSheetExport[] {
  try {
    const raw = localStorage.getItem(RECENT_SHEETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save an exported sheet to localStorage (keeps the last 10 exports).
 */
export function saveRecentGoogleSheet(item: RecentSheetExport): RecentSheetExport[] {
  try {
    const existing = getRecentGoogleSheets().filter((s) => s.id !== item.id && s.url !== item.url);
    const updated = [item, ...existing].slice(0, 10);
    localStorage.setItem(RECENT_SHEETS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

/**
 * Clear the recent Google Sheets history.
 */
export function clearRecentGoogleSheets(): void {
  try {
    localStorage.removeItem(RECENT_SHEETS_STORAGE_KEY);
  } catch {
    // noop
  }
}
