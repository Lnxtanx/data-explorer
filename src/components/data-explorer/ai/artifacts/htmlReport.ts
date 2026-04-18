// =============================================================================
// HTML Report Builder — generates self-contained HTML from artifact data
// =============================================================================

import type { AgentArtifact } from '@/hooks/useAIAgent';

/** Escape HTML special characters. */
function esc(value: unknown): string {
    if (value === null || value === undefined) return '<span class="null">null</span>';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Format a timestamp for the report footer. */
function timestamp(): string {
    return new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
:root { --bg: #fafafa; --fg: #18181b; --muted: #71717a; --border: #e4e4e7; --accent: #2563eb; --green: #16a34a; --amber: #d97706; --red: #dc2626; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #09090b; --fg: #fafafa; --muted: #a1a1aa; --border: #27272a; --accent: #60a5fa; --green: #4ade80; --amber: #fbbf24; --red: #f87171; }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); padding: 2rem; max-width: 1000px; margin: 0 auto; line-height: 1.5; }
h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.25rem; }
.meta { font-size: 0.75rem; color: var(--muted); margin-bottom: 1.5rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; margin-bottom: 1rem; }
th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border); font-weight: 500; color: var(--muted); white-space: nowrap; }
td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: color-mix(in srgb, var(--fg) 3%, transparent); }
.mono { font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; font-size: 0.75rem; }
.null { color: var(--muted); opacity: 0.4; font-style: italic; font-size: 0.7rem; }
.right { text-align: right; }
.badge { display: inline-block; font-size: 0.625rem; font-weight: 600; letter-spacing: 0.05em; padding: 0.15rem 0.4rem; border-radius: 0.25rem; }
.badge-high { background: color-mix(in srgb, var(--red) 12%, transparent); color: var(--red); }
.badge-medium { background: color-mix(in srgb, var(--amber) 12%, transparent); color: var(--amber); }
.badge-low { background: color-mix(in srgb, var(--muted) 12%, transparent); color: var(--muted); }
.badge-pk { background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent); }
.badge-idx { background: color-mix(in srgb, var(--green) 10%, transparent); color: var(--green); }
.score { font-size: 2.5rem; font-weight: 700; }
.score-bar { height: 6px; border-radius: 3px; background: var(--border); margin: 0.5rem 0; }
.score-fill { height: 100%; border-radius: 3px; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.stat-card { border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem; }
.stat-name { font-weight: 500; font-size: 0.875rem; }
.stat-type { font-size: 0.625rem; color: var(--muted); }
.stat-row { display: flex; gap: 1rem; font-size: 0.75rem; margin-top: 0.25rem; }
.stat-row span:first-child { color: var(--muted); }
.null-bar { height: 4px; border-radius: 2px; background: var(--border); margin-top: 0.375rem; }
.null-fill { height: 100%; border-radius: 2px; }
.metric-group { margin-bottom: 1rem; }
.metric-label { font-size: 0.625rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.375rem; }
.metric-tags { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.metric-tag { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 0.375rem; }
.tag-id { background: #ede9fe; color: #7c3aed; } .tag-dim { background: #dbeafe; color: #2563eb; }
.tag-mea { background: #d1fae5; color: #059669; } .tag-ts { background: #fef3c7; color: #d97706; }
@media (prefers-color-scheme: dark) { .tag-id { background: #2e1065; color: #c4b5fd; } .tag-dim { background: #172554; color: #93c5fd; } .tag-mea { background: #052e16; color: #6ee7b7; } .tag-ts { background: #422006; color: #fcd34d; } }
.join-row { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.8125rem; }
.join-row:last-child { border-bottom: none; }
.arrow { color: var(--muted); padding: 0 0.25rem; }
.join-col { color: var(--accent); }
.sql-block { background: color-mix(in srgb, var(--fg) 4%, transparent); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem 1rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin-top: 1.5rem; }
footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.6875rem; color: var(--muted); }
`;

// ─── Section builders ────────────────────────────────────────────────────────

function buildTableSection(artifact: AgentArtifact): string {
    const rows = artifact.rows ?? [];
    const cols = artifact.columns ?? [];
    if (rows.length === 0 || cols.length === 0) return '<p>No data.</p>';

    const thead = cols.map(c => `<th>${esc(c.name)}</th>`).join('');
    const tbody = rows.map(row =>
        '<tr>' + cols.map(c => `<td class="mono">${esc(row[c.name])}</td>`).join('') + '</tr>'
    ).join('\n');

    return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
<p class="meta">${rows.length} row${rows.length !== 1 ? 's' : ''}, ${cols.length} column${cols.length !== 1 ? 's' : ''}</p>`;
}

function buildStatsSection(artifact: AgentArtifact): string {
    const stats = artifact.stats ?? [];
    const cards = stats.map(s => {
        const badges: string[] = [];
        if (s.isPrimaryKey) badges.push('<span class="badge badge-pk">PK</span>');
        if (s.isIndexed) badges.push('<span class="badge badge-idx">IDX</span>');

        const nullPct = s.nullPercent ?? 0;
        const nullColor = nullPct === 0 ? 'var(--green)' : nullPct < 20 ? 'var(--amber)' : 'var(--red)';

        let minMaxAvg = '';
        if (s.min !== null || s.max !== null || s.avg !== null) {
            const parts: string[] = [];
            if (s.min !== null) parts.push(`<span>min</span> <span class="mono">${esc(s.min)}</span>`);
            if (s.max !== null) parts.push(`<span>max</span> <span class="mono">${esc(s.max)}</span>`);
            if (s.avg !== null) parts.push(`<span>avg</span> <span class="mono">${s.avg}</span>`);
            minMaxAvg = `<div class="stat-row">${parts.join(' &nbsp; ')}</div>`;
        }

        return `<div class="stat-card">
  <div style="display:flex;justify-content:space-between;align-items:baseline">
    <span class="stat-name">${esc(s.name)}</span>
    <span class="stat-type mono">${esc(s.dataType)}</span>
  </div>
  ${badges.length ? '<div style="margin-top:0.25rem">' + badges.join(' ') + '</div>' : ''}
  ${minMaxAvg}
  <div style="font-size:0.6875rem;color:var(--muted);margin-top:0.25rem">${s.distinctCount} distinct</div>
  <div class="null-bar"><div class="null-fill" style="width:${Math.max(nullPct, nullPct > 0 ? 1 : 0)}%;background:${nullColor}"></div></div>
  <div style="font-size:0.625rem;color:var(--muted);margin-top:0.125rem">${nullPct.toFixed(1)}% null</div>
  ${s.topValues && s.topValues.length > 0 ? `<div style="font-size:0.6875rem;margin-top:0.25rem"><span style="color:var(--muted)">top:</span> <span class="mono">${s.topValues.map(v => esc(v)).join(', ')}</span></div>` : ''}
</div>`;
    }).join('\n');

    return `<div class="stat-grid">${cards}</div>
<p class="meta">${artifact.totalRows != null ? artifact.totalRows.toLocaleString() + ' total rows, ' : ''}${stats.length} columns analyzed</p>`;
}

function buildAnomaliesSection(artifact: AgentArtifact): string {
    const anomalies = artifact.anomalies ?? [];
    if (anomalies.length === 0) return '<p>No anomalies detected.</p>';

    const sevBadge = (s: string) => `<span class="badge badge-${s}">${s.toUpperCase()}</span>`;
    const rows = anomalies.map(a =>
        `<tr><td class="mono">${esc(a.column)}</td><td>${esc(a.type.replace(/_/g, ' '))}</td><td>${sevBadge(a.severity)}</td><td class="right">${a.count}</td><td>${esc(a.explanation)}</td></tr>`
    ).join('\n');

    return `<p class="meta">${artifact.totalAnomalies ?? anomalies.length} anomal${(artifact.totalAnomalies ?? anomalies.length) === 1 ? 'y' : 'ies'} across ${artifact.scannedColumns ?? 0} columns</p>
<table><thead><tr><th>Column</th><th>Type</th><th>Severity</th><th class="right">Count</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buildQualitySection(artifact: AgentArtifact): string {
    const score = artifact.score ?? 0;
    const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
    const issues = artifact.issues ?? [];
    const sevBadge = (s: string) => `<span class="badge badge-${s}">${s.toUpperCase()}</span>`;

    let issueRows = '';
    if (issues.length > 0) {
        issueRows = '<table><thead><tr><th>Severity</th><th>Column</th><th>Issue</th><th class="right">Rows</th><th>Recommendation</th></tr></thead><tbody>' +
            issues.map(i =>
                `<tr><td>${sevBadge(i.severity)}</td><td class="mono">${esc(i.column)}</td><td>${esc(i.issueType.replace(/_/g, ' '))}</td><td class="right">${i.affectedRows}</td><td>${esc(i.recommendation)}</td></tr>`
            ).join('\n') + '</tbody></table>';
    }

    return `<div style="display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.75rem">
  <span class="score" style="color:${scoreColor}">${score}</span><span style="color:var(--muted);font-size:0.875rem">/100</span>
</div>
<div class="score-bar"><div class="score-fill" style="width:${score}%;background:${scoreColor}"></div></div>
${artifact.summary ? `<p style="margin:0.75rem 0;font-size:0.8125rem;color:var(--muted)">${esc(artifact.summary)}</p>` : ''}
${issueRows}`;
}

function buildJoinsSection(artifact: AgentArtifact): string {
    const paths = artifact.paths ?? [];
    if (paths.length === 0) return '<p>No join paths found.</p>';

    return paths.map(p =>
        `<div class="join-row">
  <span class="mono">${esc(p.from)}</span><span style="color:var(--muted)">.</span><span class="mono join-col">${esc(p.fromColumn)}</span>
  <span class="arrow">&rarr;</span>
  <span class="mono">${esc(p.to)}</span><span style="color:var(--muted)">.</span><span class="mono join-col">${esc(p.toColumn)}</span>
  <span style="margin-left:auto;font-size:0.6875rem;color:var(--muted)">${p.joinType === 'foreign_key' ? 'FK' : 'heuristic'} &middot; ${Math.round(p.confidence * 100)}%</span>
</div>`
    ).join('\n');
}

function buildMetricsSection(artifact: AgentArtifact): string {
    const groups = [
        { items: artifact.identifiers ?? [], label: 'Identifiers', cls: 'tag-id' },
        { items: artifact.dimensions ?? [], label: 'Dimensions', cls: 'tag-dim' },
        { items: artifact.measures ?? [], label: 'Measures', cls: 'tag-mea' },
        { items: artifact.timestamps ?? [], label: 'Timestamps', cls: 'tag-ts' },
    ];

    return groups
        .filter(g => g.items.length > 0)
        .map(g => `<div class="metric-group">
  <div class="metric-label">${g.label}</div>
  <div class="metric-tags">${g.items.map(c => `<span class="metric-tag mono ${g.cls}">${esc(c)}</span>`).join('')}</div>
</div>`).join('\n');
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function buildHtmlReport(artifact: AgentArtifact): string {
    const artType = artifact.type as string;
    const title = artifact.title || (artType === 'table' ? 'Query Results' : artType.charAt(0).toUpperCase() + artType.slice(1) + ' Report');

    let body: string;
    switch (artType) {
        case 'stats':      body = buildStatsSection(artifact); break;
        case 'anomalies':  body = buildAnomaliesSection(artifact); break;
        case 'quality':    body = buildQualitySection(artifact); break;
        case 'joins':      body = buildJoinsSection(artifact); break;
        case 'metrics':    body = buildMetricsSection(artifact); break;
        default:           body = buildTableSection(artifact); break;
    }

    const sqlBlock = artifact.sql
        ? `<div class="sql-block"><code class="mono">${esc(artifact.sql)}</code></div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Resona AI</title>
<style>${CSS}</style>
</head>
<body>
<h1>${esc(title)}</h1>
<p class="meta">Generated by Resona AI &middot; ${timestamp()}</p>
${body}
${sqlBlock}
<footer>Resona AI &middot; Schema Weaver Data Explorer</footer>
</body>
</html>`;
}

/** Build an executive summary HTML with key metrics, highlights, and a data preview. */
export function buildExecutiveHtml(artifact: AgentArtifact): string {
    const title = artifact.title || 'Executive Summary';
    const rows = artifact.rows ?? [];
    const cols = artifact.columns ?? [];

    // Compute column summaries
    const summaries = cols.map(c => {
        const vals = rows.map(r => r[c.name]).filter(v => v !== null && v !== undefined);
        const isNum = vals.length > 0 && vals.every(v => !isNaN(Number(v)));
        const numVals = isNum ? vals.map(Number) : [];
        const nullCount = rows.length - vals.length;

        return {
            name: c.name,
            isNumeric: isNum,
            nonNull: vals.length,
            nullCount,
            ...(isNum && numVals.length > 0 ? {
                min: Math.min(...numVals),
                max: Math.max(...numVals),
                avg: numVals.reduce((a, b) => a + b, 0) / numVals.length,
                sum: numVals.reduce((a, b) => a + b, 0),
            } : {}),
            ...(!isNum && vals.length > 0 ? {
                uniqueCount: new Set(vals.map(String)).size,
                topValue: (() => {
                    const freq = new Map<string, number>();
                    vals.forEach(v => freq.set(String(v), (freq.get(String(v)) ?? 0) + 1));
                    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
                })(),
            } : {}),
        };
    });

    const numCols = summaries.filter(s => s.isNumeric);
    const catCols = summaries.filter(s => !s.isNumeric);

    // Key metrics banner
    let metrics = `<div style="display:flex;gap:2.5rem;margin-bottom:1.5rem">
  <div><span style="font-size:2rem;font-weight:700">${rows.length}</span> <span style="color:var(--muted);font-size:0.8125rem">rows</span></div>
  <div><span style="font-size:2rem;font-weight:700">${cols.length}</span> <span style="color:var(--muted);font-size:0.8125rem">columns</span></div>
  ${numCols.length > 0 ? `<div><span style="font-size:2rem;font-weight:700">${numCols.length}</span> <span style="color:var(--muted);font-size:0.8125rem">numeric</span></div>` : ''}
</div>`;

    // Numeric highlights
    let numSection = '';
    if (numCols.length > 0) {
        const cards = numCols.map(c => `<div class="stat-card">
  <div class="stat-name">${esc(c.name)}</div>
  <div class="stat-row"><span>min</span> <span class="mono">${c.min?.toLocaleString()}</span></div>
  <div class="stat-row"><span>max</span> <span class="mono">${c.max?.toLocaleString()}</span></div>
  <div class="stat-row"><span>avg</span> <span class="mono">${c.avg?.toFixed(2)}</span></div>
  <div class="stat-row"><span>sum</span> <span class="mono">${c.sum?.toLocaleString()}</span></div>
</div>`).join('\n');
        numSection = `<h2 style="font-size:0.6875rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin:1rem 0 0.5rem">Numeric Highlights</h2>
<div class="stat-grid">${cards}</div>`;
    }

    // Categorical summary
    let catSection = '';
    if (catCols.length > 0) {
        const catRows = catCols.map(c =>
            `<tr><td class="mono">${esc(c.name)}</td><td>${c.uniqueCount} unique</td><td class="mono">${esc(c.topValue ?? '')}</td><td class="right">${c.nullCount > 0 ? c.nullCount + ' null' : '—'}</td></tr>`
        ).join('\n');
        catSection = `<h2 style="font-size:0.6875rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin:1rem 0 0.5rem">Categorical Summary</h2>
<table><thead><tr><th>Column</th><th>Unique Values</th><th>Top Value</th><th class="right">Nulls</th></tr></thead><tbody>${catRows}</tbody></table>`;
    }

    // Data preview (first 10 rows)
    let preview = '';
    if (rows.length > 0 && cols.length > 0) {
        const previewRows = rows.slice(0, 10);
        const thead = cols.map(c => `<th>${esc(c.name)}</th>`).join('');
        const tbody = previewRows.map(row =>
            '<tr>' + cols.map(c => `<td class="mono">${esc(row[c.name])}</td>`).join('') + '</tr>'
        ).join('\n');
        preview = `<h2 style="font-size:0.6875rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin:1.5rem 0 0.5rem">Data Preview</h2>
<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
${rows.length > 10 ? `<p class="meta">+ ${rows.length - 10} more rows</p>` : ''}`;
    }

    const sqlBlock = artifact.sql
        ? `<div class="sql-block"><code class="mono">${esc(artifact.sql)}</code></div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Executive Summary — Resona AI</title>
<style>${CSS}</style>
</head>
<body>
<h1>${esc(title)}</h1>
<p class="meta">Executive Summary &middot; Generated by Resona AI &middot; ${timestamp()}</p>
${metrics}
${numSection}
${catSection}
${preview}
${sqlBlock}
<footer>Resona AI &middot; Schema Weaver Data Explorer</footer>
</body>
</html>`;
}

export function exportExecutiveHtml(artifact: AgentArtifact, title?: string): void {
    const html = buildExecutiveHtml(artifact);
    const filename = (title || artifact.title || 'executive-summary')
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 60);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_executive.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function exportHtml(artifact: AgentArtifact, title?: string): void {
    const html = buildHtmlReport(artifact);
    const filename = (title || artifact.title || 'report')
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 60);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
