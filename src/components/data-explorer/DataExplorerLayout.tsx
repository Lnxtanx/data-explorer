// =============================================================================
// Data Explorer Layout
// Two-column layout: sidebar (table list) + main content (row grid)
// =============================================================================

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftClose, PanelLeft, Database, BarChart3 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TableSidebar } from './TableSidebar';
import { TableGrid } from './TableGrid';
import { ExportButton } from './ExportButton';
import { EmptyState } from './EmptyState';
import { SchemaSelector } from './sidebar/SchemaSelector';
import { useTableList, useSchemas, usePrefetchTableRows } from '@/lib/api/data/explorer';
import type { TableInfo, ExportGridContext } from '@/lib/api/data/explorer';
import { SidebarFooter } from '@/components/layout/SidebarFooter';
import { saveLastViewedTable, loadLastViewedTable, getExplorerPageSize } from '@/lib/explorer-preferences';
import type { ViewMode } from '@/lib/view-mode';

// AI components are only rendered when the user activates AI mode.
// Lazy-loading keeps recharts, mermaid, pptxgenjs, and jspdf out of the
// initial bundle — they are fetched on demand when AI mode first becomes active.
const AIChatSidebar = lazy(() => import('./ai/AIChatSidebar').then(m => ({ default: m.AIChatSidebar })));
const AIChatMain = lazy(() => import('./ai/AIChatMain').then(m => ({ default: m.AIChatMain })));
const AIChatLibrary = lazy(() => import('./ai/AIChatLibrary').then(m => ({ default: m.AIChatLibrary })));
const AIChatProjects = lazy(() => import('./ai/AIChatProjects').then(m => ({ default: m.AIChatProjects })));
const ProjectDetailView = lazy(() => import('./ai/ProjectDetailView').then(m => ({ default: m.ProjectDetailView })));
const ArtifactHistory = lazy(() => import('./ai/ArtifactHistory').then(m => ({ default: m.ArtifactHistory })));

const DashboardView = lazy(() => import('@/components/dashboard/de-DashboardView').then(m => ({ default: m.DashboardView })));
const DashboardSidebar = lazy(() => import('@/components/dashboard/de-DashboardSidebar').then(m => ({ default: m.DashboardSidebar })));
import { ResonaAISidePanel } from './ai/side-panel';
import { useConnections } from '@/lib/api/data/connection';

import {
  useDashboard,
  useDashboardLiveVersion,
  useGenerateDashboard,
  useRefreshDashboard,
  useRefreshPanel,
} from '@/hooks/de-useDashboard';
import type { InsightEvidence } from '@/lib/api/dashboard';

function AISuspenseFallback({ className }: { className?: string }) {
  return <div className={cn('flex-1 animate-pulse bg-muted/30', className)} />;
}

interface DataExplorerLayoutProps {
  connectionId: string | null;
  onConnectionChange: (connectionId: string | null) => void;
  headerContent?: React.ReactNode | ((props: { exportButton: React.ReactNode }) => React.ReactNode);
  onOpenSettings?: () => void;
  onOpenPlans?: () => void;
  onOpenConnectWizard?: () => void;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  onTableSelectChange?: (table: TableInfo | null, schemaName: string) => void;
  onOpenAIForTable?: (tableName: string) => void;
  aiContextTable?: string | null;
  aiContextSchema?: string;
  isAiPanelOpen?: boolean;
  onCloseAiPanel?: () => void;
  onOpenAiPanel?: () => void;
}

const AI_CHAT_STORAGE_KEY = 'sw-data-explorer:active-chat-id';
const AI_VIEW_STORAGE_KEY = 'sw-data-explorer:ai-active-view';
const AI_PROJECT_STORAGE_KEY = 'sw-data-explorer:active-project-id';

