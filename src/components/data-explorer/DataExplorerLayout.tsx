// =============================================================================
// Data Explorer Layout
// Two-column layout: sidebar (table list) + main content (row grid)
// =============================================================================

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftClose, PanelLeft, Database } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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

// AI components are only rendered when the user activates AI mode.
// Lazy-loading keeps recharts, mermaid, pptxgenjs, and jspdf out of the
// initial bundle — they are fetched on demand when isAiMode first becomes true.
const AIChatSidebar = lazy(() => import('./ai/AIChatSidebar').then(m => ({ default: m.AIChatSidebar })));
const AIChatMain = lazy(() => import('./ai/AIChatMain').then(m => ({ default: m.AIChatMain })));
const AIChatLibrary = lazy(() => import('./ai/AIChatLibrary').then(m => ({ default: m.AIChatLibrary })));
const AIChatProjects = lazy(() => import('./ai/AIChatProjects').then(m => ({ default: m.AIChatProjects })));
const ProjectDetailView = lazy(() => import('./ai/ProjectDetailView').then(m => ({ default: m.ProjectDetailView })));
const ArtifactHistory = lazy(() => import('./ai/ArtifactHistory').then(m => ({ default: m.ArtifactHistory })));

function AISuspenseFallback({ className }: { className?: string }) {
  return <div className={cn('flex-1 animate-pulse bg-muted/30', className)} />;
}

interface DataExplorerLayoutProps {
  connectionId: string | null;
  onConnectionChange: (connectionId: string | null) => void;
  headerContent?: React.ReactNode;
  onOpenSettings?: () => void;
  onOpenPlans?: () => void;
  onOpenAI?: () => void;
  onOpenConnectWizard?: () => void;
  isAiMode?: boolean;
  onCloseAI?: () => void;
  onTableSelectChange?: (table: TableInfo | null, schemaName: string) => void;
  onOpenAIForTable?: (tableName: string) => void;
  aiContextTable?: string | null;
  aiContextSchema?: string;
}

export function DataExplorerLayout({
  connectionId,
  onConnectionChange,
  headerContent,
  onOpenSettings,
  onOpenPlans,
  onOpenAI,
  onOpenConnectWizard,
  isAiMode,
  onCloseAI,
  onTableSelectChange,
  onOpenAIForTable,
  aiContextTable,
  aiContextSchema,
}: DataExplorerLayoutProps) {
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [schemaName, setSchemaName] = useState('public');
  const [aiActiveView, setAiActiveView] = useState<'chat' | 'library' | 'projects' | 'artifacts' | 'project_detail'>('chat');
  // Active chat ID — shared between sidebar (select) and main (render)
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [newChatKey, setNewChatKey] = useState(0);
  const queryClient = useQueryClient();
  const prefetchTableRows = usePrefetchTableRows();
  const [gridExportContext, setGridExportContext] = useState<ExportGridContext | null>(null);
  const [exportPortalTarget, setExportPortalTarget] = useState<HTMLElement | null>(null);

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setActiveProjectId(null);
    setNewChatKey(k => k + 1);
  }, []);

  const handleNewProjectChat = useCallback((pId: string) => {
    setActiveChatId(null);
    setActiveProjectId(pId);
    setNewChatKey(k => k + 1);
    setAiActiveView('chat');
  }, []);

  useEffect(() => {
    setExportPortalTarget(document.getElementById('table-export-portal'));
  }, []);

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
    onCloseAI?.();
  }, [tableList, handleTableSelect, onCloseAI, schemaName]);

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
    <div className="flex w-full h-full bg-background">
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
                if (isAiMode) {
                  onCloseAI?.();
                } else if (!selectedTable && tableList?.tables && tableList.tables.length > 0) {
                  const first = tableList.tables[0];
                  setSelectedTable(first);
                  onTableSelectChange?.(first, schemaName);
                }
              }}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Database className="w-4 h-4 text-primary" />
              <h1 className="text-sm font-semibold">Data Explorer</h1>
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
            isAiMode ? (
              <Suspense fallback={<AISuspenseFallback className="flex-1" />}>
                <AIChatSidebar
                  onCloseAI={onCloseAI!}
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
        <div className="px-3 shrink-0">
          <SidebarFooter 
            onOpenSettings={onOpenSettings} 
            onOpenAI={onOpenAI} 
            isAiMode={isAiMode} 
            isCollapsed={sidebarCollapsed}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {headerContent}
        {exportPortalTarget && createPortal(
          <ExportButton
            connectionId={connectionId}
            tableName={selectedTable?.name ?? ''}
            schemaName={schemaName}
            gridContext={gridExportContext}
          />,
          exportPortalTarget
        )}
        {isAiMode ? (
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
      </main>
    </div>
  );
}
