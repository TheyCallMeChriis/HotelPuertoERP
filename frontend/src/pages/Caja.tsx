import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Unlock,
  AlertCircle,
  FileText,
  Clock,
  User,
} from 'lucide-react';

export const Caja: React.FC = () => {
  const [cajas, setCajas] = useState<any[]>([]);
  const [cajaSeleccionada, setCajaSeleccionada] = useState<string>('');
  const [turnoActivo, setTurnoActivo] = useState<any | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Modales
  const [modalApertura, setModalApertura] = useState(false);
  const [montoApertura, setMontoApertura] = useState<number>(25000);
  const [notasApertura, setNotasApertura] = useState('');

  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [tipoMovimiento, setTipoMovimiento] = useState<'ENTRADA_EXTRAORDINARIA' | 'SALIDA_EXTRAORDINARIA'>('ENTRADA_EXTRAORDINARIA');
  const [montoMovimiento, setMontoMovimiento] = useState<number>(0);
  const [motivoMovimiento, setMotivoMovimiento] = useState('');

  const [modalCierre, setModalCierre] = useState(false);
  const [montoContado, setMontoContado] = useState<number>(0);
  const [notasCierre, setNotasCierre] = useState('');
  const [resumenCierre, setResumenCierre] = useState<any | null>(null);

  const cargarCajas = async () => {
    const res = await api.catalogos.getPuntosVenta();
    if (res.success && res.data) {
      const distinctCajas: any[] = [];
      const ids = new Set();
      for (const p of res.data) {
        if (p.caja && !ids.has(p.caja.id)) {
          ids.add(p.caja.id);
          distinctCajas.push(p.caja);
        }
      }
      setCajas(distinctCajas);
      if (distinctCajas.length > 0 && !cajaSeleccionada) {
        setCajaSeleccionada(distinctCajas[0].id);
      }
    }
  };

  const cargarEstadoCaja = async (id: string) => {
    setLoading(true);
    const [resTurno, resHist] = await Promise.all([
      api.caja.getTurnoActivo(id),
      api.caja.getHistorico(id),
    ]);
    setTurnoActivo(resTurno.success && resTurno.data ? resTurno.data : null);
    setHistorico(resHist.success && resHist.data ? resHist.data : []);
    setLoading(false);
  };

  useEffect(() => {
    cargarCajas();
  }, []);

  useEffect(() => {
    if (cajaSeleccionada) {
      cargarEstadoCaja(cajaSeleccionada);
    }
  }, [cajaSeleccionada]);

  // Apertura
  const handleAbrirCaja = async () => {
    if (montoApertura < 0) return;
    const res = await api.caja.abrirCaja({
      cajaId: cajaSeleccionada,
      montoInicial: montoApertura,
      notas: notasApertura,
    });
    if (res.success) {
      setModalApertura(false);
      cargarEstadoCaja(cajaSeleccionada);
    } else {
      alert(res.message || 'Error al abrir caja');
    }
  };

  // Movimiento Extraordinario
  const handleRegistrarMovimiento = async () => {
    if (montoMovimiento <= 0 || !motivoMovimiento) {
      alert('Debe indicar monto y motivo');
      return;
    }
    const res = await api.caja.registrarMovimiento({
      cashShiftId: turnoActivo.id,
      tipo: tipoMovimiento,
      monto: montoMovimiento,
      motivo: motivoMovimiento,
    });
    if (res.success) {
      setModalMovimiento(false);
      setMontoMovimiento(0);
      setMotivoMovimiento('');
      cargarEstadoCaja(cajaSeleccionada);
    } else {
      alert(res.message || 'Error al registrar movimiento');
    }
  };

  // Cierre de Caja
  const handleCerrarCaja = async () => {
    const res = await api.caja.cerrarCaja({
      cashShiftId: turnoActivo.id,
      montoContado,
      notas: notasCierre,
    });
    if (res.success) {
      setResumenCierre(res.data.resumen);
      setModalCierre(false);
      cargarEstadoCaja(cajaSeleccionada);
    } else {
      alert(res.message || 'Error al cerrar caja');
    }
  };

  // Cálculos en vivo para el turno activo
  let totalEfectivoVentas = 0;
  let totalOtrosMedios = 0;
  if (turnoActivo?.ventas) {
    for (const v of turnoActivo.ventas) {
      for (const p of v.payments) {
        if (p.paymentMethod.codigo === 'EFECTIVO') totalEfectivoVentas += Number(p.monto);
        else totalOtrosMedios += Number(p.monto);
      }
    }
  }

  let entradasExtra = 0;
  let salidasExtra = 0;
  if (turnoActivo?.movements) {
    for (const m of turnoActivo.movements) {
      if (m.tipo === 'ENTRADA_EXTRAORDINARIA') entradasExtra += Number(m.monto);
      if (m.tipo === 'SALIDA_EXTRAORDINARIA') salidasExtra += Number(m.monto);
    }
  }

  const fondoInicial = turnoActivo ? Number(turnoActivo.montoInicial) : 0;
  const saldoEsperadoEfectivo = fondoInicial + totalEfectivoVentas + entradasExtra - salidasExtra;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Selector de Caja y Estado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold text-gray-500 uppercase">Seleccionar Caja:</label>
          <select
            value={cajaSeleccionada}
            onChange={(e) => setCajaSeleccionada(e.target.value)}
            className="text-sm font-semibold text-gray-800 bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.ubicacion})
              </option>
            ))}
          </select>
        </div>

        {/* Acciones principales */}
        <div className="flex space-x-3">
          {!turnoActivo ? (
            <button
              onClick={() => setModalApertura(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow flex items-center space-x-1.5"
            >
              <Unlock className="w-4 h-4" />
              <span>Abrir Turno de Caja</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setModalMovimiento(true)}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg flex items-center space-x-1"
              >
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>Movimiento Extraordinario</span>
              </button>
              <button
                onClick={() => {
                  setMontoContado(saldoEsperadoEfectivo);
                  setModalCierre(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow flex items-center space-x-1.5"
              >
                <Lock className="w-4 h-4" />
                <span>Cierre de Caja y Arqueo</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* DETALLE DEL TURNO ACTUAL O MENSAJE DE CAJA CERRADA */}
      {turnoActivo ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs text-gray-500 font-semibold block">Fondo Inicial Apertura</span>
            <span className="text-2xl font-extrabold text-gray-900 mt-1 block">
              ₡{fondoInicial.toLocaleString()}
            </span>
            <div className="flex items-center text-[11px] text-gray-400 mt-2">
              <Clock className="w-3.5 h-3.5 mr-1" />
              <span>{new Date(turnoActivo.fechaApertura).toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs text-gray-500 font-semibold block">Ventas en Efectivo</span>
            <span className="text-2xl font-extrabold text-emerald-600 mt-1 block">
              ₡{totalEfectivoVentas.toLocaleString()}
            </span>
            <span className="text-[11px] text-gray-400 mt-2 block">
              {turnoActivo.ventas?.length || 0} transacciones
            </span>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs text-gray-500 font-semibold block">Movimientos Extraordinarios</span>
            <div className="mt-1 space-y-0.5">
              <span className="text-xs text-emerald-600 font-bold block">
                +₡{entradasExtra.toLocaleString()} entradas
              </span>
              <span className="text-xs text-red-600 font-bold block">
                -₡{salidasExtra.toLocaleString()} salidas
              </span>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl shadow-sm">
            <span className="text-xs text-emerald-800 font-bold block uppercase tracking-wider">
              Saldo Esperado en Efectivo
            </span>
            <span className="text-2xl font-black text-emerald-700 mt-1 block">
              ₡{saldoEsperadoEfectivo.toLocaleString()}
            </span>
            <span className="text-[11px] text-emerald-600 mt-2 block font-medium">
              Cajero: {turnoActivo.usuario?.nombre}
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-amber-900">La caja seleccionada no tiene un turno abierto</h3>
          <p className="text-xs text-amber-700 mt-1 max-w-md mx-auto">
            Para que los cajeros puedan facturar y registrar cobros en los puntos de venta asociados, debe realizar la apertura de turno con un fondo inicial en efectivo.
          </p>
          <button
            onClick={() => setModalApertura(true)}
            className="mt-4 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow inline-flex items-center space-x-1.5"
          >
            <Unlock className="w-4 h-4" />
            <span>Abrir Caja Ahora</span>
          </button>
        </div>
      )}

      {/* HISTORIAL DE CIERRES ANTERIORES (CAJ-008) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-800">Historial de Turnos y Arqueos de Caja</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Apertura</th>
                <th className="px-6 py-3 text-left">Cierre</th>
                <th className="px-6 py-3 text-left">Cajero</th>
                <th className="px-6 py-3 text-right">Fondo Inicial</th>
                <th className="px-6 py-3 text-right">Monto Esperado</th>
                <th className="px-6 py-3 text-right">Monto Contado</th>
                <th className="px-6 py-3 text-right">Diferencia</th>
                <th className="px-6 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {historico.map((h) => {
                const dif = Number(h.diferencia || 0);
                return (
                  <tr key={h.id}>
                    <td className="px-6 py-3">{new Date(h.fechaApertura).toLocaleString()}</td>
                    <td className="px-6 py-3">{h.fechaCierre ? new Date(h.fechaCierre).toLocaleString() : 'En curso'}</td>
                    <td className="px-6 py-3 font-semibold text-gray-800">{h.usuario?.nombre}</td>
                    <td className="px-6 py-3 text-right">₡{Number(h.montoInicial).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      {h.montoEsperado !== null ? `₡${Number(h.montoEsperado).toLocaleString()}` : '-'}
                    </td>
                    <td className="px-6 py-3 text-right font-bold">
                      {h.montoContado !== null ? `₡${Number(h.montoContado).toLocaleString()}` : '-'}
                    </td>
                    <td className="px-6 py-3 text-right font-bold">
                      {h.diferencia !== null ? (
                        <span
                          className={
                            dif === 0 ? 'text-gray-600' : dif > 0 ? 'text-blue-600' : 'text-red-600'
                          }
                        >
                          {dif > 0 ? `+₡${dif.toLocaleString()}` : `₡${dif.toLocaleString()}`}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          h.estado === 'ABIERTA'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {h.estado}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL APERTURA DE CAJA */}
      {modalApertura && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
              <Unlock className="w-5 h-5 text-emerald-600" />
              <span>Apertura de Turno de Caja</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Fondo Inicial en Efectivo (₡)
              </label>
              <input
                type="number"
                value={montoApertura}
                onChange={(e) => setMontoApertura(Number(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm font-bold focus:ring-emerald-500 focus:border-emerald-500"
                min={0}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Notas u Observaciones</label>
              <textarea
                value={notasApertura}
                onChange={(e) => setNotasApertura(e.target.value)}
                placeholder="Observaciones de apertura..."
                className="w-full border rounded-lg p-2 text-xs"
                rows={2}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setModalApertura(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleAbrirCaja}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow"
              >
                Confirmar Apertura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MOVIMIENTO EXTRAORDINARIO */}
      {modalMovimiento && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-gray-900">Registrar Entrada / Salida de Efectivo</h3>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Movimiento</label>
              <select
                value={tipoMovimiento}
                onChange={(e: any) => setTipoMovimiento(e.target.value)}
                className="w-full border rounded-lg p-2 text-xs"
              >
                <option value="ENTRADA_EXTRAORDINARIA">Entrada Extraordinaria (Ingreso manual)</option>
                <option value="SALIDA_EXTRAORDINARIA">Salida Extraordinaria (Egreso / Pago a proveedor / Caja chica)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Monto (₡)</label>
              <input
                type="number"
                value={montoMovimiento}
                onChange={(e) => setMontoMovimiento(Number(e.target.value))}
                className="w-full border rounded-lg p-2 text-sm font-bold"
                min={1}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Motivo Obligatorio</label>
              <textarea
                value={motivoMovimiento}
                onChange={(e) => setMotivoMovimiento(e.target.value)}
                placeholder="Indique el motivo del movimiento..."
                className="w-full border rounded-lg p-2 text-xs"
                rows={2}
                required
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setModalMovimiento(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegistrarMovimiento}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow"
              >
                Guardar Movimiento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CIERRE DE CAJA Y ARQUEO */}
      {modalCierre && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2 text-amber-600">
              <Lock className="w-5 h-5" />
              <span>Arqueo y Cierre de Caja</span>
            </h3>

            <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span>Saldo esperado en efectivo:</span>
                <span className="font-bold">₡{saldoEsperadoEfectivo.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Efectivo Físico Contado en Caja (₡)
              </label>
              <input
                type="number"
                value={montoContado}
                onChange={(e) => setMontoContado(Number(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-base font-black text-gray-900"
                required
              />
              <div className="mt-1 text-xs font-bold">
                Diferencia:{' '}
                <span
                  className={
                    montoContado - saldoEsperadoEfectivo === 0
                      ? 'text-emerald-600'
                      : montoContado - saldoEsperadoEfectivo > 0
                      ? 'text-blue-600'
                      : 'text-red-600'
                  }
                >
                  {montoContado - saldoEsperadoEfectivo === 0
                    ? '₡0 (Caja Cuadrada)'
                    : montoContado - saldoEsperadoEfectivo > 0
                    ? `+₡${(montoContado - saldoEsperadoEfectivo).toLocaleString()} (Sobrante)`
                    : `-₡${Math.abs(montoContado - saldoEsperadoEfectivo).toLocaleString()} (Faltante)`}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Notas de Cierre</label>
              <textarea
                value={notasCierre}
                onChange={(e) => setNotasCierre(e.target.value)}
                placeholder="Observaciones finales del arqueo..."
                className="w-full border rounded-lg p-2 text-xs"
                rows={2}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setModalCierre(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleCerrarCaja}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow"
              >
                Confirmar Cierre de Caja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORTE DE CIERRE FINALIZADO */}
      {resumenCierre && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-lg text-gray-900 border-b pb-2">Reporte de Cierre de Caja</h3>
            <div className="text-xs space-y-2">
              <div className="flex justify-between">
                <span>Fondo Inicial:</span>
                <span className="font-bold">₡{resumenCierre.fondoInicial.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Ventas Efectivo:</span>
                <span className="font-bold text-emerald-600">₡{resumenCierre.totalEfectivoVentas.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Ventas Tarjeta:</span>
                <span className="font-bold">₡{resumenCierre.totalesPorMedioPago.tarjeta.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Ventas SINPE:</span>
                <span className="font-bold">₡{resumenCierre.totalesPorMedioPago.sinpe.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Cargos Habitación:</span>
                <span className="font-bold">₡{resumenCierre.totalesPorMedioPago.cargoHabitacion.toLocaleString()}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-extrabold text-sm">
                <span>Diferencia Arqueo:</span>
                <span
                  className={
                    resumenCierre.diferencia === 0
                      ? 'text-gray-800'
                      : resumenCierre.diferencia > 0
                      ? 'text-blue-600'
                      : 'text-red-600'
                  }
                >
                  ₡{resumenCierre.diferencia.toLocaleString()} ({resumenCierre.tipoDiferencia})
                </span>
              </div>
            </div>

            <button
              onClick={() => setResumenCierre(null)}
              className="w-full py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs"
            >
              Aceptar y Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
