import { Loader2, Database } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSchema, useTableRowsSimple } from '@/lib/api/data/explorer';

export function TablePreview({ tableName, connectionId, schemaName = 'public' }: {
    tableName: string; connectionId: string; schemaName?: string;
}) {
    const { data: schema, isLoading } = useTableSchema(connectionId, tableName, schemaName);
    const { data: rowData } = useTableRowsSimple(connectionId, tableName, { limit: 3, schemaName });

    if (isLoading) return (
        <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/50" />
        </div>
    );

    return (
        <div className="flex flex-col gap-3 min-w-[280px] max-w-[320px]">
            <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <Database className="w-4 h-4 text-blue-500" />
                <span className="font-bold text-sm text-foreground tracking-tight">{tableName}</span>
                <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded ml-auto">{schemaName}</span>
            </div>
            <div>
                <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Columns</div>
                <div className="flex flex-wrap gap-1">
                    {schema?.columns.slice(0, 8).map(c => (
                        <span key={c.name} className="text-[11px] bg-muted/40 border border-border/20 px-1.5 py-0.5 rounded text-foreground/80 font-medium">
                            {c.name} <span className="text-muted-foreground/50 font-normal ml-0.5">{c.type}</span>
                        </span>
                    ))}
                    {(schema?.columns.length ?? 0) > 8 && (
                        <span className="text-[10px] text-muted-foreground/70 px-1 italic">+ {schema!.columns.length - 8} more</span>
                    )}
                </div>
            </div>
            {rowData?.rows && rowData.rows.length > 0 && (
                <div className="mt-1">
                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Sample Data Preview</div>
                    <div className="rounded-md border border-border/40 overflow-hidden bg-card/50">
                        <Table className="text-[10px]">
                            <TableHeader className="bg-muted/40">
                                <TableRow className="h-7 hover:bg-transparent border-border/30">
                                    {rowData.columns.slice(0, 3).map(c => (
                                        <TableHead key={c.name} className="h-7 px-2 font-bold text-muted-foreground">{c.name}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rowData.rows.slice(0, 3).map((row, ri) => (
                                    <TableRow key={ri} className="h-7 border-border/10 hover:bg-muted/20">
                                        {rowData.columns.slice(0, 3).map(c => (
                                            <TableCell key={c.name} className="h-7 px-2 py-1 max-w-[80px] truncate text-foreground/90 tabular-nums">
                                                {String(row[c.name])}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
    );
}
