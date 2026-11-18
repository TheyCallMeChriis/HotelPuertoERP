// Report table component.

import React from 'react';
import { ReportColumn, formatValue } from '../utils/report-export';

// Numeric columns are right-aligned
const numeric = (c: ReportColumn) => ['money', 'qty', 'int', 'percent'].includes(c.type ?? 'text');

// Report table: the same columns, rows and totals that are exported
export const ReportTable: React.FC<{
  columnas: ReportColumn[];
  filas: Array<Record<string, any>>;
  totales?: Record<string, unknown>;
  vacio?: string;
  resaltar?: (fila: Record<string, any>) => string | undefined;
}> = ({ columnas, filas, totales, vacio = 'Sin resultados para los filtros seleccionados', resaltar }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
    <table className="min-w-full text-xs">
      <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
        <tr>
          {columnas.map((c) => (
            <th key={c.key} className={`px-3 py-3 font-semibold whitespace-nowrap ${numeric(c) ? 'text-right' : 'text-left'}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {filas.length === 0 && (
          <tr><td colSpan={columnas.length} className="px-3 py-8 text-center text-gray-400">{vacio}</td></tr>
        )}
        {filas.map((f, i) => (
          <tr key={i} className={resaltar?.(f) ?? ''}>
            {columnas.map((c) => (
              <td key={c.key} className={`px-3 py-2 ${numeric(c) ? 'text-right tabular-nums whitespace-nowrap' : 'text-left'}`}>
                {React.isValidElement(f[c.key]) ? f[c.key] : formatValue(f[c.key], c.type)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totales && filas.length > 0 && (
        <tfoot className="bg-emerald-50 text-emerald-900 font-bold border-t-2 border-emerald-200">
          <tr>
            {columnas.map((c) => (
              <td key={c.key} className={`px-3 py-2.5 ${numeric(c) ? 'text-right tabular-nums whitespace-nowrap' : 'text-left'}`}>
                {formatValue(totales[c.key], c.type)}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);
