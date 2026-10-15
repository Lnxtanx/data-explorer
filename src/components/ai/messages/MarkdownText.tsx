// ─── Markdown + Table + Math + Callout renderer ─────────────────────────────
// Supports: **bold**, *italic*, `code`, ## headings, bullet/numbered lists,
// pipe tables (with right-aligned numbers & copy), fenced code blocks,
// KaTeX mathematical formulas ($inline$ & $$block$$), and styled callout alerts.
//
// PERF: the parse below is a full re-split + re-walk of `text` plus a
// `katex.renderToString` per math span, so it is O(len(text)) per render. This
// component is memoized on a SHALLOW prop compare so that a parent re-render
// (a streamed `delta`, a `status` change, an artifact arriving) does not re-parse
// every message in the chat. `text` is a string, so shallow compare is exactly
// right: the only prop that changes during streaming is `text` itself.

import { memo, useState } from 'react';
import katex from 'katex';
import {
    Copy, Check, Info, Lightbulb,
    AlertCircle, AlertTriangle, ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TablePreviewHoverCard } from './TablePreviewHoverCard';

interface MarkdownTextProps {
    text: string;
    className?: string;
    onTableClick?: (tableName: string) => void;
    connectionId?: string;
    availableTables?: string[];
}

export type ColumnAlignment = 'left' | 'center' | 'right';

// Check if an expression inside $...$ is mathematical notation vs a dollar currency amount
function isLikelyMath(expr: string): boolean {
    const trimmed = expr.trim();
    if (!trimmed) return false;
    // Pure numbers and currency intervals (e.g. "50", "100.00", "50 to 100") are currency, not math
    if (/^\d+([.,]\d+)?(\s+(to|-)\s+\d+([.,]\d+)?)?$/.test(trimmed)) return false;
    // Contains mathematical symbols or variables
    return /[a-zA-Z\\_=^+\-*/<>]/.test(trimmed);
}

