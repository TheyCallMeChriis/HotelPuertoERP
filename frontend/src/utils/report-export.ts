// Report export to PDF, Excel (.xlsx) and CSV (GEN-009, REP-009).
// All three formats use exactly the same columns, rows, totals and filters shown on screen.

export type ColumnType = 'text' | 'money' | 'qty' | 'int' | 'percent' | 'datetime' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
}

export interface ReportExport {
  titulo: string;
  filtros: string[]; // human-readable descriptions of the applied filters
  columnas: ReportColumn[];
  filas: Array<Record<string, unknown>>;
  totales?: Record<string, unknown>; // optional final totals row, keyed by column key
  usuario?: string;
}

// Numeric columns are right-aligned and exported as numbers
const isNumeric = (t?: ColumnType) => t === 'money' || t === 'qty' || t === 'int' || t === 'percent';

// Formats a value for screen and PDF according to its column type (Costa Rica locale).
export function formatValue(value: unknown, type: ColumnType = 'text', currency = '₡'): string {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'money': {
      const n = Number(value);
      const abs = Math.abs(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${n < 0 ? '-' : ''}${currency}${abs}`;
    }
    case 'qty':
      return Number(value).toLocaleString('es-CR', { maximumFractionDigits: 3 });
    case 'int':
      return Number(value).toLocaleString('es-CR', { maximumFractionDigits: 0 });
    case 'percent':
      return `${Number(value).toLocaleString('es-CR', { maximumFractionDigits: 1 })}%`;
    case 'datetime':
      return new Date(String(value)).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
    case 'date':
      return new Date(String(value)).toLocaleDateString('es-CR');
    default:
      return String(value);
  }
}

// File name: report title plus timestamp, without accents or spaces
function fileBase(titulo: string) {
  const slug = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${slug}_${stamp}`;
}

// Triggers a browser download for a generated file
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "Generated on … by …" line printed on every export
const generado = (usuario?: string) =>
  `Generado: ${new Date().toLocaleString('es-CR')}${usuario ? ` por ${usuario}` : ''}`;

// ---------- PDF ----------
export async function exportPDF(r: ReportExport) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const landscape = r.columnas.length > 6;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const width = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Hotel Puerto Limón · Sistema POS-ERP', 40, 40);
  doc.setFontSize(12);
  doc.text(r.titulo, 40, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const lineas = [generado(r.usuario), r.filtros.length ? `Filtros: ${r.filtros.join(' · ')}` : 'Filtros: ninguno'];
  doc.text(doc.splitTextToSize(lineas.join('\n'), width - 80), 40, 76);

  // The standard PDF font has no ₡ glyph, so "CRC" is used instead.
  const cell = (c: ReportColumn, v: unknown) => formatValue(v, c.type, 'CRC ');
  autoTable(doc, {
    startY: 100,
    head: [r.columnas.map((c) => c.label)],
    body: r.filas.map((f) => r.columnas.map((c) => cell(c, f[c.key]))),
    foot: r.totales ? [r.columnas.map((c) => cell(c, r.totales![c.key]))] : undefined,
    showFoot: 'lastPage',
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [236, 253, 245], textColor: [6, 78, 59], fontStyle: 'bold' },
    columnStyles: Object.fromEntries(r.columnas.map((c, i) => [i, { halign: isNumeric(c.type) ? 'right' : 'left' }])),
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pages = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.text(`Página ${pages}`, width - 80, doc.internal.pageSize.getHeight() - 20);
    },
  });
  doc.save(`${fileBase(r.titulo)}.pdf`);
}

// ---------- Excel (.xlsx) ----------
export async function exportXLSX(r: ReportExport) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const formatFor = (t?: ColumnType) =>
    t === 'money' ? '#,##0.00' : t === 'qty' ? '#,##0.###' : t === 'int' ? '#,##0' : t === 'percent' ? '0.0' : t === 'datetime' ? 'dd/mm/yyyy hh:mm' : t === 'date' ? 'dd/mm/yyyy' : undefined;
  const toCell = (c: ReportColumn, v: unknown, bold = false): any => {
    if (v === null || v === undefined || v === '') return bold ? { value: '', fontWeight: 'bold' } : null;
    if (isNumeric(c.type)) return { value: Number(v), type: Number, format: formatFor(c.type), ...(bold ? { fontWeight: 'bold' } : {}) };
    if (c.type === 'datetime' || c.type === 'date') {
      // Excel has no time zones: the Costa Rica local time is stored exactly as shown on screen
      const d = new Date(String(v));
      return { value: new Date(d.getTime() - d.getTimezoneOffset() * 60000), type: Date, format: formatFor(c.type) };
    }
    return { value: String(v), type: String, ...(bold ? { fontWeight: 'bold' } : {}) };
  };
  const data: any[] = [
    [{ value: `Hotel Puerto Limón · ${r.titulo}`, fontWeight: 'bold' }],
    [{ value: generado(r.usuario) }],
    [{ value: r.filtros.length ? `Filtros: ${r.filtros.join(' · ')}` : 'Filtros: ninguno' }],
    [],
    r.columnas.map((c) => ({ value: c.label, fontWeight: 'bold', backgroundColor: '#D1FAE5' })),
    ...r.filas.map((f) => r.columnas.map((c) => toCell(c, f[c.key]))),
  ];
  if (r.totales) data.push(r.columnas.map((c) => toCell(c, r.totales![c.key], true)));
  const blob = await writeXlsxFile(data, {
    sheet: 'Reporte',
    columns: r.columnas.map((c) => ({ width: isNumeric(c.type) ? 16 : c.type === 'datetime' ? 18 : 28 })),
  }).toBlob();
  download(blob, `${fileBase(r.titulo)}.xlsx`);
}

// ---------- CSV ----------
export function exportCSV(r: ReportExport) {
  // ";" separator and UTF-8 BOM so Spanish-locale Excel opens columns and accents correctly
  const esc = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const raw = (c: ReportColumn, v: unknown) => {
    if (v === null || v === undefined) return '';
    if (isNumeric(c.type)) return String(Number(v)).replace('.', ',');
    if (c.type === 'datetime' || c.type === 'date') return formatValue(v, c.type);
    return String(v);
  };
  const lines = [
    esc(`${r.titulo} - ${generado(r.usuario)}`),
    esc(r.filtros.length ? `Filtros: ${r.filtros.join(' | ')}` : 'Filtros: ninguno'),
    '',
    r.columnas.map((c) => esc(c.label)).join(';'),
    ...r.filas.map((f) => r.columnas.map((c) => esc(raw(c, f[c.key]))).join(';')),
  ];
  if (r.totales) lines.push(r.columnas.map((c) => esc(raw(c, r.totales![c.key]))).join(';'));
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${fileBase(r.titulo)}.csv`);
}
