// =============================================================================
// Data Explorer Layout
// Two-column layout: sidebar (table list) + main content (row grid)
// =============================================================================

import { useState, useCallback, lazy, Suspense } from 'react';
import { PanelLeftClose, PanelLeft, Database } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TableSidebar } from './TableSidebar';
import { TableGrid } from './TableGrid';
import { EmptyState } from './EmptyState';
import { SchemaSelector } from './sidebar/SchemaSelector';
import { useTableList, useSchemas } from '@/lib/api/data/explorer';
import type { TableInfo } from '@/lib/api/data/explorer';
import { SidebarFooter } from '@/components/layout/SidebarFooter';

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
  isAiMode?: boolean;
  onCloseAI?: () => void;
  onTableSelectChange?: (table: TableInfo | null, schemaName: string) => void;
  onOpenAIForTable?: (tableName: string) => void;
  aiContextTable?: string | null;
  aiContextSchema?: string;
}

export function DataExplorerLayout({ connectionId, onConnectionChange, headerContent, onOpenSettings, onOpenPlans, onOpenAI, isAiMode, onCloseAI, onTableSelectChange, onOpenAIForTable, aiContextTable, aiContextSchema }: DataExplorerLayoutProps) {
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [schemaName, setSchemaName] = useState('public');
  const [aiActiveView, setAiActiveView] = useState<'chat' | 'library' | 'projects' | 'artifacts' | 'project_detail'>('chat');
  // Active chat ID — shared between sidebar (select) and main (render)
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch schemas list
  const { data: schemasData, isLoading: schemasLoading } = useSchemas(connectionId);
  const schemas = schemasData?.schemas || ['public'];

  // Fetch table list
  const { data: tableList, isLoading: tablesLoading, error: tablesError } = useTableList(
    connectionId,
    schemaName
  );

  // Reset selected table when schema changes
  const handleSchemaChange = useCallback((newSchema: string) => {
    setSchemaName(newSchema);
    setSelectedTable(null);
    onTableSelectChange?.(null, newSchema);
  }, [onTableSelectChange]);

  const handleTableSelect = useCallback((table: TableInfo) => {
    setSelectedTable(table);
    onTableSelectChange?.(table, schemaName);
  }, [schemaName, onTableSelectChange]);
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
                } else {
                  setSelectedTable(null);
                  onTableSelectChange?.(null, schemaName);
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
                  onChatSelect={(chatId) => {
                    setActiveChatId(chatId);
                    setActiveProjectId(null);
                  }}
                  onNewChat={() => {
                    setActiveChatId(null);
                    setActiveProjectId(null);
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
                onNewChat={() => {
                  setActiveChatId(null);
                  setAiActiveView('chat');
                }}
              />
            ) : (
              <AIChatMain
                connectionId={connectionId ?? undefined}
                chatId={activeChatId}
                projectId={activeProjectId}
                onChatCreated={(id) => {
                  setActiveChatId(id);
                  queryClient.invalidateQueries({ queryKey: ['ai', 'chats'] });
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
              key={`${connectionId}-${schemaName}-${selectedTable.name}`}
              connectionId={connectionId}
              tableName={selectedTable.name}
              schemaName={schemaName}
              tableInfo={selectedTable}
            />
          </>
        ) : (
          <EmptyState hasConnection={!!connectionId} />
        )}
      </main>
    </div>
  );
}
