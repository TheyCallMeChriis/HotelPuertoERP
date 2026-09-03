import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  Package,
  ArrowRightLeft,
  Sliders,
  AlertTriangle,
  History,
  PlusCircle,
  FileSpreadsheet,
} from 'lucide-react';

export const Inventario: React.FC = () => {
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [bodegaActual, setBodegaActual] = useState<string>('');
  const [existencias, setExistencias] = useState<any[]>([]);
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);
  const [loading, setLoading] = useState(false);

  // Modal Kardex
  const [kardexModal, setKardexModal] = useState<any[] | null>(null);
  const [productoKardex, setProductoKardex] = useState<any | null>(null);

  // Modal Traslado
  const [modalTraslado, setModalTraslado] = useState(false);
  const [trasladoDestino, setTrasladoDestino] = useState('');
  const [trasladoProducto, setTrasladoProducto] = useState('');
  const [trasladoCantidad, setTrasladoCantidad] = useState(1);
  const [trasladoNotas, setTrasladoNotas] = useState('');

  // Modal Ajuste
  const [modalAjuste, setModalAjuste] = useState(false);
  const [ajusteTipo, setAjusteTipo] = useState<'POSITIVO' | 'NEGATIVO'>('POSITIVO');
  const [ajusteProducto, setAjusteProducto] = useState('');
  const [ajusteCantidad, setAjusteCantidad] = useState(1);
  const [ajusteMotivo, setAjusteMotivo] = useState('');

  const cargarBodegas = async () => {
    const res = await api.catalogos.getBodegas();
    if (res.success && res.data) {
      setBodegas(res.data);
      if (res.data.length > 0 && !bodegaActual) {
        setBodegaActual(res.data[0].id);
      }
    }
  };

  const cargarExistencias = async () => {
    setLoading(true);
    const res = await api.inventario.getExistencias({
      warehouseId: bodegaActual || undefined,
      soloBajoMinimo,
    });
    if (res.success) {
      setExistencias(res.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    cargarBodegas();
  }, []);

  useEffect(() => {
    if (bodegaActual) {
      cargarExistencias();
    }
  }, [bodegaActual, soloBajoMinimo]);

  // Ver Kardex
  const verKardex = async (prod: any) => {
    setProductoKardex(prod);
    const res = await api.inventario.getKardex(prod.id, bodegaActual);
    if (res.success) {
      setKardexModal(res.data || []);
    }
  };

  // Realizar Traslado
  const handleTraslado = async () => {
    if (!trasladoDestino || !trasladoProducto || trasladoCantidad <= 0) {
      alert('Complete todos los campos del traslado');
      return;
    }
    const res = await api.inventario.realizarTraslado({
      warehouseOrigenId: bodegaActual,
      warehouseDestinoId: trasladoDestino,
      items: [{ productId: trasladoProducto, cantidad: trasladoCantidad }],
      notas: trasladoNotas,
    });
    if (res.success) {
      alert('Traslado realizado exitosamente');
      setModalTraslado(false);
      cargarExistencias();
    } else {
      alert(res.message || 'Error al realizar traslado');
    }
  };

  // Realizar Ajuste
  const handleAjuste = async () => {
    if (!ajusteProducto || ajusteCantidad <= 0 || !ajusteMotivo) {
      alert('Producto, cantidad y motivo obligatorio son requeridos');
      return;
    }
    const res = await api.inventario.realizarAjuste({
      warehouseId: bodegaActual,
      tipo: ajusteTipo,
      motivo: ajusteMotivo,
      items: [{ productId: ajusteProducto, cantidad: ajusteCantidad }],
    });
    if (res.success) {
      alert('Ajuste de inventario aplicado exitosamente');
      setModalAjuste(false);
      cargarExistencias();
    } else {
      alert(res.message || 'Error al realizar ajuste');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Barra de control */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold text-gray-500 uppercase">Bodega:</label>
          <select
            value={bodegaActual}
            onChange={(e) => setBodegaActual(e.target.value)}
            className="text-sm font-semibold text-gray-800 bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre} ({b.codigo})
              </option>
            ))}
          </select>

          <label className="flex items-center space-x-1.5 text-xs text-gray-600 cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={soloBajoMinimo}
              onChange={(e) => setSoloBajoMinimo(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span className="font-semibold text-red-600">Solo productos con stock bajo</span>
          </label>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setModalTraslado(true)}
            className="px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center space-x-1 transition"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Traslado entre Bodegas</span>
          </button>
          <button
            onClick={() => setModalAjuste(true)}
            className="px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold flex items-center space-x-1 transition"
          >
            <Sliders className="w-4 h-4" />
            <span>Ajuste de Inventario</span>
          </button>
        </div>
      </div>

      {/* Tabla de existencias */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-sm font-bold text-gray-800">Existencias Actuales en Bodega</h3>
          <span className="text-xs text-gray-400">{existencias.length} artículos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Código</th>
                <th className="px-6 py-3 text-left">Producto</th>
                <th className="px-6 py-3 text-left">Categoría</th>
                <th className="px-6 py-3 text-right">Stock Disponible</th>
                <th className="px-6 py-3 text-right">Stock Mínimo</th>
                <th className="px-6 py-3 text-center">Estado</th>
                <th className="px-6 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {existencias.map((e) => {
                const cant = Number(e.cantidad);
                const min = Number(e.stockMinimo);
                const bajo = cant <= min;

                return (
                  <tr key={e.id} className={bajo ? 'bg-red-50/40' : ''}>
                    <td className="px-6 py-3 font-mono font-bold text-gray-900">{e.product?.codigo}</td>
                    <td className="px-6 py-3 font-bold text-gray-800">{e.product?.nombre}</td>
                    <td className="px-6 py-3 text-gray-500">{e.product?.categoria?.nombre}</td>
                    <td className="px-6 py-3 text-right font-extrabold text-sm text-gray-900">{cant}</td>
                    <td className="px-6 py-3 text-right text-gray-500">{min}</td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          bajo
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {bajo ? '⚠️ BAJO STOCK' : 'ÓPTIMO'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <button
                        onClick={() => verKardex(e.product)}
                        className="text-xs text-emerald-700 font-semibold hover:underline flex items-center justify-center space-x-1 mx-auto"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Ver Kardex</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL KARDEX INMUTABLE (INV-008) */}
      {kardexModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-gray-900">
                  Kardex de Producto: {productoKardex?.nombre}
                </h3>
                <span className="text-xs text-gray-500 font-mono">Código: {productoKardex?.codigo}</span>
              </div>
              <button
                onClick={() => setKardexModal(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold uppercase sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Fecha / Hora</th>
                    <th className="px-4 py-2.5 text-left">Tipo Movimiento</th>
                    <th className="px-4 py-2.5 text-left">Documento Ref.</th>
                    <th className="px-4 py-2.5 text-right">Cantidad</th>
                    <th className="px-4 py-2.5 text-right">Saldo Ant.</th>
                    <th className="px-4 py-2.5 text-right">Saldo Nuevo</th>
                    <th className="px-4 py-2.5 text-left">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {kardexModal.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-gray-400">
                        No hay movimientos registrados para este producto
                      </td>
                    </tr>
                  ) : (
                    kardexModal.map((m) => {
                      const esEntrada = ['ENTRADA_COMPRA', 'AJUSTE_POSITIVO', 'TRASLADO_ENTRADA'].includes(m.tipo);
                      return (
                        <tr key={m.id}>
                          <td className="px-4 py-2">{new Date(m.fecha).toLocaleString()}</td>
                          <td className="px-4 py-2 font-semibold text-gray-700">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] ${
                                esEntrada ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {m.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-mono text-gray-500">{m.documentoReferencia || '-'}</td>
                          <td
                            className={`px-4 py-2 text-right font-bold ${
                              esEntrada ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {esEntrada ? `+${Number(m.cantidad)}` : `-${Number(m.cantidad)}`}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500">{Number(m.saldoAnterior)}</td>
                          <td className="px-4 py-2 text-right font-bold text-gray-900">{Number(m.saldoNuevo)}</td>
                          <td className="px-4 py-2 text-gray-600">{m.usuario?.nombre}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setKardexModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TRASLADO */}
      {modalTraslado && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              <span>Traslado entre Bodegas</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Bodega Destino</label>
              <select
                value={trasladoDestino}
                onChange={(e) => setTrasladoDestino(e.target.value)}
                className="w-full border rounded-lg p-2 text-xs"
              >
                <option value="">Seleccione destino...</option>
                {bodegas
                  .filter((b) => b.id !== bodegaActual)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre} ({b.codigo})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Producto</label>
              <select
                value={trasladoProducto}
                onChange={(e) => setTrasladoProducto(e.target.value)}
                className="w-full border rounded-lg p-2 text-xs"
              >
                <option value="">Seleccione producto...</option>
                {existencias.map((e) => (
                  <option key={e.product.id} value={e.product.id}>
                    {e.product.nombre} (Disp: {Number(e.cantidad)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Cantidad</label>
              <input
                type="number"
                value={trasladoCantidad}
                onChange={(e) => setTrasladoCantidad(Number(e.target.value))}
                className="w-full border rounded-lg p-2 text-xs"
                min={1}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setModalTraslado(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleTraslado}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow"
              >
                Procesar Traslado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AJUSTE */}
      {modalAjuste && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-amber-600" />
              <span>Ajuste de Inventario</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Ajuste</label>
              <select
                value={ajusteTipo}
                onChange={(e: any) => setAjusteTipo(e.target.value)}
                className="w-full border rounded-lg p-2 text-xs"
              >
                <option value="POSITIVO">Ajuste Positivo (+ Entrada por sobrante / corrección)</option>
                <option value="NEGATIVO">Ajuste Negativo (- Salida por daño / merma / faltante)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Producto</label>
              <select
                value={ajusteProducto}
                onChange={(e) => setAjusteProducto(e.target.value)}
                className="w-full border rounded-lg p-2 text-xs"
              >
                <option value="">Seleccione producto...</option>
                {existencias.map((e) => (
                  <option key={e.product.id} value={e.product.id}>
                    {e.product.nombre} (Actual: {Number(e.cantidad)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Cantidad a Ajustar</label>
              <input
                type="number"
                value={ajusteCantidad}
                onChange={(e) => setAjusteCantidad(Number(e.target.value))}
                className="w-full border rounded-lg p-2 text-xs"
                min={1}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Motivo Obligatorio</label>
              <textarea
                value={ajusteMotivo}
                onChange={(e) => setAjusteMotivo(e.target.value)}
                placeholder="Indique la justificación del ajuste..."
                className="w-full border rounded-lg p-2 text-xs"
                rows={2}
                required
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setModalAjuste(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleAjuste}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow"
              >
                Aplicar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
