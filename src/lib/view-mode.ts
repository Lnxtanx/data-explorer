export type ViewMode = 'explorer' | 'ai' | 'dashboard';

export const DEFAULT_VIEW_MODE_KEY = 'sw-data-explorer:default-view-mode';
export const VIEW_MODE_SESSION_KEY = 'sw-data-explorer:view-mode';
export const VIEW_MODE_CHANGED_EVENT = 'sw-default-mode-changed';

export const VIEW_MODE_LABEL: Record<ViewMode, string> = {
    explorer: 'Data Explorer',
    ai: 'Resona AI',
    dashboard: 'Dashboard',
};

export function isViewMode(value: string | null | undefined): value is ViewMode {
    return value === 'explorer' || value === 'ai' || value === 'dashboard';
}