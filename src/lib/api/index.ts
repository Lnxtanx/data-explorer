// =============================================================================
// Slim API Barrel — Data Explorer only
// Only exports what the Data Explorer feature needs.
// Does NOT include: file-management, schema, payments, migrations.
// =============================================================================

export {
    API_BASE_URL,
    ApiError,
    apiRequest,
    get,
    post,
    patch,
    del,
} from './client';

export * from './auth';
export * from './ai';
export * from './projects';
export * from './feedback';