// Render inline marks: **bold**, [link](url), `code`, $math$, *italic*, and @mentions
function renderInline(
    line: string,
    baseKey: string | number,
    onTableClick?: (tableName: string) => void,
    connectionId?: string,
    availableTables?: string[]
): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*(.+?)\*\*|\[(.+?)\]\(((?:https?:\/\/|\/|\.\/)[^\s)]+)\)|`([^`]+)`|\$([^$\n]+?)\$|\*([^*]+)\*|@([a-zA-Z0-9_]+))/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(line)) !== null) {
        if (m.index > last) parts.push(line.slice(last, m.index));

        if (m[2] !== undefined) {
            // **bold**
            parts.push(<strong key={`${baseKey}-b${m.index}`}>{m[2]}</strong>);
        } else if (m[3] !== undefined && m[4] !== undefined) {
            // [link](url)
            const linkText = m[3];
            const href = m[4];
            const isDownload = /\.(csv|xlsx?|json|pdf|tsv|txt)$/i.test(href) || /\/api\/ai\/files\//.test(href);
            parts.push(
                <a
                    key={`${baseKey}-a${m.index}`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...(isDownload ? { download: linkText } : {})}
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 underline underline-offset-2 font-medium transition-colors cursor-pointer"
                >
                    {linkText}
                </a>
            );
        } else if (m[5] !== undefined) {
            // `code`
            parts.push(
                <code
                    key={`${baseKey}-c${m.index}`}
                    className="bg-muted/60 rounded px-1 py-0.5 text-[12.5px] font-mono"
                >
                    {m[5]}
                </code>
            );
        } else if (m[6] !== undefined) {
            // $math$
            const mathContent = m[6];
            if (isLikelyMath(mathContent)) {
                try {
                    const html = katex.renderToString(mathContent, {
                        displayMode: false,
                        throwOnError: false,
                    });
                    parts.push(
                        <span
                            key={`${baseKey}-m${m.index}`}
                            className="inline-math px-0.5"
                            dangerouslySetInnerHTML={{ __html: html }}
                        />
                    );
                } catch {
                    parts.push(`$${mathContent}$`);
                }
            } else {
                parts.push(`$${mathContent}$`);
            }
        } else if (m[7] !== undefined) {
            // *italic*
            parts.push(<em key={`${baseKey}-i${m.index}`}>{m[7]}</em>);
        } else if (m[8] !== undefined) {
            // @mention
            const tableName = m[8];
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
                    <TablePreviewHoverCard
                        key={`${baseKey}-hc${m.index}`}
                        tableName={tableName}
                        connectionId={connectionId}
                        trigger={button}
                        align="start"
                        side="top"
                        sideOffset={12}
                    />
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

// Parse a pipe table block into header + rows + column alignments
function parsePipeTable(lines: string[]): {
    headers: string[];
    rows: string[][];
    alignments: ColumnAlignment[];
} | null {
    if (lines.length < 2) return null;
    const headerLine = lines[0].trim();
    const separatorLine = lines[1].trim();
    if (!/^\|?[\s\-:]+(\|[\s\-:]+)*\|?$/.test(separatorLine)) return null;

    const parseRow = (l: string) =>
        l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

    const headers = parseRow(headerLine);
    const rows = lines.slice(2).map(parseRow);
    const sepParts = parseRow(separatorLine);

    const alignments: ColumnAlignment[] = headers.map((_, colIdx) => {
        const marker = sepParts[colIdx] || '';
        const leftColon = marker.startsWith(':');
        const rightColon = marker.endsWith(':');
        if (leftColon && rightColon) return 'center';
        if (rightColon) return 'right';
        if (leftColon) return 'left';

        // Auto-detect numeric columns: if majority of rows are numbers/currency/percentages
        const sampleCells = rows.map(r => r[colIdx] || '').filter(Boolean);
        if (sampleCells.length > 0) {
            const numericCount = sampleCells.filter(c => /^-?\$?[\d,]+(\.\d+)?%?$/.test(c.trim())).length;
            if (numericCount / sampleCells.length >= 0.7) {
                return 'right';
            }
        }
        return 'left';
    });

    return { headers, rows, alignments };
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function MarkdownTable({
    headers,
    rows,
    alignments,
    rawLines,
    renderCell,
    tableKey,
}: {
    headers: string[];
    rows: string[][];
    alignments: ColumnAlignment[];
    rawLines: string[];
    renderCell: (text: string, key: string) => React.ReactNode;
    tableKey: string;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const rawMarkdown = rawLines.join('\n');
        try {
            const htmlTable = `<table><thead><tr>${headers.map((h, idx) => `<th style="text-align:${alignments[idx] || 'left'}">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, idx) => `<td style="text-align:${alignments[idx] || 'left'}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

            if (navigator.clipboard && window.ClipboardItem) {
                const blobHtml = new Blob([htmlTable], { type: 'text/html' });
                const blobText = new Blob([rawMarkdown], { type: 'text/plain' });
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': blobHtml,
                        'text/plain': blobText,
                    }),
                ]);
            } else {
                await navigator.clipboard.writeText(rawMarkdown);
            }
        } catch {
            await navigator.clipboard.writeText(rawMarkdown);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="my-3 w-full max-w-full overflow-x-auto rounded-xl border border-border/60 bg-card/60 shadow-sm">
            <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/50 border-b border-border/40">
                    <tr>
                        {headers.map((h, j) => {
                            const isLast = j === headers.length - 1;
                            const align = alignments[j] ?? 'left';
                            return (
                                <th
                                    key={j}
                                    className={cn(
                                        "px-4 py-2.5 font-semibold text-foreground/90 text-xs tracking-tight",
                                        align === 'right' && "text-right",
                                        align === 'center' && "text-center",
                                        align === 'left' && "text-left"
                                    )}
                                >
                                    {isLast ? (
                                        <div className={cn("inline-flex items-center gap-1.5", align === 'right' && "justify-end")}>
                                            <span>{renderCell(h, `${tableKey}-th-${j}`)}</span>
                                            <button
                                                type="button"
                                                onClick={handleCopy}
                                                className={cn(
                                                    "inline-flex items-center justify-center p-1 rounded transition-colors cursor-pointer",
                                                    copied
                                                        ? "text-emerald-500"
                                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                                )}
                                                title={copied ? "Copied" : "Copy table"}
                                                aria-label="Copy table"
                                            >
                                                {copied ? (
                                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        renderCell(h, `${tableKey}-th-${j}`)
                                    )}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/25">
                    {rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-muted/20 transition-colors">
                            {row.map((cell, ci) => {
                                const align = alignments[ci] ?? 'left';
                                return (
                                    <td
                                        key={ci}
                                        className={cn(
                                            "px-4 py-2.5 text-foreground/90 font-normal text-[13px] leading-relaxed break-words whitespace-normal align-top",
                                            align === 'right' && "text-right font-mono text-[12.5px] tabular-nums whitespace-nowrap",
                                            align === 'center' && "text-center",
                                            align === 'left' && "text-left"
                                        )}
                                    >
                                        {renderCell(cell, `${tableKey}-td-${ri}-${ci}`)}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Math Block Component ($$ formula $$)
function MathBlock({ tex }: { tex: string }) {
    const [copied, setCopied] = useState(false);
    let html = '';
    try {
        html = katex.renderToString(tex, {
            displayMode: true,
            throwOnError: false,
        });
    } catch {
        html = '';
    }

    const handleCopy = async () => {
        await navigator.clipboard.writeText(tex);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group/math my-2.5 p-3 rounded-lg border border-border/40 bg-muted/20 overflow-x-auto text-center">
            <button
                type="button"
                onClick={handleCopy}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover/math:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/60"
                title="Copy TeX"
            >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            </button>
            {html ? (
                <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
                <pre className="font-mono text-xs text-foreground/80">{tex}</pre>
            )}
        </div>
    );
}

// Callout / Alert Block Component (> [!NOTE] ...)
function CalloutBlock({
    lines,
    renderInline,
    baseKey,
}: {
    lines: string[];
    renderInline: (text: string, key: string) => React.ReactNode;
    baseKey: string;
}) {
    if (lines.length === 0) return null;

    const firstLine = lines[0].trim();
    const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INSIGHT)\]\s*(.*)$/i);

    if (alertMatch) {
        const rawType = alertMatch[1].toLowerCase();
        const inlineTitleText = alertMatch[2];
        const contentLines = inlineTitleText ? [inlineTitleText, ...lines.slice(1)] : lines.slice(1);

        const type = (rawType === 'insight' ? 'tip' : rawType) as 'note' | 'tip' | 'important' | 'warning' | 'caution';
        const styles = {
            note: {
                border: 'border-blue-500/40 bg-blue-500/5 text-blue-950 dark:text-blue-200',
                titleColor: 'text-blue-600 dark:text-blue-400',
                Icon: Info,
                title: 'Note',
            },
            tip: {
                border: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200',
                titleColor: 'text-emerald-600 dark:text-emerald-400',
                Icon: Lightbulb,
                title: rawType === 'insight' ? 'Insight' : 'Tip',
            },
            important: {
                border: 'border-purple-500/40 bg-purple-500/5 text-purple-950 dark:text-purple-200',
                titleColor: 'text-purple-600 dark:text-purple-400',
                Icon: AlertCircle,
                title: 'Important',
            },
            warning: {
                border: 'border-amber-500/40 bg-amber-500/5 text-amber-950 dark:text-amber-200',
                titleColor: 'text-amber-600 dark:text-amber-400',
                Icon: AlertTriangle,
                title: 'Warning',
            },
            caution: {
                border: 'border-red-500/40 bg-red-500/5 text-red-950 dark:text-red-200',
                titleColor: 'text-red-600 dark:text-red-400',
                Icon: ShieldAlert,
                title: 'Caution',
            },
        }[type];

        return (
            <div className={cn('my-2.5 rounded-lg border p-3 leading-relaxed shadow-sm', styles.border)}>
                <div className="flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wider mb-1">
                    <styles.Icon className={cn('w-3.5 h-3.5 shrink-0', styles.titleColor)} />
                    <span className={styles.titleColor}>{styles.title}</span>
                </div>
                <div className="text-foreground/85 text-[13.5px] space-y-1">
                    {contentLines.map((line, idx) => (
                        <p key={idx}>{renderInline(line, `${baseKey}-c-${idx}`)}</p>
                    ))}
                </div>
            </div>
        );
    }

    // Standard blockquote
    return (
        <blockquote className="my-2 border-l-2 border-primary/40 pl-3 py-1 text-muted-foreground italic text-[14px] leading-relaxed">
            {lines.map((line, idx) => (
                <p key={idx}>{renderInline(line, `${baseKey}-q-${idx}`)}</p>
            ))}
        </blockquote>
    );
}

function CodeBlock({ lang, code }: { lang?: string; code: string }) {
    const [copied, setCopied] = useState(false);

    if (lang === 'math') {
        return <MathBlock tex={code} />;
    }

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="my-2 rounded-lg border border-border/60 bg-muted/40 overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 py-1 border-b border-border/40 bg-muted/60">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    {lang || 'code'}
                </span>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded cursor-pointer"
                    title="Copy code"
                >
                    {copied ? (
                        <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500">Copied</span>
                        </>
                    ) : (
                        <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                        </>
                    )}
                </button>
            </div>
            <pre className="px-3 py-2 overflow-x-auto font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {code}
            </pre>
        </div>
    );
}

function MarkdownTextImpl({ text, className, onTableClick, connectionId, availableTables }: MarkdownTextProps) {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    const render = (t: string, key: string) => renderInline(t, key, onTableClick, connectionId, availableTables);

    while (i < lines.length) {
        const line = lines[i];

        // Block Math ($$ ... $$)
        if (line.trim().startsWith('$$')) {
            const firstLine = line.trim().slice(2).trim();
            if (firstLine.endsWith('$$') && firstLine.length > 2) {
                // Single-line block math
                const expr = firstLine.slice(0, -2).trim();
                elements.push(<MathBlock key={`math-${i}`} tex={expr} />);
                i++;
                continue;
            }
            const mathLines: string[] = [];
            if (firstLine) mathLines.push(firstLine);
            i++;
            while (i < lines.length && !lines[i].trim().endsWith('$$')) {
                mathLines.push(lines[i]);
                i++;
            }
            if (i < lines.length) {
                const lastLine = lines[i].trim().slice(0, -2).trim();
                if (lastLine) mathLines.push(lastLine);
                i++;
            }
            elements.push(<MathBlock key={`math-${i}`} tex={mathLines.join('\n')} />);
            continue;
        }

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
                <CodeBlock key={`code-${i}`} lang={lang} code={codeLines.join('\n')} />
            );
            i++; // skip closing ```
            continue;
        }

        // Callout or Blockquote (> ...)
        if (line.trim().startsWith('>')) {
            const quoteLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
                i++;
            }
            if (quoteLines.length > 0) {
                elements.push(
                    <CalloutBlock
                        key={`callout-${i}`}
                        lines={quoteLines}
                        renderInline={render}
                        baseKey={`callout-${i}`}
                    />
                );
            }
            continue;
        }

        // Pipe table
        if (line.trim().startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i].trim());
                i++;
            }
            const parsed = parsePipeTable(tableLines);
            if (parsed) {
                elements.push(
                    <MarkdownTable
                        key={`table-${i}`}
                        headers={parsed.headers}
                        rows={parsed.rows}
                        alignments={parsed.alignments}
                        rawLines={tableLines}
                        renderCell={render}
                        tableKey={`tbl-${i}`}
                    />
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
                            <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-foreground/70 shrink-0" />
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
                            <span className="mt-0.5 text-xs text-muted-foreground font-medium font-mono shrink-0 w-4 text-right">{j + 1}.</span>
                            <span className="leading-relaxed">{render(it, `oli${i}-${j}`)}</span>
                        </li>
                    ))}
                </ol>
            );
            continue;
        }

        // Horizontal rule or divider line (e.g. ---, ___, ===, ═══, ───)
        if (/^([─═\-_=*])\1{2,}$/.test(line.trim())) {
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
            <p key={`p${i}`} className="text-[15px] leading-relaxed break-words [overflow-wrap:anywhere]">
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

/**
 * Memoized markdown renderer.
 *
 * A shallow prop compare is sufficient and intentional: every prop is either a
 * primitive (`text`, `className`, `connectionId`), a stable `useCallback` from
 * the parent, or a stable array reference. This lets a streamed answer re-parse
 * only the bubble that is actually growing instead of every message on screen.
 */
export const MarkdownText = memo(MarkdownTextImpl);
MarkdownText.displayName = 'MarkdownText';
