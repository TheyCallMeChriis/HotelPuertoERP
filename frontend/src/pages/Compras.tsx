import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Truck, Plus, PackageCheck, FileText, CheckCircle2 } from 'lucide-react';

export const Compras: React.FC = () => {
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);

  // Modal Nueva Orden
  const [modalNuevaOrden, setModalNuevaOrden] = useState(false);
  const [proveedorId, setProveedorId] = useState('');
  const [bodegaId, setBodegaId] = useState('');
  const [itemsOrden, setItemsOrden] = useState<Array<{ productId: string; cantidadSolicitada: number; precioUnitario: number }>>([
    { productId: '', cantidadSolicitada: 10, precioUnitario: 500 },
  ]);

  // Modal Recepción
  const [modalRecepcion, setModalRecepcion] = useState(false);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any | null>(null);
  const [facturaProveedor, setFacturaProveedor] = useState('');
  const [itemsRecepcion, setItemsRecepcion] = useState<Array<{ productId: string; cantidadRecibida: number; costoUnitario: number }>>([]);

  const cargarDatos = async () => {
    const [resOrd, resProv, resBod, resProd] = await Promise.all([
      api.compras.getOrdenes(),
      api.catalogos.getProveedores(),
      api.catalogos.getBodegas(),
      api.catalogos.getProductos(),
    ]);

    if (resOrd.success) setOrdenes(resOrd.data || []);
    if (resProv.success) setProveedores(resProv.data || []);
    if (resBod.success) {
      setBodegas(resBod.data || []);
      if (resBod.data?.length > 0 && !bodegaId) setBodegaId(resBod.data[0].id);
    }
    if (resProd.success) setProductos(resProd.data || []);
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Crear Orden de Compra
  const handleCrearOrden = async () => {
    if (!proveedorId || !bodegaId || itemsOrden.some((it) => !it.productId || it.cantidadSolicitada <= 0)) {
      alert('Complete proveedor, bodega y productos con cantidades válidas');
      return;
    }

    const res = await api.compras.createOrden({
      supplierId: proveedorId,
      warehouseId: bodegaId,
      items: itemsOrden,
    });

    if (res.success) {
      alert('Orden de compra creada exitosamente');
      setModalNuevaOrden(false);
      cargarDatos();
    } else {
      alert(res.message || 'Error al crear orden');
    }
  };

  // Abrir Modal de Recepción
  const abrirRecepcion = (ord: any) => {
    setOrdenSeleccionada(ord);
    setFacturaProveedor('');
    setItemsRecepcion(
      ord.details.map((d: any) => ({
        productId: d.productId,
        nombre: d.product.nombre,
        cantidadSolicitada: Number(d.cantidadSolicitada),
        cantidadYaRecibida: Number(d.cantidadRecibida),
        cantidadRecibida: Math.max(0, Number(d.cantidadSolicitada) - Number(d.cantidadRecibida)),
        costoUnitario: Number(d.precioUnitario),
      }))
    );
    setModalRecepcion(true);
  };

  // Confirmar Recepción
  const handleConfirmarRecepcion = async () => {
    if (!ordenSeleccionada) return;
    const res = await api.compras.registrarRecepcion({
      purchaseOrderId: ordenSeleccionada.id,
      facturaProveedor,
      items: itemsRecepcion.map((it) => ({
        productId: it.productId,
        cantidadRecibida: it.cantidadRecibida,
        costoUnitario: it.costoUnitario,
      })),
    });

    if (res.success) {
      alert('Recepción registrada e inventario actualizado con éxito');
      setModalRecepcion(false);
      cargarDatos();
    } else {
      alert(res.message || 'Error al registrar recepción');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Barra de título y botón crear */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex justify-between items-center">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
            <Truck className="w-5 h-5 text-emerald-600" />
            <span>Módulo de Compras y Recepción de Mercadería</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Gestión de órdenes a proveedores y entrada automática al inventario / Kardex
          </p>
        </div>

        <button
          onClick={() => setModalNuevaOrden(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Orden de Compra</span>
        </button>
      </div>

      {/* Lista de Órdenes de Compra */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-sm font-bold text-gray-800">Órdenes de Compra Registradas</h3>
          <span className="text-xs text-gray-400">{ordenes.length} órdenes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Consecutivo</th>
                <th className="px-6 py-3 text-left">Fecha</th>
                <th className="px-6 py-3 text-left">Proveedor</th>
                <th className="px-6 py-3 text-left">Bodega Destino</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3 text-center">Estado</th>
                <th className="px-6 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ordenes.map((ord) => (
                <tr key={ord.id}>
                  <td className="px-6 py-3 font-mono font-bold text-gray-900">{ord.consecutivo}</td>
                  <td className="px-6 py-3">{new Date(ord.fechaEmision).toLocaleDateString()}</td>
                  <td className="px-6 py-3 font-semibold text-gray-800">{ord.supplier?.nombre}</td>
                  <td className="px-6 py-3 text-gray-600">{ord.warehouse?.nombre}</td>
                  <td className="px-6 py-3 text-right font-extrabold text-gray-900">
                    ₡{Number(ord.total).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        ord.estado === 'RECIBIDA_TOTAL'
                          ? 'bg-emerald-100 text-emerald-800'
                          : ord.estado === 'RECIBIDA_PARCIAL'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {ord.estado}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {ord.estado !== 'RECIBIDA_TOTAL' && (
                      <button
                        onClick={() => abrirRecepcion(ord)}
                        className="text-xs text-emerald-700 font-bold hover:underline flex items-center space-x-1 mx-auto"
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>Recibir Mercadería</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL NUEVA ORDEN DE COMPRA */}
      {modalNuevaOrden && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2">
              <Plus className="w-5 h-5 text-emerald-600" />
              <span>Crear Orden de Compra</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Proveedor</label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="w-full border rounded-lg p-2 text-xs"
                >
                  <option value="">Seleccione proveedor...</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Bodega de Destino</label>
                <select
                  value={bodegaId}
                  onChange={(e) => setBodegaId(e.target.value)}
                  className="w-full border rounded-lg p-2 text-xs"
                >
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ítems de la orden */}
            <div className="border rounded-lg p-3 space-y-2 max-h-52 overflow-y-auto">
              <span className="text-xs font-bold text-gray-600 uppercase">Productos a Ordenar</span>
              {itemsOrden.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={it.productId}
                    onChange={(e) => {
                      const newItems = [...itemsOrden];
                      newItems[idx].productId = e.target.value;
                      setItemsOrden(newItems);
                    }}
                    className="col-span-6 border rounded p-1.5 text-xs"
                  >
                    <option value="">Producto...</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={it.cantidadSolicitada}
                    onChange={(e) => {
                      const newItems = [...itemsOrden];
                      newItems[idx].cantidadSolicitada = Number(e.target.value);
                      setItemsOrden(newItems);
                    }}
                    placeholder="Cant."
                    className="col-span-3 border rounded p-1.5 text-xs"
                    min={1}
                  />
                  <input
                    type="number"
                    value={it.precioUnitario}
                    onChange={(e) => {
                      const newItems = [...itemsOrden];
                      newItems[idx].precioUnitario = Number(e.target.value);
                      setItemsOrden(newItems);
                    }}
                    placeholder="Costo"
                    className="col-span-3 border rounded p-1.5 text-xs"
                    min={0}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setItemsOrden([...itemsOrden, { productId: '', cantidadSolicitada: 10, precioUnitario: 500 }])
                }
                className="text-xs text-emerald-600 hover:underline flex items-center space-x-1 mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar otra línea</span>
              </button>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t">
              <button
                onClick={() => setModalNuevaOrden(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearOrden}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow"
              >
                Crear Orden de Compra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RECEPCIÓN DE MERCADERÍA */}
      {modalRecepcion && ordenSeleccionada && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2 text-emerald-600">
              <PackageCheck className="w-5 h-5" />
              <span>Recepción de Mercadería: {ordenSeleccionada.consecutivo}</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Número de Factura o Referencia del Proveedor (COM-007)
              </label>
              <input
                type="text"
                value={facturaProveedor}
                onChange={(e) => setFacturaProveedor(e.target.value)}
                placeholder="ej. FACT-2026-9988"
                className="w-full border rounded-lg p-2 text-xs focus:ring-emerald-500"
              />
            </div>

            {/* Comparativa Ordenado vs Recibido (COM-006) */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-600 uppercase">Artículos Recibidos</span>
              {itemsRecepcion.map((it: any, idx) => (
                <div key={idx} className="p-2.5 bg-gray-50 rounded-lg border text-xs space-y-1">
                  <div className="flex justify-between font-bold text-gray-800">
                    <span>{it.nombre}</span>
                    <span className="text-gray-500">
                      Solicitado: {it.cantidadSolicitada} (Ya recibido: {it.cantidadYaRecibida})
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="text-gray-600">Cantidad a Recibir Hoy:</label>
                    <input
                      type="number"
                      value={it.cantidadRecibida}
                      onChange={(e) => {
                        const copy = [...itemsRecepcion];
                        copy[idx].cantidadRecibida = Number(e.target.value);
                        setItemsRecepcion(copy);
                      }}
                      className="w-24 border rounded p-1 text-xs font-bold text-emerald-700"
                      min={0}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t">
              <button
                onClick={() => setModalRecepcion(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarRecepcion}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow"
              >
                Confirmar Recepción en Inventario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
