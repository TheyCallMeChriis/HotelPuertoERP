import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  AlertTriangle,
  Receipt,
  RotateCcw,
  CreditCard,
  User,
  Hotel,
} from 'lucide-react';

interface Product {
  id: string;
  codigo: string;
  nombre: string;
  precioVenta: string | number;
  costo: string | number;
  impuesto: string | number;
  esServicio: boolean;
  categoria: { id: string; nombre: string };
  stock: Array<{ warehouseId: string; cantidad: string | number }>;
}

interface CartItem {
  product: Product;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
  impuesto: number;
  total: number;
}

export const POS: React.FC = () => {
  const { user, hasPermission } = useAuth();

  // Estados de catálogo y venta
  const [puntosVenta, setPuntosVenta] = useState<any[]>([]);
  const [puntoVentaActual, setPuntoVentaActual] = useState<any | null>(null);
  const [turnoActivo, setTurnoActivo] = useState<any | null>(null);
  const [productos, setProductos] = useState<Product[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [formasPago, setFormasPago] = useState<any[]>([]);
  const [habitacionesOcupadas, setHabitacionesOcupadas] = useState<any[]>([]);

  // Filtros
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('');
  const [busqueda, setBusqueda] = useState<string>('');

  // Carrito y Totales
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string>('');
  const [notasVenta, setNotasVenta] = useState<string>('');

  // Modal de Pago
  const [mostrarModalPago, setMostrarModalPago] = useState(false);
  const [pagosDivididos, setPagosDivididos] = useState<Array<{ paymentMethodId: string; monto: number; referencia: string }>>([]);
  const [datosCargoHabitacion, setDatosCargoHabitacion] = useState<{ roomId: string; guestId: string }>({ roomId: '', guestId: '' });
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [procesandoVenta, setProcesandoVenta] = useState(false);

  // Comprobante / Recibo Modal
  const [ventaExitosa, setVentaExitosa] = useState<any | null>(null);

  // Pestaña Histórico de Ventas
  const [verHistorico, setVerHistorico] = useState(false);
  const [ventasHistorico, setVentasHistorico] = useState<any[]>([]);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState<string>('');

  // Cargar datos iniciales
  const cargarCatalogos = async () => {
    const [resPOS, resCats, resClis, resFP, resHabs] = await Promise.all([
      api.catalogos.getPuntosVenta(),
      api.catalogos.getCategorias(),
      api.catalogos.getClientes(),
      api.catalogos.getFormasPago(),
      api.pms.getHabitacionesOcupadas(),
    ]);

    if (resPOS.success && resPOS.data) {
      setPuntosVenta(resPOS.data);
      if (resPOS.data.length > 0 && !puntoVentaActual) {
        setPuntoVentaActual(resPOS.data[0]);
      }
    }
    if (resCats.success) setCategorias(resCats.data || []);
    if (resClis.success) setClientes(resClis.data || []);
    if (resFP.success) setFormasPago(resFP.data || []);
    if (resHabs.success) setHabitacionesOcupadas(resHabs.data || []);
  };

  useEffect(() => {
    cargarCatalogos();
  }, []);

  // Verificar turno activo de caja al cambiar punto de venta
  useEffect(() => {
    const verificarCaja = async () => {
      if (puntoVentaActual?.cajaId) {
        const res = await api.caja.getTurnoActivo(puntoVentaActual.cajaId);
        setTurnoActivo(res.success && res.data ? res.data : null);
      }
    };
    verificarCaja();
  }, [puntoVentaActual]);

  // Cargar productos
  const cargarProductos = async () => {
    const res = await api.catalogos.getProductos({
      busqueda: busqueda || undefined,
      categoriaId: categoriaFiltro || undefined,
    });
    if (res.success && res.data) {
      setProductos(res.data);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, [busqueda, categoriaFiltro]);

  // Cargar histórico de ventas
  const cargarHistorico = async () => {
    const res = await api.ventas.getVentas();
    if (res.success) setVentasHistorico(res.data || []);
  };

  useEffect(() => {
    if (verHistorico) cargarHistorico();
  }, [verHistorico]);

  // Obtener stock del producto en la bodega del POS actual
  const getStockActual = (prod: Product): number => {
    if (prod.esServicio) return 999;
    if (!puntoVentaActual) return 0;
    const itemStock = prod.stock.find((s) => s.warehouseId === puntoVentaActual.bodegaDefectoId);
    return itemStock ? Number(itemStock.cantidad) : 0;
  };

  // Agregar al Carrito
  const agregarAlCarrito = (prod: Product) => {
    const stockDisp = getStockActual(prod);
    const existente = cart.find((item) => item.product.id === prod.id);
    const cantidadActualEnCarrito = existente ? existente.cantidad : 0;

    if (!prod.esServicio && cantidadActualEnCarrito + 1 > stockDisp) {
      alert(`Existencia insuficiente para ${prod.nombre}. Stock disponible: ${stockDisp}`);
      return;
    }

    const precioUnitario = Number(prod.precioVenta);
    const ivaPorc = Number(prod.impuesto) / 100;

    if (existente) {
      setCart(
        cart.map((item) => {
          if (item.product.id === prod.id) {
            const nuevaCant = item.cantidad + 1;
            const sub = nuevaCant * item.precioUnitario - item.descuento;
            const imp = sub * ivaPorc;
            return {
              ...item,
              cantidad: nuevaCant,
              subtotal: sub,
              impuesto: imp,
              total: sub + imp,
            };
          }
          return item;
        })
      );
    } else {
      const sub = precioUnitario;
      const imp = sub * ivaPorc;
      setCart([
        ...cart,
        {
          product: prod,
          cantidad: 1,
          precioUnitario,
          descuento: 0,
          subtotal: sub,
          impuesto: imp,
          total: sub + imp,
        },
      ]);
    }
  };

  // Modificar cantidad en carrito
  const actualizarCantidad = (productId: string, cambio: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.product.id === productId) {
            const nuevaCant = item.cantidad + cambio;
            if (nuevaCant <= 0) return null;

            const stockDisp = getStockActual(item.product);
            if (!item.product.esServicio && nuevaCant > stockDisp) {
              alert(`Stock máximo disponible alcanzado (${stockDisp})`);
              return item;
            }

            const ivaPorc = Number(item.product.impuesto) / 100;
            const sub = nuevaCant * item.precioUnitario - item.descuento;
            const imp = sub * ivaPorc;
            return {
              ...item,
              cantidad: nuevaCant,
              subtotal: sub,
              impuesto: imp,
              total: sub + imp,
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Aplicar descuento por línea
  const aplicarDescuento = (productId: string, montoDesc: number) => {
    if (!hasPermission('VENTAS', 'DESCUENTO')) {
      alert('No cuenta con permiso autorizado para aplicar descuentos');
      return;
    }

    setCart(
      cart.map((item) => {
        if (item.product.id === productId) {
          const ivaPorc = Number(item.product.impuesto) / 100;
          const sub = item.cantidad * item.precioUnitario - montoDesc;
          const imp = sub * ivaPorc;
          return {
            ...item,
            descuento: montoDesc,
            subtotal: sub,
            impuesto: imp,
            total: sub + imp,
          };
        }
        return item;
      })
    );
  };

  // Totales del carrito
  const subtotalCart = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const impuestoCart = cart.reduce((acc, item) => acc + item.impuesto, 0);
  const descuentoTotalCart = cart.reduce((acc, item) => acc + item.descuento, 0);
  const totalCart = subtotalCart + impuestoCart;

  // Abrir Modal de Cobro
  const abrirModalCobro = () => {
    if (cart.length === 0) return;
    if (!turnoActivo) {
      alert('Bloqueado: La caja está cerrada. Abra un turno de caja para vender.');
      return;
    }

    // Inicializar con la primera forma de pago (Efectivo) con el total completo
    const efectivo = formasPago.find((f) => f.codigo === 'EFECTIVO') || formasPago[0];
    setPagosDivididos([
      {
        paymentMethodId: efectivo?.id || '',
        monto: totalCart,
        referencia: '',
      },
    ]);
    setErrorPago(null);
    setMostrarModalPago(true);
  };

  // Agregar fila de pago mixto
  const agregarFilaPago = () => {
    const restante = Math.max(
      0,
      totalCart - pagosDivididos.reduce((sum, p) => sum + Number(p.monto || 0), 0)
    );
    const tarjeta = formasPago.find((f) => f.codigo === 'TARJETA') || formasPago[0];
    setPagosDivididos([
      ...pagosDivididos,
      { paymentMethodId: tarjeta?.id || '', monto: restante, referencia: '' },
    ]);
  };

  const eliminarFilaPago = (index: number) => {
    setPagosDivididos(pagosDivididos.filter((_, i) => i !== index));
  };

  // Confirmar Venta
  const confirmarVenta = async () => {
    const totalPagos = pagosDivididos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
    if (Math.abs(totalPagos - totalCart) > 0.05) {
      setErrorPago(`El total pagado (₡${totalPagos.toLocaleString()}) debe coincidir exactamente con el total de la venta (₡${totalCart.toLocaleString()})`);
      return;
    }

    // Verificar si hay pago con cargo a habitación
    const tieneCargoHab = pagosDivididos.some((p) => {
      const fp = formasPago.find((f) => f.id === p.paymentMethodId);
      return fp?.codigo === 'CARGO_HABITACION';
    });

    if (tieneCargoHab && (!datosCargoHabitacion.roomId || !datosCargoHabitacion.guestId)) {
      setErrorPago('Debe seleccionar la habitación y huésped para el cargo a habitación');
      return;
    }

    setProcesandoVenta(true);
    setErrorPago(null);

    const payload = {
      pointOfSaleId: puntoVentaActual.id,
      customerId: clienteSeleccionado || null,
      items: cart.map((it) => ({
        productId: it.product.id,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        descuento: it.descuento,
      })),
      pagos: pagosDivididos.map((p) => ({
        paymentMethodId: p.paymentMethodId,
        monto: Number(p.monto),
        referencia: p.referencia || null,
      })),
      notas: notasVenta || null,
      cargoHabitacion: tieneCargoHab ? datosCargoHabitacion : null,
    };

    const res = await api.ventas.createVenta(payload);
    setProcesandoVenta(false);

    if (res.success && res.data) {
      setVentaExitosa(res.data);
      setMostrarModalPago(false);
      setCart([]);
      setNotasVenta('');
      cargarProductos(); // Actualizar existencias
    } else {
      setErrorPago(res.message || 'Error al procesar la venta');
    }
  };

  // Anular venta desde histórico
  const ejecutarAnulacion = async () => {
    if (!anulandoId || !motivoAnulacion) {
      alert('El motivo de anulación es obligatorio');
      return;
    }

    const res = await api.ventas.anularVenta(anulandoId, motivoAnulacion);
    if (res.success) {
      alert('Venta anulada correctamente');
      setAnulandoId(null);
      setMotivoAnulacion('');
      cargarHistorico();
      cargarProductos();
    } else {
      alert(res.message || 'Error al anular venta');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Barra superior de control del POS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold text-gray-500 uppercase">Punto de Venta:</label>
          <select
            value={puntoVentaActual?.id || ''}
            onChange={(e) => {
              const pos = puntosVenta.find((p) => p.id === e.target.value);
              setPuntoVentaActual(pos || null);
            }}
            className="text-sm font-semibold text-gray-800 bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {puntosVenta.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.departamento})
              </option>
            ))}
          </select>

          {/* Indicador de Estado de Caja */}
          {turnoActivo ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Caja Abierta ({turnoActivo.caja?.nombre})
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              Caja Cerrada (Requiere Apertura)
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setVerHistorico(!verHistorico)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 border transition ${
              verHistorico
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>{verHistorico ? 'Volver a Vender' : 'Historial de Ventas'}</span>
          </button>
        </div>
      </div>

      {verHistorico ? (
        /* VISTA: HISTORIAL DE VENTAS Y ANULACIÓN */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-base font-bold text-gray-800">Historial de Ventas Registradas</h3>
            <button onClick={cargarHistorico} className="text-xs text-emerald-600 hover:underline">
              Actualizar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-3 text-left">Consecutivo</th>
                  <th className="px-6 py-3 text-left">Fecha / Hora</th>
                  <th className="px-6 py-3 text-left">Cajero</th>
                  <th className="px-6 py-3 text-left">Punto de Venta</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-center">Estado</th>
                  <th className="px-6 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ventasHistorico.map((v) => (
                  <tr key={v.id} className={v.estado === 'ANULADA' ? 'bg-red-50/50 text-gray-400' : ''}>
                    <td className="px-6 py-4 font-mono font-bold text-gray-900">{v.consecutivo}</td>
                    <td className="px-6 py-4">{new Date(v.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4">{v.usuario?.nombre}</td>
                    <td className="px-6 py-4">{v.pointOfSale?.nombre}</td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      ₡{Number(v.total).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          v.estado === 'COMPLETADA'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {v.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center space-x-2">
                      <button
                        onClick={() => setVentaExitosa(v)}
                        className="text-xs text-blue-600 hover:underline font-semibold"
                      >
                        Ver Recibo
                      </button>
                      {v.estado === 'COMPLETADA' && (
                        <button
                          onClick={() => setAnulandoId(v.id)}
                          className="text-xs text-red-600 hover:underline font-semibold"
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISTA: TERMINAL POS (CATÁLOGO + CARRITO) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LADO IZQUIERDO: CATÁLOGO DE PRODUCTOS */}
          <div className="lg:col-span-7 xl:col-span-8">
            {/* Buscador y Categorías */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, nombre o código de barras..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              {/* Píldoras de Categorías */}
              <div className="flex space-x-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setCategoriaFiltro('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                    categoriaFiltro === ''
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Todos los Productos
                </button>
                {categorias.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoriaFiltro(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                      categoriaFiltro === cat.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* Cuadrícula de Tarjetas de Productos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {productos.map((prod) => {
                const stock = getStockActual(prod);
                const agotado = !prod.esServicio && stock <= 0;

                return (
                  <div
                    key={prod.id}
                    onClick={() => !agotado && agregarAlCarrito(prod)}
                    className={`bg-white rounded-xl border p-4 shadow-sm flex flex-col justify-between transition cursor-pointer select-none ${
                      agotado
                        ? 'opacity-50 border-gray-200 cursor-not-allowed'
                        : 'hover:border-emerald-500 hover:shadow-md border-gray-200 active:scale-[0.98]'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-mono text-gray-400 font-bold uppercase">{prod.codigo}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            prod.esServicio
                              ? 'bg-purple-100 text-purple-700'
                              : stock <= 5
                              ? 'bg-red-100 text-red-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {prod.esServicio ? 'Servicio' : `Stock: ${stock}`}
                        </span>
                      </div>
                      <h4 className="font-bold text-gray-800 text-sm line-clamp-2 leading-tight">{prod.nombre}</h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">{prod.categoria?.nombre}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-base font-extrabold text-emerald-600">
                        ₡{Number(prod.precioVenta).toLocaleString()}
                      </span>
                      <button
                        disabled={agotado}
                        className="bg-emerald-50 text-emerald-700 p-1.5 rounded-lg hover:bg-emerald-600 hover:text-white transition"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LADO DERECHO: ORDEN ACTUAL / CARRITO */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full sticky top-20">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <ShoppingCart className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-gray-900 text-base">Orden Actual</h3>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-red-500 hover:underline flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vaciar</span>
                  </button>
                )}
              </div>

              {/* Selector de Cliente */}
              <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-400" />
                <select
                  value={clienteSeleccionado}
                  onChange={(e) => setClienteSeleccionado(e.target.value)}
                  className="w-full text-xs bg-white border border-gray-300 rounded-md py-1.5 px-2 text-gray-700"
                >
                  <option value="">Cliente Ocasional / General</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.identificacion})
                    </option>
                  ))}
                </select>
              </div>

              {/* Lista de Artículos */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[360px]">
                {cart.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">El carrito está vacío</p>
                    <p className="text-xs text-gray-400 mt-1">Haga clic en un producto para agregarlo</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200/80"
                    >
                      <div className="flex-1 mr-2">
                        <h5 className="font-semibold text-gray-800 text-xs">{item.product.nombre}</h5>
                        <div className="text-[11px] text-gray-500">
                          ₡{item.precioUnitario.toLocaleString()} c/u
                          {item.descuento > 0 && (
                            <span className="text-red-500 ml-1">(-₡{item.descuento.toLocaleString()})</span>
                          )}
                        </div>
                      </div>

                      {/* Controles de Cantidad */}
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => actualizarCantidad(item.product.id, -1)}
                          className="w-6 h-6 rounded bg-white border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-xs w-6 text-center">{item.cantidad}</span>
                        <button
                          onClick={() => actualizarCantidad(item.product.id, 1)}
                          className="w-6 h-6 rounded bg-white border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right ml-3 min-w-[70px]">
                        <span className="font-extrabold text-xs text-gray-900 block">
                          ₡{item.total.toLocaleString()}
                        </span>
                        {hasPermission('VENTAS', 'DESCUENTO') && (
                          <button
                            onClick={() => {
                              const desc = prompt('Ingrese monto de descuento:', String(item.descuento));
                              if (desc !== null) aplicarDescuento(item.product.id, Number(desc) || 0);
                            }}
                            className="text-[10px] text-emerald-600 hover:underline"
                          >
                            Desc.
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Resumen y Botón de Cobro */}
              <div className="p-4 border-t border-gray-200 bg-white space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Subtotal:</span>
                  <span>₡{subtotalCart.toLocaleString()}</span>
                </div>
                {descuentoTotalCart > 0 && (
                  <div className="flex justify-between text-xs text-red-500">
                    <span>Descuento aplicado:</span>
                    <span>-₡{descuentoTotalCart.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-gray-500">
                  <span>I.V.A (13%):</span>
                  <span>₡{impuestoCart.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-gray-900 pt-2 border-t border-gray-100">
                  <span>Total a Pagar:</span>
                  <span className="text-emerald-600 text-lg">₡{totalCart.toLocaleString()}</span>
                </div>

                <button
                  onClick={abrirModalCobro}
                  disabled={cart.length === 0 || !turnoActivo}
                  className="w-full mt-3 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow transition flex items-center justify-center space-x-2"
                >
                  <CreditCard className="w-5 h-5" />
                  <span>Cobrar Orden</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE COBRO CON FORMAS DE PAGO Y PAGO MIXTO */}
      {mostrarModalPago && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-lg text-gray-900">Procesar Cobro de Venta</h3>
              <button
                onClick={() => setMostrarModalPago(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl flex justify-between items-center">
              <span className="text-sm font-semibold text-emerald-900">Monto Total de la Orden:</span>
              <span className="text-xl font-extrabold text-emerald-700">₡{totalCart.toLocaleString()}</span>
            </div>

            {errorPago && (
              <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">
                {errorPago}
              </div>
            )}

            {/* Lista de Formas de Pago / Desglose Mixto */}
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {pagosDivididos.map((pago, index) => {
                const metodo = formasPago.find((f) => f.id === pago.paymentMethodId);
                const esCargoHab = metodo?.codigo === 'CARGO_HABITACION';

                return (
                  <div key={index} className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700">Pago #{index + 1}</span>
                      {pagosDivididos.length > 1 && (
                        <button
                          onClick={() => eliminarFilaPago(index)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500">Medio de Pago</label>
                        <select
                          value={pago.paymentMethodId}
                          onChange={(e) => {
                            const newPagos = [...pagosDivididos];
                            newPagos[index].paymentMethodId = e.target.value;
                            setPagosDivididos(newPagos);
                          }}
                          className="w-full text-xs border rounded-lg p-2 bg-white"
                        >
                          {formasPago.map((fp) => (
                            <option key={fp.id} value={fp.id}>
                              {fp.nombre}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-gray-500">Monto (₡)</label>
                        <input
                          type="number"
                          value={pago.monto}
                          onChange={(e) => {
                            const newPagos = [...pagosDivididos];
                            newPagos[index].monto = Number(e.target.value);
                            setPagosDivididos(newPagos);
                          }}
                          className="w-full text-xs border rounded-lg p-2 font-bold text-gray-900"
                        />
                      </div>
                    </div>

                    {esCargoHab && (
                      <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-xs space-y-2 mt-2">
                        <div className="flex items-center text-amber-800 font-bold space-x-1">
                          <Hotel className="w-3.5 h-3.5" />
                          <span>Vincular con Habitación (PMS)</span>
                        </div>
                        <select
                          value={datosCargoHabitacion.roomId}
                          onChange={(e) => {
                            const hab = habitacionesOcupadas.find((h) => h.id === e.target.value);
                            setDatosCargoHabitacion({
                              roomId: e.target.value,
                              guestId: hab?.huesped?.id || '',
                            });
                          }}
                          className="w-full text-xs border rounded p-1.5 bg-white"
                        >
                          <option value="">Seleccione Habitación Ocupada...</option>
                          {habitacionesOcupadas.map((h) => (
                            <option key={h.id} value={h.id}>
                              Habitación {h.numero} - {h.huesped?.nombreCompleto || 'Sin huésped'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Botón para agregar forma de pago mixta */}
            <button
              onClick={agregarFilaPago}
              className="text-xs text-emerald-700 font-semibold hover:underline flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar otra forma de pago (Pago Mixto)</span>
            </button>

            <div className="pt-3 border-t flex justify-end space-x-3">
              <button
                onClick={() => setMostrarModalPago(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarVenta}
                disabled={procesandoVenta}
                className="px-6 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow disabled:opacity-50"
              >
                {procesandoVenta ? 'Emitiendo...' : 'Confirmar e Imprimir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE COMPROBANTE / RECIBO IMPRIMIBLE (FAC-001, FAC-002) */}
      {ventaExitosa && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 font-mono text-xs">
            <div className="text-center border-b pb-3 space-y-1">
              <h3 className="font-bold text-sm tracking-wider uppercase">HOTEL PUERTO LIMÓN</h3>
              <p className="text-[11px] text-gray-500">Cédula Jurídica: 3-101-555888</p>
              <p className="text-[11px] text-gray-500">Puerto Limón, Costa Rica</p>
              <p className="text-[11px] text-gray-500">Tel: 2758-0000</p>
            </div>

            <div className="space-y-1 text-gray-600 text-[11px]">
              <div>Comprobante: <span className="font-bold text-gray-900">{ventaExitosa.consecutivo}</span></div>
              <div>Fecha: {new Date(ventaExitosa.createdAt).toLocaleString()}</div>
              <div>Cajero: {ventaExitosa.usuario?.nombre || user?.nombre}</div>
              <div>Estado: <span className="font-bold text-emerald-700">{ventaExitosa.estado}</span></div>
            </div>

            <div className="border-t border-b py-2 space-y-1.5">
              {ventaExitosa.details?.map((d: any) => (
                <div key={d.id} className="flex justify-between items-center">
                  <span>{d.product?.nombre || 'Producto'} x{Number(d.cantidad)}</span>
                  <span className="font-bold">₡{Number(d.total).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-1">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₡{Number(ventaExitosa.subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>I.V.A (13%):</span>
                <span>₡{Number(ventaExitosa.impuesto).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold border-t pt-1 text-gray-900">
                <span>TOTAL:</span>
                <span>₡{Number(ventaExitosa.total).toLocaleString()}</span>
              </div>
            </div>

            <div className="border-t pt-2 space-y-1 text-[11px] text-gray-600">
              <span className="font-bold block">Medios de Pago:</span>
              {ventaExitosa.payments?.map((p: any) => (
                <div key={p.id} className="flex justify-between">
                  <span>{p.paymentMethod?.nombre || 'Pago'}:</span>
                  <span>₡{Number(p.monto).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-between space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-semibold text-center"
              >
                Imprimir
              </button>
              <button
                onClick={() => setVentaExitosa(null)}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-center"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE MOTIVO DE ANULACIÓN */}
      {anulandoId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-gray-900 flex items-center space-x-2 text-red-600">
              <RotateCcw className="w-5 h-5" />
              <span>Anulación Controlada de Venta</span>
            </h3>
            <p className="text-xs text-gray-600">
              Esta acción revertirá las existencias en el Kardex y dejará constancia inmutable en la bitácora de auditoría.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Motivo obligatorio de la anulación:
              </label>
              <textarea
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                placeholder="Indique la justificación del cliente o del cajero..."
                className="w-full border rounded-lg p-2.5 text-xs focus:ring-red-500 focus:border-red-500"
                rows={3}
                required
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setAnulandoId(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarAnulacion}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow"
              >
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
