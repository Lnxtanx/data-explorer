// ─── Markdown + Table renderer ────────────────────────────────────────────────
// Supports: **bold**, *italic*, `code`, ## headings, bullet/numbered lists,
// fenced code blocks (```lang...```), and GitHub-flavored pipe tables.

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Database } from 'lucide-react';
import { TablePreview } from './TablePreview';

interface MarkdownTextProps {
    text: string;
    className?: string;
    onTableClick?: (tableName: string) => void;
    connectionId?: string;
    availableTables?: string[];
}

// Render inline marks: **bold**, *italic*, `code`, and @mentions
function renderInline(line: string, baseKey: string | number, onTableClick?: (tableName: string) => void, connectionId?: string, availableTables?: string[]): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|@([a-zA-Z0-9_]+))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        if (m.index > last) parts.push(line.slice(last, m.index));
        if (m[2] !== undefined) parts.push(<strong key={`${baseKey}-b${m.index}`}>{m[2]}</strong>);
        else if (m[3] !== undefined) parts.push(
            <code key={`${baseKey}-c${m.index}`}
                className="bg-muted/60 rounded px-1 py-0.5 text-[12.5px] font-mono">
                {m[3]}
            </code>
        );
        else if (m[4] !== undefined) parts.push(<em key={`${baseKey}-i${m.index}`}>{m[4]}</em>);
        else if (m[5] !== undefined) {
            const tableName = m[5];
            const button = (
                <button
                    key={`${baseKey}-at${m.index}`}
                    onClick={() => onTableClick?.(tableName)}
                    className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline font-medium decoration-blue-500/30 underline-offset-2 transition-colors"
                    title={`View table ${tableName}`}
                >
                    @{tableName}
                </button>
            );

            if (availableTables?.includes(tableName)) {
                parts.push(
                    <HoverCard key={`${baseKey}-hc${m.index}`} openDelay={200} closeDelay={100}>
                        <HoverCardTrigger asChild>
                            {button}
                        </HoverCardTrigger>
                        <HoverCardContent 
                            className="w-[320px] p-4 bg-background/95 backdrop-blur-md border-border/60 shadow-2xl z-[100] rounded-xl"
                            align="start"
                            side="top"
                            sideOffset={12}
                        >
                            {connectionId ? (
                                <TablePreview tableName={tableName} connectionId={connectionId} />
                            ) : (
                                <div className="text-xs text-muted-foreground p-2 text-center">
                                    <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    <p>Select a database to see table preview</p>
                                </div>
                            )}
                        </HoverCardContent>
                    </HoverCard>
                );
            } else {
                parts.push(button);
            }
        }
        last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <span key={baseKey}>{parts}</span>;
}

// Parse a pipe table block into header + rows
function parsePipeTable(lines: string[]): { headers: string[]; rows: string[][] } | null {
    if (lines.length < 2) return null;
    const headerLine = lines[0];
    const separatorLine = lines[1];
    // Separator must be like | --- | --- |
    if (!/^\|?[\s\-:]+(\|[\s\-:]+)*\|?$/.test(separatorLine.trim())) return null;

    const parseRow = (l: string) =>
        l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

    return {
        headers: parseRow(headerLine),
        rows: lines.slice(2).map(parseRow),
    };
}

export function MarkdownText({ text, className, onTableClick, connectionId, availableTables }: MarkdownTextProps) {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    const render = (t: string, key: string) => renderInline(t, key, onTableClick, connectionId, availableTables);

    while (i < lines.length) {
        const line = lines[i];

        // Fenced code block
        if (line.startsWith('```')) {
            const lang = line.slice(3).trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            elements.push(
                <div key={`code-${i}`} className="my-2 rounded-lg border border-border/60 bg-muted/40 overflow-hidden text-xs">
                    {lang && (
                        <div className="px-3 py-1 border-b border-border/40 text-[10px] font-mono text-muted-foreground uppercase tracking-wider bg-muted/60">
                            {lang}
                        </div>
                    )}
                    <pre className="px-3 py-2 overflow-x-auto font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {codeLines.join('\n')}
                    </pre>
                </div>
            );
            i++; // skip closing ```
            continue;
        }

        // Pipe table
        if (line.startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].startsWith('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            const parsed = parsePipeTable(tableLines);
            if (parsed) {
                elements.push(
                    <div key={`table-${i}`} className="my-2 overflow-x-auto rounded-lg border border-border/60">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                                <tr>
                                    {parsed.headers.map((h, j) => (
                                        <th key={j} className="text-left px-2 py-1.5 font-medium text-foreground/80 border-b border-border/40 whitespace-nowrap">
                                            {render(h, `th-${i}-${j}`)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {parsed.rows.map((row, ri) => (
                                    <tr key={ri} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                                        {row.map((cell, ci) => (
                                            <td key={ci}
                                                className="px-2 py-1 text-foreground/70 max-w-[180px] truncate"
                                                title={cell}
                                            >
                                                {render(cell, `td-${i}-${ri}-${ci}`)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
            continue;
        }

        // Heading
        if (/^#{1,3}\s/.test(line)) {
            const level = line.match(/^(#+)/)?.[1].length ?? 1;
            const content = line.replace(/^#+\s/, '');
            const cls = level === 1
                ? 'text-base font-semibold text-foreground mt-3 mb-1'
                : level === 2
                ? 'text-[15px] font-semibold text-foreground mt-2 mb-1'
                : 'text-[14px] font-medium text-foreground mt-1.5 mb-0.5';
            elements.push(<p key={`h${i}`} className={cls}>{render(content, `h${i}`)}</p>);
            i++;
            continue;
        }

        // Bullet list
        if (/^[-*]\s/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^[-*]\s/.test(lines[i])) {
                items.push(lines[i].slice(2));
                i++;
            }
            elements.push(
                <ul key={`ul${i}`} className="my-1 space-y-0.5">
                    {items.map((it, j) => (
                        <li key={j} className="flex gap-2 items-start text-[15px]">
                            <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                            <span className="leading-relaxed">{render(it, `li${i}-${j}`)}</span>
                        </li>
                    ))}
                </ul>
            );
            continue;
        }

        // Numbered list
        if (/^\d+\.\s/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
                items.push(lines[i].replace(/^\d+\.\s/, ''));
                i++;
            }
            elements.push(
                <ol key={`ol${i}`} className="my-1 space-y-0.5 list-none">
                    {items.map((it, j) => (
                        <li key={j} className="flex gap-2.5 items-start text-[15px]">
                            <span className="mt-0.5 text-xs text-muted-foreground/60 font-mono shrink-0 w-4 text-right">{j + 1}.</span>
                            <span className="leading-relaxed">{render(it, `oli${i}-${j}`)}</span>
                        </li>
                    ))}
                </ol>
            );
            continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            elements.push(<hr key={`hr${i}`} className="my-3 border-border/40" />);
            i++;
            continue;
        }

        // Blank line
        if (line.trim() === '') {
            elements.push(<div key={`gap${i}`} className="h-1.5" />);
            i++;
            continue;
        }

        // Normal paragraph
        elements.push(
            <p key={`p${i}`} className="text-[15px] leading-relaxed">
                {render(line, `p${i}`)}
            </p>
        );
        i++;
    }

    return (
        <div className={`flex flex-col gap-0.5 ${className ?? ''}`}>
            {elements}
        </div>
    );
}
