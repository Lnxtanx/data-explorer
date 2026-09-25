// =============================================================================
// Shared HTTP surface - transport only.
//
// Phase 4: this barrel used to re-export the auth, ai and projects API modules
// as well. Those three all moved into their own component folders
// (components/auth/api, components/ai, components/collaboration), and lib/ is
// now shared-infrastructure only, so a lib/ barrel must not reach back up into
// components/.
//
// Nothing imported this barrel - consumers reached for the specific module they
// needed - so the domain re-exports are simply gone rather than repointed.
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

export * from './feedback';

