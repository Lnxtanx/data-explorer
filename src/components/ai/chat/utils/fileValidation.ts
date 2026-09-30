// =============================================================================
// src/components/ai/chat/utils/fileValidation.ts
// Client-side file attachment validation constraints & checks
// =============================================================================

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB — must match backend
export const MAX_FILE_COUNT = 10;

export const ALLOWED_FILE_EXTENSIONS = new Set([
    '.pdf', '.docx', '.xlsx', '.xls', '.csv', '.tsv', '.pptx',
    '.txt', '.md', '.json', '.sql', '.py', '.ts', '.js', '.tsx', '.jsx',
    '.yaml', '.yml', '.xml', '.html', '.css', '.sh', '.env', '.log',
    '.toml', '.rs', '.go', '.java', '.dockerfile',
    '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif',
]);

export interface FileValidationResult {
    valid: File[];
    errors: string[];
}

// Raster images get a real thumbnail in the attachment chip; everything else
// keeps the generic document icon. SVG is deliberately excluded: it is markup,
// not a bitmap, and rendering it inline from a user-supplied blob would execute
// whatever SVG it contains.
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export function isImageFile(file: File): boolean {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
}

/** Is this name an image we can render a thumbnail for? */
export function isImageName(name: string | undefined | null): boolean {
    if (!name) return false;
    const ext = '.' + (name.split('.').pop() || '').toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Resolve a renderable URL for an image ATTACHMENT, given a sent-message
 * artifact rather than a live browser File.
 *
 * Sent attachments are no longer in the browser, so there is no object URL to
 * make. They still have a file_id, and the backend can stream the original
 * bytes from S3 — but only via the binary route. Pointing an <img> at the text
 * endpoint returns the vision description and yields a broken-image icon.
 *
 * Order matters: the local object URL first (instant, no network), then the
 * download_url (fresh presigned S3), then the same-origin binary route.
 */
export function imagePreviewUrl(att: {
    file_id?: string; fileId?: string; id?: string;
    download_url?: string; downloadUrl?: string;
    metadata?: { s3_key?: string } | null;
    key?: string;
}): string | null {
    const fileId = att.file_id || att.fileId || att.id;
    if (att.key) return `/ai-api/ai/exports/content?key=${encodeURIComponent(att.key)}`;
    if (fileId) return `/ai-api/ai/files/${fileId}/raw`;
    const url = att.download_url || att.downloadUrl;
    if (url) return url;
    return null;
}

export function validateFiles(files: File[]): FileValidationResult {
    const valid: File[] = [];
    const errors: string[] = [];
    for (const f of files) {
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
            errors.push(`${f.name}: unsupported file type (${ext})`);
            continue;
        }
        if (f.size > MAX_FILE_SIZE_BYTES) {
            errors.push(`${f.name}: exceeds 25 MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
            continue;
        }
        valid.push(f);
    }
    return { valid, errors };
}
