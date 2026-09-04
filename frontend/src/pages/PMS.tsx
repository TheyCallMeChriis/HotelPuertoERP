import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Hotel, Send, RefreshCw, CheckCircle, XCircle, AlertTriangle, FileText } from 'lucide-react';

export const PMS: React.FC = () => {
  const [habitaciones, setHabitaciones] = useState<any[]>([]);
  const [conciliacion, setConciliacion] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Simulador de envío
  const [habitacionId, setHabitacionId] = useState('');
  const [montoCargo, setMontoCargo] = useState(15000);
  const [simularError, setSimularError] = useState(false);
  const [resultadoSimulacion, setResultadoSimulacion] = useState<any | null>(null);

  const cargarDatos = async () => {
    setLoading(true);
    const [resHabs, resConc] = await Promise.all([
      api.pms.getHabitacionesOcupadas(),
      api.pms.getConciliacion(),
    ]);

    if (resHabs.success) {
      setHabitaciones(resHabs.data || []);
      if (resHabs.data?.length > 0 && !habitacionId) {
        setHabitacionId(resHabs.data[0].id);
      }
    }
    if (resConc.success) setConciliacion(resConc.data || null);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Enviar cargo simulado
  const handleEnviarCargo = async () => {
    const hab = habitaciones.find((h) => h.id === habitacionId);
    if (!hab || !hab.huesped) {
      alert('Seleccione una habitación ocupada con un huésped activo');
      return;
    }

    const res = await api.pms.enviarCargo({
      roomId: hab.id,
      guestId: hab.huesped.id,
      monto: montoCargo,
      simularError,
    });

    setResultadoSimulacion(res);
    cargarDatos();
  };

  // Reintentar cargo fallido
  const handleReintentar = async (cargoId: string) => {
    const res = await api.pms.reintentarCargo(cargoId);
    if (res.success) {
      alert('Reintento procesado con éxito en el PMS sin duplicar la transacción');
      cargarDatos();
    } else {
      alert(res.message || 'Error al reintentar');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
          <Hotel className="w-5 h-5 text-emerald-600" />
          <span>Capa Desacoplada de Integración Hotelera / Simulador PMS</span>
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Permite recibir cargos a habitaciones de huéspedes, garantizar idempotencia (PMS-005), simular caídas de red y reintentar transacciones sin duplicación.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SIMULADOR INTERACTIVO */}
        <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="font-bold text-sm text-gray-800 border-b pb-2">
            Simulador de Cargos a Habitación
          </h3>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Habitación Huésped</label>
            <select
              value={habitacionId}
              onChange={(e) => setHabitacionId(e.target.value)}
              className="w-full border rounded-lg p-2 text-xs bg-gray-50"
            >
              {habitaciones.map((h) => (
                <option key={h.id} value={h.id}>
                  Habitación {h.numero} ({h.tipo}) - Huésped: {h.huesped?.nombreCompleto || 'Desocupada'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Monto a Imputar (₡)</label>
            <input
              type="number"
              value={montoCargo}
              onChange={(e) => setMontoCargo(Number(e.target.value))}
              className="w-full border rounded-lg p-2 text-sm font-bold text-gray-900"
              min={100}
            />
          </div>

          {/* Switch de Simulación de Error */}
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-amber-900 block">Simular Fallo de Conexión PMS</span>
              <span className="text-[11px] text-amber-700">Para probar encolamiento y reintento (PMS-007)</span>
            </div>
            <input
              type="checkbox"
              checked={simularError}
              onChange={(e) => setSimularError(e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
            />
          </div>

          <button
            onClick={handleEnviarCargo}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow flex items-center justify-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>Enviar Cargo a PMS</span>
          </button>

          {/* Resultado de la simulación */}
          {resultadoSimulacion && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                resultadoSimulacion.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-center space-x-1.5 font-bold mb-1">
                {resultadoSimulacion.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span>{resultadoSimulacion.message}</span>
              </div>
              {resultadoSimulacion.data && (
                <div className="font-mono text-[10px] space-y-0.5 mt-1 text-gray-700">
                  <div>UUID: {resultadoSimulacion.data.transaccionUuid}</div>
                  <div>Estado: {resultadoSimulacion.data.estadoPMS}</div>
                  {resultadoSimulacion.esDuplicadoEvitado && (
                    <div className="text-blue-700 font-bold">
                      🛡️ Idempotencia activa: No se creó un cargo repetido.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TABLA DE CONCILIACIÓN PMS (PMS-008) */}
        <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-800">Reporte de Conciliación POS vs PMS</h3>
            <button onClick={cargarDatos} className="text-xs text-emerald-600 hover:underline flex items-center space-x-1">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </button>
          </div>

          {/* Resumen de indicadores de conciliación */}
          {conciliacion?.resumen && (
            <div className="grid grid-cols-3 gap-2 p-4 bg-gray-50 border-b text-center text-xs">
              <div>
                <span className="text-gray-500 block">Total Cargos:</span>
                <span className="font-bold text-gray-900 text-base">{conciliacion.resumen.totalCargos}</span>
              </div>
              <div>
                <span className="text-emerald-600 font-bold block">Confirmados:</span>
                <span className="font-bold text-emerald-700 text-base">{conciliacion.resumen.confirmados}</span>
              </div>
              <div>
                <span className="text-red-600 font-bold block">Fallidos/Pendientes:</span>
                <span className="font-bold text-red-700 text-base">{conciliacion.resumen.fallidos}</span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left">Hab.</th>
                  <th className="px-4 py-3 text-left">Huésped</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-left">UUID Transacción</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {conciliacion?.cargos?.map((c: any) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-bold text-gray-900">{c.room?.numero}</td>
                    <td className="px-4 py-3">{c.guest?.nombreCompleto}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-gray-900">
                      ₡{Number(c.monto).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-gray-500 truncate max-w-[130px]">
                      {c.transaccionUuid}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.estadoPMS === 'CONFIRMADO'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {c.estadoPMS}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.estadoPMS === 'ERROR' && (
                        <button
                          onClick={() => handleReintentar(c.id)}
                          className="text-xs text-blue-600 font-bold hover:underline"
                        >
                          Reintentar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
