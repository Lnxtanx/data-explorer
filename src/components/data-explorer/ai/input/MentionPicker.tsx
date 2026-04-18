import { AtSign, Table2 } from 'lucide-react';

interface MentionPickerProps {
    query: string;
    tables: string[];
    dbName?: string;
    onSelect: (table: string) => void;
    onClose: () => void;
}

export function MentionPicker({ query, tables, dbName, onSelect, onClose }: MentionPickerProps) {
    const filtered = tables
        .filter(t => t.toLowerCase().includes(query.toLowerCase()));

    if (filtered.length === 0) return null;

    return (
        <div
            className="absolute bottom-full mb-2 left-0 w-56 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 flex flex-col"
            onMouseDown={e => e.preventDefault()}
        >
            <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 shrink-0">
                {dbName ? `Tables in ${dbName}` : 'Reference a table'}
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-thin">
                {filtered.map(table => (
                    <button
                        key={table}
                        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-muted transition-colors group"
                        onMouseDown={e => { e.preventDefault(); onSelect(table); }}
                    >
                        <Table2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                        <span className="truncate">{table}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
