// Inventory screen (INV-001 to INV-010): stock per warehouse, ledger, manual movements, transfers,
// adjustments, minimum/maximum levels and physical counts.

import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { numberFromInput, validNumberInput } from '../utils/number-input';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Field, Modal, Tabs, inputClass } from '../components/ui';
import { TomaFisica } from '../components/TomaFisica';
import {
  ArrowRightLeft,
  Sliders,
  History,
  ArrowDownToLine,
  Gauge,
} from 'lucide-react';

// Manual movement types offered to the user (document types are created by their own flows)
const TIPOS_MOVIMIENTO = [
  { value: 'ENTRADA_MANUAL', label: 'Entrada (donación, devolución interna, sobrante)', entrada: true },
  { value: 'SALIDA_MANUAL', label: 'Salida (consumo interno, uso operativo)', entrada: false },
  { value: 'MERMA', label: 'Merma o desperdicio', entrada: false },
];

// Inventory screen for the selected warehouse
export const Inventario: React.FC = () => {
  const { hasPermission } = useAuth();
  const puedeMover = hasPermission('INVENTARIO', 'CREAR');
  const puedeConfigurar = hasPermission('INVENTARIO', 'EDITAR');
  const [productos, setProductos] = useState<any[]>([]);
  const [movimiento, setMovimiento] = useState<{ tipo: string; productId: string; cantidad: string; motivo: string } | null>(null);
  const [nivel, setNivel] = useState<{ stock: any; minimo: string; maximo: string } | null>(null);
  const [errorModal, setErrorModal] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [vista, setVista] = useState<'existencias' | 'toma'>('existencias');
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [bodegaActual, setBodegaActual] = useState<string>('');
  const [existencias, setExistencias] = useState<any[]>([]);
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);

  // Stock ledger modal
  const [kardexModal, setKardexModal] = useState<any[] | null>(null);
  const [productoKardex, setProductoKardex] = useState<any | null>(null);

  // Transfer modal
  const [modalTraslado, setModalTraslado] = useState(false);
  const [trasladoDestino, setTrasladoDestino] = useState('');
  const [trasladoProducto, setTrasladoProducto] = useState('');
  const [trasladoCantidad, setTrasladoCantidad] = useState<number | string>(1);

  // Adjustment modal
  const [modalAjuste, setModalAjuste] = useState(false);
  const [ajusteTipo, setAjusteTipo] = useState<'POSITIVO' | 'NEGATIVO'>('POSITIVO');
  const [ajusteProducto, setAjusteProducto] = useState('');
  const [ajusteCantidad, setAjusteCantidad] = useState<number | string>(1);
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
    const res = await api.inventario.getExistencias({
      warehouseId: bodegaActual || undefined,
      soloBajoMinimo,
    });
    if (res.success) {
      setExistencias(res.data || []);
    }
  };

  useEffect(() => {
    cargarBodegas();
    api.catalogos.getProductos().then((r) => {
      if (r.success) setProductos((r.data || []).filter((p: any) => !p.esServicio));
    });
  }, []);

  // Manual entry / exit / shrinkage with a reason (INV-003, INV-004, REC-005)
  const guardarMovimiento = async () => {
    if (!movimiento) return;
    if (!movimiento.productId || !validNumberInput(movimiento.cantidad) || numberFromInput(movimiento.cantidad) <= 0 || !movimiento.motivo.trim()) {
      setErrorModal('Seleccione producto, cantidad mayor a cero y motivo');
      return;
    }
    const res = await api.inventario.registrarMovimiento({
      warehouseId: bodegaActual,
      productId: movimiento.productId,
      tipo: movimiento.tipo,
      cantidad: numberFromInput(movimiento.cantidad),
      motivo: movimiento.motivo.trim(),
    });
    if (!res.success) {
      setErrorModal(res.message || 'No se pudo registrar el movimiento');
      return;
    }
    setMovimiento(null);
    setMensaje(`Movimiento registrado. Saldo nuevo: ${Number(res.data?.saldoNuevo ?? 0)}`);
    cargarExistencias();
  };

  // Minimum and maximum stock per warehouse (INV-009)
  const guardarNivel = async () => {
    if (!nivel) return;
    if (!validNumberInput(nivel.minimo) || (nivel.maximo !== '' && !validNumberInput(nivel.maximo))) {
      setErrorModal('Indique cantidades válidas');
      return;
    }
    const res = await api.inventario.configurarNiveles({
      warehouseId: bodegaActual,
      productId: nivel.stock.product.id,
      stockMinimo: numberFromInput(nivel.minimo),
      stockMaximo: nivel.maximo === '' ? undefined : numberFromInput(nivel.maximo),
    });
    if (!res.success) {
      setErrorModal(res.message || 'No se pudo guardar');
      return;
    }
    setNivel(null);
    setMensaje(`Mínimo de ${nivel.stock.product.nombre} actualizado`);
    cargarExistencias();
  };

  useEffect(() => {
    if (bodegaActual) {
      cargarExistencias();
    }
  }, [bodegaActual, soloBajoMinimo]);

  // Open the stock ledger
  const verKardex = async (prod: any) => {
    setProductoKardex(prod);
    const res = await api.inventario.getKardex(prod.id, bodegaActual);
    if (res.success) {
      setKardexModal(res.data || []);
    }
  };

  // Perform a transfer
  const handleTraslado = async () => {
    if (!trasladoDestino || !trasladoProducto || (!validNumberInput(trasladoCantidad) || numberFromInput(trasladoCantidad) <= 0)) {
      alert('Complete todos los campos del traslado');
      return;
    }
    const res = await api.inventario.realizarTraslado({
      warehouseOrigenId: bodegaActual,
      warehouseDestinoId: trasladoDestino,
      items: [{ productId: trasladoProducto, cantidad: numberFromInput(trasladoCantidad) }],
    });
    if (res.success) {
      alert('Traslado realizado exitosamente');
      setModalTraslado(false);
      cargarExistencias();
    } else {
      alert(res.message || 'Error al realizar traslado');
    }
  };

  // Perform an adjustment
  const handleAjuste = async () => {
    if (!ajusteProducto || (!validNumberInput(ajusteCantidad) || numberFromInput(ajusteCantidad) <= 0) || !ajusteMotivo) {
      alert('Producto, cantidad y motivo obligatorio son requeridos');
      return;
    }
    const res = await api.inventario.realizarAjuste({
      warehouseId: bodegaActual,
      tipo: ajusteTipo,
      motivo: ajusteMotivo,
      items: [{ productId: ajusteProducto, cantidad: numberFromInput(ajusteCantidad) }],
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
      <Tabs tabs={[{ id: 'existencias', label: 'Existencias y Kardex' }, { id: 'toma', label: 'Toma física' }]} active={vista} onChange={(v) => setVista(v as any)} />
      {/* Control bar */}
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

          <label className={`flex items-center space-x-1.5 text-xs text-gray-600 cursor-pointer ml-4 ${vista === 'toma' ? 'hidden' : ''}`}>
            <input
              type="checkbox"
              checked={soloBajoMinimo}
              onChange={(e) => setSoloBajoMinimo(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span className="font-semibold text-red-600">Solo productos con stock bajo</span>
          </label>
        </div>

        <div className={`flex flex-wrap gap-2 ${vista === 'toma' ? 'hidden' : ''}`}>
          {puedeMover && (
            <button
              onClick={() => { setErrorModal(''); setMovimiento({ tipo: 'ENTRADA_MANUAL', productId: '', cantidad: '1', motivo: '' }); }}
              className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold flex items-center space-x-1 transition"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Entrada / Salida</span>
            </button>
          )}
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

      {mensaje && <Alert kind="success" message={mensaje} onClose={() => setMensaje('')} />}

      {vista === 'toma' && <TomaFisica bodegas={bodegas} bodegaId={bodegaActual} onAplicada={cargarExistencias} />}

      {vista === 'existencias' && (<>
      {/* Stock table */}
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
                    <td className="px-6 py-3 text-right text-gray-500">
                      {puedeConfigurar ? (
                        <button
                          onClick={() => { setErrorModal(''); setNivel({ stock: e, minimo: String(min), maximo: String(Number(e.stockMaximo)) }); }}
                          className="inline-flex items-center gap-1 hover:text-emerald-700 hover:underline"
                          title="Configurar mínimo y máximo"
                        >
                          {min} <Gauge className="w-3 h-3" />
                        </button>
                      ) : min}
                    </td>
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

      {/* IMMUTABLE STOCK LEDGER MODAL (INV-008) */}
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
                      // An entry is any movement that increased the balance (purchases, returns, transfers in, positive adjustments)
                      const esEntrada = Number(m.saldoNuevo) > Number(m.saldoAnterior);
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

      </>)}

      {movimiento && (
        <Modal
          title="Movimiento manual de inventario"
          onClose={() => setMovimiento(null)}
          footer={<><Button variant="secondary" onClick={() => setMovimiento(null)}>Cancelar</Button><Button onClick={guardarMovimiento}>Registrar</Button></>}
        >
          {errorModal && <Alert kind="error" message={errorModal} />}
          <p className="text-xs text-gray-500">
            Bodega: <strong>{bodegas.find((b) => b.id === bodegaActual)?.nombre}</strong>. Todo movimiento genera Kardex con usuario y motivo.
          </p>
          <Field label="Tipo de movimiento" required>
            <select value={movimiento.tipo} onChange={(e) => setMovimiento({ ...movimiento, tipo: e.target.value })} className={inputClass}>
              {TIPOS_MOVIMIENTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Producto" required>
            <select value={movimiento.productId} onChange={(e) => setMovimiento({ ...movimiento, productId: e.target.value })} className={inputClass}>
              <option value="">Seleccione producto...</option>
              {productos.map((p) => {
                const disp = existencias.find((x) => x.product?.id === p.id);
                return <option key={p.id} value={p.id}>{p.codigo} · {p.nombre} (Disp: {disp ? Number(disp.cantidad) : 0})</option>;
              })}
            </select>
          </Field>
          <Field label="Cantidad" required>
            <input type="number" min="0" step="0.001" value={movimiento.cantidad} onChange={(e) => setMovimiento({ ...movimiento, cantidad: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Motivo" required>
            <textarea rows={2} value={movimiento.motivo} onChange={(e) => setMovimiento({ ...movimiento, motivo: e.target.value })} className={inputClass}
              placeholder={TIPOS_MOVIMIENTO.find((t) => t.value === movimiento.tipo)?.entrada ? 'Ej.: devolución de cocina' : 'Ej.: producto vencido'} />
          </Field>
        </Modal>
      )}

      {nivel && (
        <Modal
          title={`Niveles de existencia · ${nivel.stock.product?.nombre}`}
          onClose={() => setNivel(null)}
          footer={<><Button variant="secondary" onClick={() => setNivel(null)}>Cancelar</Button><Button onClick={guardarNivel}>Guardar</Button></>}
        >
          {errorModal && <Alert kind="error" message={errorModal} />}
          <p className="text-xs text-gray-500">No modifica la existencia; solo define cuándo se alerta por stock bajo.</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Stock mínimo" required>
              <input type="number" min="0" step="0.001" value={nivel.minimo} onChange={(e) => setNivel({ ...nivel, minimo: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Stock máximo">
              <input type="number" min="0" step="0.001" value={nivel.maximo} onChange={(e) => setNivel({ ...nivel, maximo: e.target.value })} className={inputClass} />
            </Field>
          </div>
        </Modal>
      )}

      {/* TRANSFER MODAL */}
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
                onChange={(e) => setTrasladoCantidad(e.target.value)}
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

      {/* ADJUSTMENT MODAL */}
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
                onChange={(e) => setAjusteCantidad(e.target.value)}
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
