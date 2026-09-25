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
