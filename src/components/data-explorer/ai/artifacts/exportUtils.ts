// =============================================================================
// Artifact export utilities — all client-side, no backend calls
// =============================================================================

/** Trigger a browser download for the given content. */
function downloadBlob(content: BlobPart, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Sanitize a title into a safe filename stem. */
function toFilename(title: string): string {
    return (title || 'export')
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 60);
}

// ─── CSV export ──────────────────────────────────────────────────────────────

function escapeCsvField(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function exportCsv(
    rows: Record<string, unknown>[],
    columns: { name: string }[],
    title?: string,
): void {
    const header = columns.map(c => escapeCsvField(c.name)).join(',');
    const body = rows.map(row =>
        columns.map(c => escapeCsvField(row[c.name])).join(','),
    ).join('\n');
    downloadBlob(`${header}\n${body}`, `${toFilename(title ?? 'data')}.csv`, 'text/csv;charset=utf-8');
}

// ─── JSON export ─────────────────────────────────────────────────────────────

export function exportJson(data: unknown, title?: string): void {
    const json = JSON.stringify(data, null, 2);
    downloadBlob(json, `${toFilename(title ?? 'data')}.json`, 'application/json');
}

// ─── TSV copy to clipboard (for Excel paste) ─────────────────────────────────

export async function copyTsv(
    rows: Record<string, unknown>[],
    columns: { name: string }[],
): Promise<void> {
    const header = columns.map(c => c.name).join('\t');
    const body = rows.map(row =>
        columns.map(c => {
            const v = row[c.name];
            return v === null || v === undefined ? '' : String(v);
        }).join('\t'),
    ).join('\n');
    await navigator.clipboard.writeText(`${header}\n${body}`);
}

// ─── Excel export (SpreadsheetML — opens natively in Excel/LibreOffice) ──────

function escXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function exportExcel(
    rows: Record<string, unknown>[],
    columns: { name: string }[],
    title?: string,
): void {
    const header = columns
        .map(c => `<Cell><Data ss:Type="String">${escXml(c.name)}</Data></Cell>`)
        .join('');
    const body = rows.map(row =>
        `<Row>${columns.map(c => {
            const v = row[c.name];
            const str = v === null || v === undefined ? '' : String(v);
            const type = typeof v === 'number' ? 'Number' : 'String';
            return `<Cell><Data ss:Type="${type}">${escXml(str)}</Data></Cell>`;
        }).join('')}</Row>`
    ).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="h"><Font ss:Bold="1"/></Style>
  </Styles>
  <Worksheet ss:Name="Data">
    <Table>
      <Row>${header.replace(/<Cell>/g, '<Cell ss:StyleID="h">')}</Row>
${body}
    </Table>
  </Worksheet>
</Workbook>`;
    downloadBlob(xml, `${toFilename(title ?? 'data')}.xls`, 'application/vnd.ms-excel');
}

// ─── PNG export (chart screenshot) ───────────────────────────────────────────

export async function exportChartPng(
    chartElement: HTMLElement | null,
    title?: string,
): Promise<void> {
    if (!chartElement) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(chartElement, {
        backgroundColor: null,
        scale: 2,
    });
    canvas.toBlob(blob => {
        if (!blob) return;
        downloadBlob(blob, `${toFilename(title ?? 'chart')}.png`, 'image/png');
    });
}
