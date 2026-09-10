import { useState, useEffect, useRef } from 'react';
import { Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MentionPickerProps {
    query: string;
    tables: string[];
    dbName?: string;
    onSelect: (table: string) => void;
    onClose: () => void;
}

export function MentionPicker({ query, tables, dbName, onSelect, onClose }: MentionPickerProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const activeRef = useRef<HTMLButtonElement | null>(null);

    const filtered = tables.filter(t => t.toLowerCase().includes(query.toLowerCase()));

    // Reset selection to top item whenever search query changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Keyboard navigation: capture ArrowUp, ArrowDown, Enter, Tab, Escape
    useEffect(() => {
        if (filtered.length === 0) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIndex(prev => (prev + 1) % filtered.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                if (filtered[selectedIndex]) {
                    onSelect(filtered[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, [filtered, selectedIndex, onSelect, onClose]);

    // Auto-scroll active item into view
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (filtered.length === 0) return null;

    return (
        <div
            className="absolute bottom-full mb-2 left-0 w-64 bg-popover/95 backdrop-blur-md border border-border/80 rounded-xl shadow-xl overflow-hidden z-50 flex flex-col animate-in fade-in-0 zoom-in-95 duration-100"
            onMouseDown={e => e.preventDefault()}
        >
            <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40 border-b border-border/40 shrink-0 flex items-center justify-between">
                <span>{dbName ? `Tables in ${dbName}` : 'Reference a table'}</span>
                <span className="text-[9px] font-mono opacity-60">↵ select</span>
            </div>
            <div className="max-h-60 overflow-y-auto p-1 scrollbar-thin">
                {filtered.map((table, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                        <button
                            key={table}
                            ref={isSelected ? activeRef : undefined}
                            type="button"
                            className={cn(
                                'w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-2 transition-colors cursor-pointer',
                                isSelected
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                            )}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onMouseDown={e => {
                                e.preventDefault();
                                onSelect(table);
                            }}
                        >
                            <Table2 className={cn('w-3.5 h-3.5 shrink-0 transition-colors', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                            <span className="truncate">{table}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
