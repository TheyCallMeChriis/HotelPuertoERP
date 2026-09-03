import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  BarChart3,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Download,
  Calendar,
  DollarSign,
  ShoppingCart,
} from 'lucide-react';

export const Reportes: React.FC = () => {
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [ventasData, setVentasData] = useState<any | null>(null);
  const [formasPagoData, setFormasPagoData] = useState<any[]>([]);
  const [diferenciasCaja, setDiferenciasCaja] = useState<any[]>([]);
  const [pestañaReporte, setPestañaReporte] = useState<'ventas' | 'pagos' | 'cajas'>('ventas');

  // Filtros de fecha
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const cargarDatos = async () => {
    const [resDash, resVtas, resFP, resDif] = await Promise.all([
      api.reportes.getDashboardKPIs(),
      api.reportes.getVentas({ fechaInicio: fechaInicio || undefined, fechaFin: fechaFin || undefined }),
      api.reportes.getFormasPago({ fechaInicio: fechaInicio || undefined, fechaFin: fechaFin || undefined }),
      api.reportes.getDiferenciasCaja(),
    ]);

    if (resDash.success) setDashboard(resDash.data);
    if (resVtas.success) setVentasData(resVtas.data);
    if (resFP.success) setFormasPagoData(resFP.data || []);
    if (resDif.success) setDiferenciasCaja(resDif.data || []);
  };

  useEffect(() => {
    cargarDatos();
  }, [fechaInicio, fechaFin]);

  // Exportar a CSV (REP-009)
  const exportarCSV = () => {
    let contenido = '';
    let nombreArchivo = 'reporte.csv';

    if (pestañaReporte === 'ventas') {
      nombreArchivo = `ventas_${Date.now()}.csv`;
      contenido = 'Consecutivo,Fecha,Punto de Venta,Cajero,Subtotal,Impuesto,Descuento,Total,Estado\n';
      ventasData?.ventas?.forEach((v: any) => {
        contenido += `"${v.consecutivo}","${new Date(v.createdAt).toLocaleString()}","${v.pointOfSale?.nombre}","${v.usuario?.nombre}",${v.subtotal},${v.impuesto},${v.descuento},${v.total},"${v.estado}"\n`;
      });
    } else if (pestañaReporte === 'pagos') {
      nombreArchivo = `formas_pago_${Date.now()}.csv`;
      contenido = 'Codigo,Nombre,Transacciones,Total Recaudado\n';
      formasPagoData.forEach((fp) => {
        contenido += `"${fp.codigo}","${fp.nombre}",${fp.cantidadTransacciones},${fp.total}\n`;
      });
    } else {
      nombreArchivo = `diferencias_caja_${Date.now()}.csv`;
      contenido = 'Caja,Cajero,Apertura,Cierre,Monto Esperado,Monto Contado,Diferencia,Tipo\n';
      diferenciasCaja.forEach((d) => {
        contenido += `"${d.caja}","${d.cajero}","${new Date(d.fechaApertura).toLocaleString()}","${new Date(d.fechaCierre).toLocaleString()}",${d.montoEsperado},${d.montoContado},${d.diferencia},"${d.tipo}"\n`;
      });
    }

    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', nombreArchivo);
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* TARJETAS DE INDICADORES OPERATIVOS DEL DÍA (REP-008) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-gray-500 font-semibold block">Ventas de Hoy</span>
            <span className="text-xl font-extrabold text-gray-900 mt-0.5 block">
              ₡{Number(dashboard?.ventasHoy || 0).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-gray-500 font-semibold block">Transacciones Hoy</span>
            <span className="text-xl font-extrabold text-gray-900 mt-0.5 block">
              {dashboard?.transaccionesHoy || 0}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-purple-100 text-purple-700 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-gray-500 font-semibold block">Ticket Promedio Hoy</span>
            <span className="text-xl font-extrabold text-gray-900 mt-0.5 block">
              ₡{Math.round(dashboard?.ticketPromedio || 0).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-gray-500 font-semibold block">Alertas de Bajo Stock</span>
            <span className="text-xl font-extrabold text-amber-700 mt-0.5 block">
              {dashboard?.alertasStockBajo || 0} artículos
            </span>
          </div>
        </div>
      </div>

      {/* PANELES DE REPORTES DETALLADOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Barra de Pestañas y Filtros */}
        <div className="p-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4 bg-gray-50/50">
          <div className="flex space-x-2">
            <button
              onClick={() => setPestañaReporte('ventas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                pestañaReporte === 'ventas'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              Ventas Detalladas
            </button>
            <button
              onClick={() => setPestañaReporte('pagos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                pestañaReporte === 'pagos'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              Recaudación por Medio de Pago
            </button>
            <button
              onClick={() => setPestañaReporte('cajas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                pestañaReporte === 'cajas'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              Diferencias de Caja (Arqueos)
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="border rounded p-1 text-xs bg-white"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="border rounded p-1 text-xs bg-white"
              />
            </div>

            <button
              onClick={exportarCSV}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Excel/CSV</span>
            </button>
          </div>
        </div>

        {/* CONTENIDO DEL REPORTE */}
        {pestañaReporte === 'ventas' && (
          <div>
            {ventasData?.resumen && (
              <div className="p-4 bg-emerald-50/50 border-b flex justify-around text-center text-xs">
                <div>
                  <span className="text-gray-500 block">Total Transacciones:</span>
                  <span className="font-extrabold text-sm">{ventasData.resumen.totalVentas}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Subtotal:</span>
                  <span className="font-extrabold text-sm">₡{ventasData.resumen.totalSubtotal.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">I.V.A:</span>
                  <span className="font-extrabold text-sm">₡{ventasData.resumen.totalImpuestos.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-emerald-700 font-bold block">Total Recaudado:</span>
                  <span className="font-black text-emerald-800 text-base">
                    ₡{ventasData.resumen.totalRecaudado.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Consecutivo</th>
                    <th className="px-6 py-3 text-left">Fecha</th>
                    <th className="px-6 py-3 text-left">POS</th>
                    <th className="px-6 py-3 text-left">Cajero</th>
                    <th className="px-6 py-3 text-right">Subtotal</th>
                    <th className="px-6 py-3 text-right">IVA</th>
                    <th className="px-6 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ventasData?.ventas?.map((v: any) => (
                    <tr key={v.id}>
                      <td className="px-6 py-3 font-mono font-bold text-gray-900">{v.consecutivo}</td>
                      <td className="px-6 py-3">{new Date(v.createdAt).toLocaleString()}</td>
                      <td className="px-6 py-3">{v.pointOfSale?.nombre}</td>
                      <td className="px-6 py-3">{v.usuario?.nombre}</td>
                      <td className="px-6 py-3 text-right">₡{Number(v.subtotal).toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">₡{Number(v.impuesto).toLocaleString()}</td>
                      <td className="px-6 py-3 text-right font-extrabold text-gray-900">
                        ₡{Number(v.total).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pestañaReporte === 'pagos' && (
          <div className="overflow-x-auto p-4">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">Medio de Pago</th>
                  <th className="px-6 py-3 text-left">Código Técnico</th>
                  <th className="px-6 py-3 text-right">Transacciones</th>
                  <th className="px-6 py-3 text-right">Total Recaudado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {formasPagoData.map((fp) => (
                  <tr key={fp.codigo}>
                    <td className="px-6 py-4 font-bold text-gray-800 flex items-center space-x-2">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      <span>{fp.nombre}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-500">{fp.codigo}</td>
                    <td className="px-6 py-4 text-right font-semibold">{fp.cantidadTransacciones}</td>
                    <td className="px-6 py-4 text-right font-extrabold text-sm text-emerald-700">
                      ₡{Number(fp.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pestañaReporte === 'cajas' && (
          <div className="overflow-x-auto p-4">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">Caja</th>
                  <th className="px-6 py-3 text-left">Cajero</th>
                  <th className="px-6 py-3 text-left">Cierre</th>
                  <th className="px-6 py-3 text-right">Saldo Esperado</th>
                  <th className="px-6 py-3 text-right">Monto Contado</th>
                  <th className="px-6 py-3 text-right">Diferencia</th>
                  <th className="px-6 py-3 text-center">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {diferenciasCaja.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-gray-400">
                      No se registran diferencias en los cierres de caja.
                    </td>
                  </tr>
                ) : (
                  diferenciasCaja.map((d) => (
                    <tr key={d.id}>
                      <td className="px-6 py-3 font-semibold text-gray-800">{d.caja}</td>
                      <td className="px-6 py-3">{d.cajero}</td>
                      <td className="px-6 py-3">{new Date(d.fechaCierre).toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">₡{d.montoEsperado.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right font-bold">₡{d.montoContado.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right font-extrabold text-red-600">
                        ₡{d.diferencia.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          {d.tipo}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
