import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { ShieldCheck, Search, Filter, Clock, User, FileCode } from 'lucide-react';

export const Auditoria: React.FC = () => {
  const [registros, setRegistros] = useState<any[]>([]);
  const [accionFiltro, setAccionFiltro] = useState('');
  const [entidadFiltro, setEntidadFiltro] = useState('');
  const [loading, setLoading] = useState(false);

  const cargarBitacora = async () => {
    setLoading(true);
    const res = await api.auditoria.getBitacora({
      accion: accionFiltro || undefined,
      entidad: entidadFiltro || undefined,
    });
    if (res.success) {
      setRegistros(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    cargarBitacora();
  }, [accionFiltro, entidadFiltro]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Encabezado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <span>Bitácora Inmutable de Auditoría y Seguridad</span>
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Registro técnico y cronológico de todas las operaciones sensibles: inicios de sesión, ventas, anulaciones, movimientos de caja y ajustes de inventario (SEG-003, SEG-004).
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap gap-4 items-center">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Filtrar por Acción:</label>
          <select
            value={accionFiltro}
            onChange={(e) => setAccionFiltro(e.target.value)}
            className="text-xs border rounded-lg p-2 bg-gray-50"
          >
            <option value="">Todas las Acciones...</option>
            <option value="LOGIN">LOGIN</option>
            <option value="CREAR_VENTA">CREAR_VENTA</option>
            <option value="ANULAR_VENTA">ANULAR_VENTA</option>
            <option value="APERTURA_CAJA">APERTURA_CAJA</option>
            <option value="CIERRE_CAJA">CIERRE_CAJA</option>
            <option value="MOVIMIENTO_INVENTARIO">MOVIMIENTO_INVENTARIO</option>
            <option value="TRASLADO_BODEGA">TRASLADO_BODEGA</option>
            <option value="AJUSTE_INVENTARIO">AJUSTE_INVENTARIO</option>
            <option value="CARGO_PMS_ENVIADO">CARGO_PMS_ENVIADO</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Entidad:</label>
          <select
            value={entidadFiltro}
            onChange={(e) => setEntidadFiltro(e.target.value)}
            className="text-xs border rounded-lg p-2 bg-gray-50"
          >
            <option value="">Todas las Entidades...</option>
            <option value="Sale">Sale (Ventas)</option>
            <option value="CashShift">CashShift (Cajas)</option>
            <option value="InventoryMovement">InventoryMovement (Kardex)</option>
            <option value="WarehouseTransfer">WarehouseTransfer (Traslados)</option>
            <option value="RoomCharge">RoomCharge (PMS)</option>
            <option value="User">User (Usuarios)</option>
          </select>
        </div>

        <button
          onClick={cargarBitacora}
          className="self-end px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg"
        >
          Refrescar
        </button>
      </div>

      {/* Tabla de Auditoría */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Fecha / Hora</th>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">Acción</th>
                <th className="px-4 py-3 text-left">Entidad Afectada</th>
                <th className="px-4 py-3 text-left">Detalle de Operación</th>
                <th className="px-4 py-3 text-left">IP Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {registros.map((r) => {
                const esAlerta = ['ANULAR_VENTA', 'AJUSTE_NEGATIVO'].includes(r.accion);
                return (
                  <tr key={r.id} className={esAlerta ? 'bg-red-50/30' : ''}>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600 whitespace-nowrap">
                      {new Date(r.fecha).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800 whitespace-nowrap">
                      {r.user?.nombre || r.user?.username || 'Sistema'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          esAlerta
                            ? 'bg-red-100 text-red-800'
                            : r.accion === 'CREAR_VENTA'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {r.accion}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">{r.entidad}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-gray-700 max-w-md truncate">
                      {r.detalle || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-[10px]">{r.ip || '127.0.0.1'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
