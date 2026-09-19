// =============================================================================
// Dashboard Render Engine — loading skeleton renderer
// =============================================================================

export type SkeletonVariant = 'metric' | 'chart';

export function renderSkeleton(container: HTMLElement, variant: SkeletonVariant = 'metric'): void {
  container.innerHTML =
    variant === 'chart'
      ? '<div class="sw-skeleton sw-skeleton-chart"></div>'
      : '<div class="sw-skeleton sw-skeleton-value"></div><div class="sw-skeleton sw-skeleton-badge" style="margin-top:8px;"></div>';
}