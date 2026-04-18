// =============================================================================
// Export Button - CSV download trigger
// =============================================================================

import { Download, Loader2, FileJson, FileSpreadsheet, FileText, Database } from 'lucide-react';
import { useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { downloadTableData, downloadAllTablesData } from '@/lib/api/data/explorer';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface ExportButtonProps {
  connectionId: string | null;
  tableName: string;
  schemaName: string;
  maxRows?: number;
}

export function ExportButton({
  connectionId,
  tableName,
  schemaName,
  maxRows = 10000,
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showDatabase, setShowDatabase] = useState(false);

  const handleExport = async (format: string) => {
    if (!connectionId || !tableName) return;

    setIsExporting(true);
    try {
      downloadTableData(connectionId, tableName, schemaName, maxRows, format);
    } finally {
      // Small delay to show feedback
      setTimeout(() => setIsExporting(false), 500);
    }
  };

  const handleExportAll = async (format: string) => {
    if (!connectionId) return;

    setIsExporting(true);
    toast.info(`Exporting schema '${schemaName}'...`, {
      description: `Preparing ZIP archive of ${format.toUpperCase()} files. This may take a moment depending on the database size.`,
      duration: 5000,
    });
    
    try {
      // Small timeout to allow toast to render and state to update
      await new Promise(resolve => setTimeout(resolve, 100));
      downloadAllTablesData(connectionId, schemaName, format);
    } catch (error) {
      toast.error('Failed to initiate export');
      console.error(error);
    } finally {
      setTimeout(() => setIsExporting(false), 2000);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isExporting}
          className="gap-1.5 h-8 px-3"
        >
          {isExporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          <span className="text-xs font-medium">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2 select-none max-h-[85vh] overflow-y-auto scrollbar-thin" onCloseAutoFocus={(e) => e.preventDefault()}>
        {!connectionId ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
            <Database className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground">Select a connection to export data</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Table Export Section */}
            <div>
              <div className="flex items-center gap-2 px-2 mb-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest whitespace-nowrap opacity-70">Export Current Table</span>
                <div className="h-px w-full bg-border/60" />
              </div>
              
              {!tableName ? (
                <div className="px-2 py-4 text-center border border-dashed border-border rounded-md bg-muted/30">
                  <p className="text-[10px] text-muted-foreground italic text-balance leading-relaxed">
                    Select a table to export rows
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <ExportItem icon={<FileText className="w-3.5 h-3.5" />} label={`${tableName} - CSV`} onClick={() => handleExport('csv')} />
                  <ExportItem icon={<FileJson className="w-3.5 h-3.5" />} label={`${tableName} - JSON`} onClick={() => handleExport('json')} />
                  <ExportItem icon={<FileJson className="w-3.5 h-3.5" />} label={`${tableName} - NDJSON`} onClick={() => handleExport('ndjson')} />
                  <ExportItem icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label={`${tableName} - EXCEL`} onClick={() => handleExport('excel')} />
                  <ExportItem icon={<Database className="w-3.5 h-3.5" />} label={`${tableName} - SQL`} onClick={() => handleExport('sql')} />
                </div>
              )}
            </div>

            {/* database Export Section */}
            <div>
              <div 
                className="flex items-center gap-2 px-2 mb-2 cursor-pointer group"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDatabase(!showDatabase);
                }}
              >
                <span className="text-[10px] font-medium text-green-600 dark:text-green-500 uppercase tracking-widest whitespace-nowrap opacity-80">
                  Export Entire Database (ZIP)
                </span>
                <div className="h-px w-full bg-border/60 group-hover:bg-green-200 dark:group-hover:bg-green-800 transition-colors" />
                <div className={cn(
                  "text-[10px] text-green-600 transition-transform duration-200",
                  showDatabase ? "rotate-180" : ""
                )}>
                  ▼
                </div>
              </div>
              
              {showDatabase ? (
                <div className="flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <ExportItem icon={<FileText className="w-3.5 h-3.5" />} label={`${schemaName} - CSV`} variant="green" onClick={() => handleExportAll('csv')} />
                  <ExportItem icon={<FileJson className="w-3.5 h-3.5" />} label={`${schemaName} - JSON`} variant="green" onClick={() => handleExportAll('json')} />
                  <ExportItem icon={<FileJson className="w-3.5 h-3.5" />} label={`${schemaName} - NDJSON`} variant="green" onClick={() => handleExportAll('ndjson')} />
                  <ExportItem icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label={`${schemaName} - EXCEL`} variant="green" onClick={() => handleExportAll('excel')} />
                  <ExportItem icon={<Database className="w-3.5 h-3.5" />} label={`${schemaName} - SQL`} variant="green" onClick={() => handleExportAll('sql')} />
                </div>
              ) : (
                <div 
                  className="px-2 py-2 text-center border border-dashed border-green-200 dark:border-green-900/50 rounded-md bg-green-50/30 dark:bg-blue-900/10 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDatabase(true);
                  }}
                >
                  <p className="text-[10px] text-green-600/70 dark:text-green-400/70 font-normal">
                    Click to reveal database options
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function ExportItem({ 
  icon, 
  label, 
  onClick, 
  className,
  variant = 'default' 
}: { 
  icon: ReactNode; 
  label: string; 
  onClick: () => void;
  className?: string;
  variant?: 'default' | 'green';
}) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 p-2 rounded-md transition-all cursor-pointer border border-transparent text-foreground',
        variant === 'default' 
          ? 'hover:bg-accent hover:border-border' 
          : 'text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-200 dark:hover:border-green-800/50',
        className
      )}
    >
      <div className={cn(
        'p-1.5 rounded-full flex-shrink-0',
        variant === 'default' ? 'bg-muted' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
      )}>
        {icon}
      </div>
      <span className="text-xs font-normal tracking-tight truncate opacity-90">{label}</span>
    </DropdownMenuItem>
  );
}