export function DataExplorerLayout({
  connectionId,
  onConnectionChange,
  headerContent,
  onOpenSettings,
  onOpenPlans,
  onOpenConnectWizard,
  mode,
  onModeChange,
  onTableSelectChange,
  onOpenAIForTable,
  aiContextTable,
  aiContextSchema,
  isAiPanelOpen = false,
  onCloseAiPanel,
  onOpenAiPanel,
}: DataExplorerLayoutProps) {
  const { data: connections } = useConnections();
  const selectedConnection = connections?.find((c) => c.id === connectionId);
  const databaseName = selectedConnection?.name;
  const connectionAccess = selectedConnection?.access_type ?? 'owner';

  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [schemaName, setSchemaName] = useState('public');
  const [aiActiveView, setAiActiveView] = useState<'chat' | 'library' | 'projects' | 'artifacts' | 'project_detail'>(() => {
    if (typeof window === 'undefined') return 'chat';
    const saved = localStorage.getItem(AI_VIEW_STORAGE_KEY);
    if (saved === 'library' || saved === 'projects' || saved === 'artifacts' || saved === 'project_detail') {
      return saved;
    }
    return 'chat';
  });
  // Active chat ID — shared between sidebar (select) and main (render)
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const urlChat = new URLSearchParams(window.location.search).get('chat');
    if (urlChat) return urlChat;
    return localStorage.getItem(AI_CHAT_STORAGE_KEY) || null;
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const urlProject = new URLSearchParams(window.location.search).get('project');
    if (urlProject) return urlProject;
    return localStorage.getItem(AI_PROJECT_STORAGE_KEY) || null;
  });
  const [newChatKey, setNewChatKey] = useState(0);
  const queryClient = useQueryClient();
  const prefetchTableRows = usePrefetchTableRows();
  const [gridExportContext, setGridExportContext] = useState<ExportGridContext | null>(null);
  const [exportPortalTarget, setExportPortalTarget] = useState<HTMLElement | null>(null);

  // ── Dashboard state & hooks ───────────────────────────────────────────────
  const { theme: appTheme, resolvedTheme } = useTheme();
  const currentTheme = appTheme === 'system' ? resolvedTheme : appTheme;
  const dashTheme = (
    currentTheme === 'light' || currentTheme === 'dark-black' || currentTheme === 'blue-gray'
      ? currentTheme
      : 'dark'
  );
  const { data: dashboardData, isLoading: isDashboardLoading } = useDashboard(
    connectionId,
    dashTheme
  );
  useDashboardLiveVersion(
    connectionId,
    dashboardData?.dashboard?.id,
    Boolean(dashboardData?.dashboard?.isShared)
  );
  const {
    startGeneration: rawStartGeneration,
    cancelGeneration: handleCancelDashboardGeneration,
    isGenerating: isDashboardGenerating,
    progress: dashboardGenerationProgress,
    latestRunId,
  } = useGenerateDashboard(connectionId);

  const handleGenerateDashboard = useCallback(async (opts?: any) => {
    onOpenAiPanel?.();
    return rawStartGeneration(opts);
  }, [onOpenAiPanel, rawStartGeneration]);

  // A "Why?" click on an insight panel — surfaced for Phase 3, when it will be
  // wired into the Resona investigation loop. For now open the AI side panel
  // so the user lands in the conversation surface.
  const handleInsightWhy = useCallback((_panelKey: string, _evidence?: InsightEvidence) => {
    onOpenAiPanel?.();
  }, [onOpenAiPanel]);
  const refreshDashboardMutation = useRefreshDashboard(
    connectionId,
    (data) => {
      if (dashboardIframeRef.current?.contentWindow) {
        dashboardIframeRef.current.contentWindow.postMessage(
          { type: 'GLOBAL_REFRESH_DONE', dataMap: data.panelData },
          '*'
        );
      }
    },
    () => {
      if (dashboardIframeRef.current?.contentWindow) {
        dashboardIframeRef.current.contentWindow.postMessage({ type: 'GLOBAL_REFRESH_ERROR' }, '*');
      }
    }
  );
  const refreshPanelMutation = useRefreshPanel(connectionId);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const dashboardIframeRef = useRef<HTMLIFrameElement>(null);

  const handleScrollToSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    if (dashboardIframeRef.current?.contentWindow) {
      dashboardIframeRef.current.contentWindow.postMessage(
        { type: 'SCROLL_TO_SECTION', sectionId },
        '*'
      );
    }
  }, []);

  const handleRefreshPanel = useCallback(async (panelKey: string) => {
    if (!dashboardData?.dashboard?.id) return null;
    const res = await refreshPanelMutation.mutateAsync({
      dashboardId: dashboardData.dashboard.id,
      panelKey,
    });
    return res.data;
  }, [dashboardData?.dashboard?.id, refreshPanelMutation]);

  const handleRefreshAll = useCallback(() => {
    if (!dashboardData?.dashboard?.id) return;
    if (dashboardIframeRef.current?.contentWindow) {
      dashboardIframeRef.current.contentWindow.postMessage(
        { type: 'GLOBAL_REFRESH_START' },
        '*'
      );
    }
    refreshDashboardMutation.mutate(dashboardData.dashboard.id);
  }, [dashboardData?.dashboard?.id, refreshDashboardMutation]);

  useEffect(() => {
    if (mode !== 'ai') return;
    if (activeChatId) {
      localStorage.setItem(AI_CHAT_STORAGE_KEY, activeChatId);
    } else {
      localStorage.removeItem(AI_CHAT_STORAGE_KEY);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'ai') {
      if (activeChatId) {
        params.set('chat', activeChatId);
      } else {
        params.delete('chat');
      }
      window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`);
    }
  }, [activeChatId, mode]);

  useEffect(() => {
    if (mode !== 'ai') return;
    localStorage.setItem(AI_VIEW_STORAGE_KEY, aiActiveView);
  }, [aiActiveView, mode]);

  useEffect(() => {
    if (mode !== 'ai') return;
    if (activeProjectId) {
      localStorage.setItem(AI_PROJECT_STORAGE_KEY, activeProjectId);
    } else {
      localStorage.removeItem(AI_PROJECT_STORAGE_KEY);
    }
  }, [activeProjectId, mode]);

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setActiveProjectId(null);
    localStorage.removeItem(AI_CHAT_STORAGE_KEY);
    localStorage.removeItem(AI_PROJECT_STORAGE_KEY);
    setNewChatKey(k => k + 1);

    const params = new URLSearchParams(window.location.search);
    if (params.get('chat') || params.get('project')) {
      params.delete('chat');
      params.delete('project');
      const query = params.toString();
      window.history.replaceState({}, document.title, query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }
  }, []);

  const handleNewProjectChat = useCallback((pId: string) => {
    setActiveChatId(null);
    setActiveProjectId(pId);
    localStorage.removeItem(AI_CHAT_STORAGE_KEY);
    localStorage.setItem(AI_PROJECT_STORAGE_KEY, pId);
    setNewChatKey(k => k + 1);
    setAiActiveView('chat');

    const params = new URLSearchParams(window.location.search);
    params.delete('chat');
    params.set('project', pId);
    window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`);
  }, []);

  useEffect(() => {
    const el = document.getElementById('table-export-portal');
    if (el !== exportPortalTarget) {
      setExportPortalTarget(el);
    }
  });

  // Warm the first page of a table before the user clicks it (hover/keyboard).
  const handlePrefetchTable = useCallback((table: TableInfo) => {
    if (!connectionId) return;
    prefetchTableRows(connectionId, table.name, {
      schemaName,
      limit: getExplorerPageSize(),
    });
  }, [connectionId, schemaName, prefetchTableRows]);

  // Fetch schemas list
  const { data: schemasData, isLoading: schemasLoading, refetch: refetchSchemas } = useSchemas(connectionId);
  const schemas = schemasData?.schemas || [{ name: 'public', tableCount: 0 }];

  // Fetch table list
  const { data: tableList, isLoading: tablesLoading, error: tablesError, refetch: refetchTables } = useTableList(
    connectionId,
    schemaName
  );

  // Auto-recover failed table or schema queries when network or connection reconnects
  useEffect(() => {
    const handleOnline = () => {
      if (connectionId) {
        refetchTables();
        refetchSchemas();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [connectionId, refetchTables, refetchSchemas]);

  // Reset selected table when schema changes
  const handleSchemaChange = useCallback((newSchema: string) => {
    setSchemaName(newSchema);
    setSelectedTable(null);
    onTableSelectChange?.(null, newSchema);
  }, [onTableSelectChange]);

  const handleTableSelect = useCallback((table: TableInfo) => {
    setSelectedTable(table);
    saveLastViewedTable(connectionId || '', schemaName, table.name);
    onTableSelectChange?.(table, schemaName);
  }, [schemaName, connectionId, onTableSelectChange]);
  const handleTableMentionClick = useCallback((tableName: string) => {
    // Find the table in current metadata for rich info, or fallback to name-only
    const table = tableList?.tables?.find(t => t.name === tableName);
    if (table) {
      handleTableSelect(table);
    } else {
      handleTableSelect({ name: tableName, schema: schemaName } as TableInfo);
    }
    onModeChange('explorer');
  }, [tableList, handleTableSelect, onModeChange, schemaName]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Reset explorer state when the connection changes: a stale selected table
  // from another connection must never render against the new connection.
  useEffect(() => {
    setSelectedTable(null);
    setSchemaName('public');
    onTableSelectChange?.(null, 'public');
  }, [connectionId, onTableSelectChange]);

  // Restore the last-viewed table once per connection/schema after the table
  // list loads, so a reload lands straight on the previously opened grid
  // (React Query serves it from the in-memory cache — no spinner).
  // Restore the last-viewed table or auto-select the first table in the schema
  useEffect(() => {
    if (!connectionId || !tableList?.tables || tableList.tables.length === 0) return;
    
    // If we already have a valid selected table matching the current list, keep it
    if (selectedTable && tableList.tables.some(t => t.name === selectedTable.name)) {
      return;
    }

    // Try restoring the last-viewed table from storage
    const saved = loadLastViewedTable();
    if (saved && saved.connectionId === connectionId && saved.schemaName === schemaName) {
      const table = tableList.tables.find(t => t.name === saved.tableName);
      if (table) {
        setSelectedTable(table);
        onTableSelectChange?.(table, schemaName);
        return;
      }
    }

    // If no saved table found, automatically select the first table
    const firstTable = tableList.tables[0];
    setSelectedTable(firstTable);
    saveLastViewedTable(connectionId, schemaName, firstTable.name);
    onTableSelectChange?.(firstTable, schemaName);
  }, [connectionId, schemaName, tableList, onTableSelectChange, selectedTable]);

  return (
    <div className="flex w-full h-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-border bg-card transition-all duration-300',
          sidebarCollapsed ? 'w-12' : 'w-64'
        )}
      >
        {/* Sidebar Header */}
        <div className={cn(
          "flex items-center px-3 h-10 border-b border-border shrink-0",
          sidebarCollapsed ? "justify-center" : "justify-between"
        )}>
          {!sidebarCollapsed && (
            <button
              onClick={() => {
                if (mode === 'ai' || mode === 'dashboard') {
                  onModeChange('explorer');
                } else if (!selectedTable && tableList?.tables && tableList.tables.length > 0) {
                  const first = tableList.tables[0];
                  setSelectedTable(first);
                  onTableSelectChange?.(first, schemaName);
                }
              }}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              {mode === 'dashboard' ? (
                <BarChart3 className="w-4 h-4 text-primary" />
              ) : (
                <Database className="w-4 h-4 text-primary" />
              )}
              <h1 className="text-sm font-semibold">
                {mode === 'dashboard' ? 'Dashboard' : 'Data Explorer'}
              </h1>
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleToggleSidebar}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Table List / AI Sidebar */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!sidebarCollapsed && (
            mode === 'ai' ? (
              <Suspense fallback={<AISuspenseFallback className="flex-1" />}>
                <AIChatSidebar
                  onCloseAI={() => onModeChange('explorer')}
                  activeView={aiActiveView}
                  onViewChange={(view) => { setAiActiveView(view); }}
                  connectionId={connectionId ?? undefined}
                  activeChatId={activeChatId}
                  onChatSelect={(chatId, projectId) => {
                    setActiveChatId(chatId);
                    setActiveProjectId(projectId ?? null);
                  }}
                  onNewChat={handleNewChat}
                  onNewProjectChat={(pId) => handleNewProjectChat(pId)}
                  onOpenProject={(pId) => {
                    setActiveProjectId(pId);
                    setActiveChatId(null);
                    setAiActiveView('project_detail');
                  }}
                />
              </Suspense>
            ) : mode === 'dashboard' ? (
              <Suspense fallback={<AISuspenseFallback className="flex-1" />}>
                <DashboardSidebar
                  connectionId={connectionId}
                  dashboard={dashboardData?.dashboard}
                  isGenerating={isDashboardGenerating}
                  isRefreshing={refreshDashboardMutation.isPending}
                  onRefreshAll={handleRefreshAll}
                  onRegenerate={handleGenerateDashboard}
                  onScrollToSection={handleScrollToSection}
                  activeSectionId={activeSectionId}
                  accessType={connectionAccess}
                />
              </Suspense>
            ) : (
              <>
                {/* Schema Selector */}
                {connectionId && (
                  <div className="px-3 py-2 border-b border-border">
                    <SchemaSelector
                      schemas={schemas}
                      value={schemaName}
                      onChange={handleSchemaChange}
                      isLoading={schemasLoading}
                      disabled={!connectionId}
                    />
                  </div>
                )}
                <TableSidebar
                  tables={tableList?.tables || []}
                  selectedTable={selectedTable}
                  onTableSelect={handleTableSelect}
                  onPrefetchTable={handlePrefetchTable}
                  onRetry={() => refetchTables()}
                  isLoading={tablesLoading}
                  error={tablesError}
                  hasConnection={!!connectionId}
                  onOpenAIForTable={onOpenAIForTable}
                />
              </>
            )
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="shrink-0 mt-auto">
          <SidebarFooter 
            onOpenSettings={onOpenSettings} 
            mode={mode} 
            onModeChange={onModeChange} 
            isCollapsed={sidebarCollapsed}
          />
        </div>
      </aside>

      {/* Main Workspace (Middle Content) */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {(() => {
          const exportButtonElement = (
            <ExportButton
              connectionId={connectionId}
              tableName={selectedTable?.name ?? ''}
              schemaName={schemaName}
              gridContext={gridExportContext}
            />
          );

          if (typeof headerContent === 'function') {
            return headerContent({ exportButton: exportButtonElement });
          }

          return (
            <>
              {headerContent}
              {exportPortalTarget && createPortal(exportButtonElement, exportPortalTarget)}
            </>
          );
        })()}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {mode === 'ai' ? (
            <Suspense fallback={<AISuspenseFallback />}>
              {aiActiveView === 'library' ? (
                <AIChatLibrary />
              ) : aiActiveView === 'artifacts' ? (
                <ArtifactHistory
                  connectionId={connectionId ?? undefined}
                  onOpenChat={(chatId) => {
                    setActiveChatId(chatId);
                    setAiActiveView('chat');
                  }}
                />
              ) : aiActiveView === 'projects' ? (
                <AIChatProjects
                  onOpenProject={(projectId) => {
                    setActiveProjectId(projectId);
                    setActiveChatId(null);
                    setAiActiveView('project_detail');
                  }}
                />
              ) : aiActiveView === 'project_detail' && activeProjectId ? (
                <ProjectDetailView
                  projectId={activeProjectId}
                  onClose={() => setAiActiveView('projects')}
                  onOpenChat={(chatId) => {
                    setActiveChatId(chatId);
                    setAiActiveView('chat');
                  }}
                  onNewChat={() => handleNewProjectChat(activeProjectId)}
                />
              ) : (
                <AIChatMain
                  key={`chat-session-${newChatKey}`}
                  connectionId={connectionId ?? undefined}
                  chatId={activeChatId}
                  projectId={activeProjectId}
                  onChatCreated={(id) => {
                    setActiveChatId(id);
                    queryClient.invalidateQueries({ queryKey: ['ai', 'chats'] });
                    queryClient.invalidateQueries({ queryKey: ['ai', 'projects'] });
                  }}
                  onProjectClick={(projectId) => {
                    setActiveProjectId(projectId);
                    setAiActiveView('project_detail');
                  }}
                  aiContextTable={aiContextTable}
                  aiContextSchema={aiContextSchema}
                  onTableClick={handleTableMentionClick}
                  onOpenPlans={onOpenPlans ?? onOpenSettings}
                />
              )}
            </Suspense>
          ) : mode === 'dashboard' ? (
            <Suspense fallback={<AISuspenseFallback />}>
              <DashboardView
                connectionId={connectionId}
                dashboard={dashboardData?.dashboard}
                html={dashboardData?.html}
                isLoading={isDashboardLoading}
                isGenerating={isDashboardGenerating}
                generationProgress={dashboardGenerationProgress}
                onGenerate={handleGenerateDashboard}
                onCancelGenerate={handleCancelDashboardGeneration}
                onRefreshPanel={handleRefreshPanel}
                onSectionVisible={(secId) => setActiveSectionId(secId)}
                iframeRef={dashboardIframeRef}
                onOpenConnectWizard={onOpenConnectWizard}
                onInsightWhy={handleInsightWhy}
              />
            </Suspense>
          ) : selectedTable && connectionId ? (
            <>
              <TableGrid
                connectionId={connectionId}
                tableName={selectedTable.name}
                schemaName={schemaName}
                tableInfo={selectedTable}
                onViewReferencedTable={handleTableMentionClick}
                onGridContextChange={setGridExportContext}
              />
            </>
          ) : (
            <EmptyState
              hasConnection={!!connectionId}
              onOpenConnectWizard={onOpenConnectWizard}
            />
          )}
        </div>
      </main>

      {/* Resona AI Side Panel (Active only in Dashboard mode) */}
      {mode === 'dashboard' && isAiPanelOpen && (
        <ResonaAISidePanel
          isOpen={isAiPanelOpen}
          onClose={onCloseAiPanel || (() => {})}
          connectionId={connectionId ?? undefined}
          databaseName={databaseName}
          isDashboardGenerating={isDashboardGenerating}
          dashboardGenerationProgress={dashboardGenerationProgress}
          activeRunId={latestRunId}
        />
      )}
    </div>
  );
}
