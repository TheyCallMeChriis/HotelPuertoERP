import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ReportTable } from '../components/ReportTable';
import { Alert, Button, Tabs, inputClass } from '../components/ui';
import { ReportColumn, exportCSV, exportPDF, exportXLSX, formatValue } from '../utils/report-export';
import { AlertTriangle, DollarSign, FileDown, FileSpreadsheet, FileText, ShoppingCart, TrendingUp } from 'lucide-react';

// Operating reports with filters and export (REP-001 to REP-009, CAJ-007/008, GEN-009)

type Filtro = 'fechas' | 'pointOfSaleId' | 'usuarioId' | 'productId' | 'warehouseId' | 'supplierId' | 'cajaId' | 'orden' | 'soloBajoMinimo' | 'soloDiferencias';

interface Definicion {
  id: string;
  titulo: string;
  filtros: Filtro[];
  requiere?: Filtro; // filter required before querying
  cargar: (q: Record<string, unknown>) => Promise<{ success: boolean; data?: any; message?: string; resumen?: any }>;
  // Normalizes the response into rows + summary
  leer: (res: any) => { filas: any[]; resumen: any };
  columnas: (q: Record<string, unknown>) => ReportColumn[];
  totales?: (filas: any[], resumen: any) => Record<string, unknown>;
  tarjetas?: (resumen: any) => Array<{ label: string; valor: string }>;
  resaltar?: (f: any) => string | undefined;
}

// Column total of the current rows
const sum = (filas: any[], key: string) => filas.reduce((s, f) => s + Number(f[key] || 0), 0);
// Currency format
const fmtMoney = (v: unknown) => formatValue(v, 'money');

// Report definitions: endpoint, filters, columns, row mapping and totals
const REPORTES: Definicion[] = [
  {
    id: 'ventas',
    titulo: 'Reporte de ventas',
    filtros: ['fechas', 'pointOfSaleId', 'usuarioId', 'productId'],
    cargar: (q) => api.reportes.get('ventas', q),
    leer: (r) => ({ filas: r.data?.ventas ?? [], resumen: r.data?.resumen ?? {} }),
    columnas: (q) => [
      { key: 'consecutivo', label: 'Venta' },
      { key: 'fecha', label: 'Fecha', type: 'datetime' },
      { key: 'puntoVenta', label: 'Punto de venta' },
      { key: 'usuario', label: 'Usuario' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'mediosPago', label: 'Medios de pago' },
      ...(q.productId
        ? ([{ key: 'cantidadProducto', label: 'Cant. producto', type: 'qty' }, { key: 'montoProducto', label: 'Monto producto', type: 'money' }] as ReportColumn[])
        : []),
      { key: 'subtotal', label: 'Subtotal', type: 'money' },
      { key: 'descuento', label: 'Descuento', type: 'money' },
      { key: 'impuesto', label: 'IVA', type: 'money' },
      { key: 'total', label: 'Total', type: 'money' },
    ],
    totales: (f, r) => ({
      consecutivo: `TOTAL (${f.length})`, subtotal: r.totalSubtotal, descuento: r.totalDescuentos, impuesto: r.totalImpuestos,
      total: r.totalRecaudado, cantidadProducto: r.cantidadProducto, montoProducto: r.montoProducto,
    }),
    tarjetas: (r) => [
      { label: 'Ventas', valor: String(r.totalVentas ?? 0) },
      { label: 'Total vendido', valor: fmtMoney(r.totalRecaudado) },
      { label: 'Ticket promedio', valor: fmtMoney(r.ticketPromedio) },
      { label: 'Descuentos', valor: fmtMoney(r.totalDescuentos) },
    ],
  },
  {
    id: 'formas-pago',
    titulo: 'Ventas por forma de pago',
    filtros: ['fechas', 'pointOfSaleId'],
    cargar: (q) => api.reportes.get('formas-pago', q),
    leer: (r) => ({ filas: r.data ?? [], resumen: r.resumen ?? {} }),
    columnas: () => [
      { key: 'nombre', label: 'Forma de pago' },
      { key: 'cantidadTransacciones', label: 'Pagos', type: 'int' },
      { key: 'total', label: 'Total recaudado', type: 'money' },
      { key: 'porcentaje', label: 'Participación', type: 'percent' },
    ],
    totales: (f, r) => ({ nombre: 'TOTAL', cantidadTransacciones: r.transacciones, total: r.total, porcentaje: f.length ? 100 : 0 }),
  },
  {
    id: 'productos-vendidos',
    titulo: 'Productos más vendidos',
    filtros: ['fechas', 'pointOfSaleId', 'orden'],
    cargar: (q) => api.reportes.get('productos-vendidos', q),
    leer: (r) => ({ filas: r.data ?? [], resumen: r.resumen ?? {} }),
    columnas: () => [
      { key: 'posicion', label: '#', type: 'int' },
      { key: 'codigo', label: 'Código' },
      { key: 'producto', label: 'Producto' },
      { key: 'categoria', label: 'Categoría' },
      { key: 'cantidad', label: 'Cantidad', type: 'qty' },
      { key: 'montoVendido', label: 'Monto vendido', type: 'money' },
      { key: 'costoEstimado', label: 'Costo estimado', type: 'money' },
      { key: 'margenEstimado', label: 'Margen estimado', type: 'money' },
      { key: 'participacion', label: '% ventas', type: 'percent' },
    ],
    totales: (f) => ({
      producto: 'TOTAL', cantidad: sum(f, 'cantidad'), montoVendido: sum(f, 'montoVendido'),
      costoEstimado: sum(f, 'costoEstimado'), margenEstimado: sum(f, 'margenEstimado'), participacion: sum(f, 'participacion'),
    }),
  },
  {
    id: 'existencias',
    titulo: 'Existencias actuales por bodega',
    filtros: ['warehouseId', 'soloBajoMinimo'],
    cargar: (q) => api.reportes.get('existencias', q),
    leer: (r) => ({ filas: r.data ?? [], resumen: r.resumen ?? {} }),
    columnas: () => [
      { key: 'bodega', label: 'Bodega' },
      { key: 'codigo', label: 'Código' },
      { key: 'producto', label: 'Producto' },
      { key: 'categoria', label: 'Categoría' },
      { key: 'existencia', label: 'Existencia', type: 'qty' },
      { key: 'minimo', label: 'Mínimo', type: 'qty' },
      { key: 'costoUnitario', label: 'Costo unit.', type: 'money' },
      { key: 'valorInventario', label: 'Valor', type: 'money' },
      { key: 'estado', label: 'Estado' },
    ],
    totales: (f, r) => ({ bodega: `TOTAL (${f.length} artículos)`, valorInventario: r.valorTotal }),
    tarjetas: (r) => [
      { label: 'Artículos', valor: String(r.articulos ?? 0) },
      { label: 'Bajo mínimo', valor: String(r.bajoMinimo ?? 0) },
      { label: 'Valor del inventario', valor: fmtMoney(r.valorTotal) },
    ],
    resaltar: (f) => (f.estado === 'BAJO MÍNIMO' ? 'bg-red-50/60' : undefined),
  },
  {
    id: 'kardex',
    titulo: 'Kardex por producto',
    filtros: ['productId', 'warehouseId', 'fechas'],
    requiere: 'productId',
    cargar: (q) => api.reportes.get('kardex', q),
    leer: (r) => ({ filas: r.data ?? [], resumen: r.resumen ?? {} }),
    columnas: () => [
      { key: 'fecha', label: 'Fecha', type: 'datetime' },
      { key: 'bodega', label: 'Bodega' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'documento', label: 'Documento' },
      { key: 'entrada', label: 'Entrada', type: 'qty' },
      { key: 'salida', label: 'Salida', type: 'qty' },
      { key: 'saldo', label: 'Saldo', type: 'qty' },
      { key: 'usuario', label: 'Usuario' },
      { key: 'motivo', label: 'Motivo' },
    ],
    totales: (_f, r) => ({ fecha: 'TOTAL', entrada: r.entradas, salida: r.salidas }),
  },
  {
    id: 'compras',
    titulo: 'Compras recibidas por proveedor',
    filtros: ['fechas', 'supplierId', 'productId'],
    cargar: (q) => api.reportes.get('compras', q),
    leer: (r) => ({ filas: r.data ?? [], resumen: r.resumen ?? {} }),
    columnas: () => [
      { key: 'fecha', label: 'Fecha', type: 'datetime' },
      { key: 'recepcion', label: 'Recepción' },
      { key: 'ordenCompra', label: 'Orden' },
      { key: 'proveedor', label: 'Proveedor' },
      { key: 'factura', label: 'Factura' },
      { key: 'bodega', label: 'Bodega' },
      { key: 'articulos', label: 'Artículos' },
      { key: 'montoRecibido', label: 'Monto recibido', type: 'money' },
    ],
    totales: (f, r) => ({ fecha: `TOTAL (${f.length})`, montoRecibido: r.total }),
    tarjetas: (r) => (r.porProveedor ?? []).slice(0, 4).map((p: any) => ({ label: p.proveedor, valor: `${fmtMoney(p.total)} · ${p.recepciones} rec.` })),
  },
  {
    id: 'cierres-caja',
    titulo: 'Cierres de caja: sobrantes y faltantes',
    filtros: ['fechas', 'cajaId', 'soloDiferencias'],
    cargar: (q) => api.reportes.get('cierres-caja', q),
    leer: (r) => ({ filas: r.data ?? [], resumen: r.resumen ?? {} }),
    columnas: () => [
      { key: 'caja', label: 'Caja' },
      { key: 'abiertoPor', label: 'Abrió' },
      { key: 'cerradoPor', label: 'Cerró' },
      { key: 'fechaCierre', label: 'Cierre', type: 'datetime' },
      { key: 'fondoInicial', label: 'Fondo', type: 'money' },
      { key: 'efectivo', label: 'Efectivo', type: 'money' },
      { key: 'tarjeta', label: 'Tarjeta', type: 'money' },
      { key: 'transferencia', label: 'SINPE', type: 'money' },
      { key: 'credito', label: 'Crédito', type: 'money' },
      { key: 'cargoHabitacion', label: 'Habitación', type: 'money' },
      { key: 'abonosEfectivo', label: 'Abonos ef.', type: 'money' },
      { key: 'esperado', label: 'Esperado', type: 'money' },
      { key: 'contado', label: 'Contado', type: 'money' },
      { key: 'diferencia', label: 'Diferencia', type: 'money' },
      { key: 'resultado', label: 'Resultado' },
    ],
    totales: (f) => ({
      caja: `TOTAL (${f.length})`,
      ...Object.fromEntries(['fondoInicial', 'efectivo', 'tarjeta', 'transferencia', 'credito', 'cargoHabitacion', 'abonosEfectivo', 'esperado', 'contado', 'diferencia'].map((k) => [k, sum(f, k)])),
    }),
    tarjetas: (r) => [
      { label: 'Cierres', valor: String(r.cierres ?? 0) },
      { label: 'Con diferencia', valor: String(r.conDiferencia ?? 0) },
      { label: 'Sobrantes', valor: fmtMoney(r.sobrantes) },
      { label: 'Faltantes', valor: fmtMoney(r.faltantes) },
    ],
    resaltar: (f) => (f.resultado === 'FALTANTE' ? 'bg-red-50/60' : f.resultado === 'SOBRANTE' ? 'bg-amber-50/60' : undefined),
  },
];

const TAB_LABEL: Record<string, string> = {
  ventas: 'Ventas', 'formas-pago': 'Formas de pago', 'productos-vendidos': 'Más vendidos', existencias: 'Existencias',
  kardex: 'Kardex', compras: 'Compras', 'cierres-caja': 'Cierres de caja',
};

const FILTROS_INICIALES: Record<string, string | boolean> = {
  fechaInicio: '', fechaFin: '', pointOfSaleId: '', usuarioId: '', productId: '', warehouseId: '', supplierId: '', cajaId: '',
  orden: 'cantidad', soloBajoMinimo: false, soloDiferencias: false,
};

// Today as YYYY-MM-DD in local time
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Reports screen
export const Reportes: React.FC = () => {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [opciones, setOpciones] = useState<any>({ puntosVenta: [], usuarios: [], cajas: [], bodegas: [], proveedores: [], productos: [] });
  const [tab, setTab] = useState('ventas');
  const [filtros, setFiltros] = useState<Record<string, string | boolean>>(FILTROS_INICIALES);
  const [filas, setFilas] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [exportando, setExportando] = useState('');

  const def = REPORTES.find((r) => r.id === tab)!;

  useEffect(() => {
    api.reportes.getDashboardKPIs().then((r) => r.success && setDashboard(r.data));
    api.reportes.get('opciones').then((r) => r.success && setOpciones(r.data));
  }, []);

  // Only the filters used by the active report are sent
  const consulta = useMemo(() => {
    const q: Record<string, unknown> = {};
    for (const f of def.filtros) {
      if (f === 'fechas') {
        q.fechaInicio = filtros.fechaInicio || undefined;
        q.fechaFin = filtros.fechaFin || undefined;
      } else if (typeof filtros[f] === 'boolean') {
        q[f] = filtros[f] ? 'true' : undefined;
      } else {
        q[f] = filtros[f] || undefined;
      }
    }
    return q;
  }, [def, filtros]);

  useEffect(() => {
    if (def.requiere && !consulta[def.requiere]) {
      setFilas([]);
      setResumen({});
      setError('');
      return;
    }
    let vigente = true;
    setCargando(true);
    def.cargar(consulta).then((res) => {
      if (!vigente) return;
      setCargando(false);
      if (!res.success) {
        setError(res.message || 'No se pudo generar el reporte');
        setFilas([]);
        return;
      }
      setError('');
      const { filas: f, resumen: r } = def.leer(res);
      setFilas(f);
      setResumen(r);
    });
    return () => {
      vigente = false;
    };
  }, [def, consulta]);

  const columnas = def.columnas(consulta);
  const totales = def.totales && filas.length ? def.totales(filas, resumen) : undefined;

  // Human-readable description of the applied filters (printed in every export header)
  const nombre = (lista: any[], id: unknown, campo = 'nombre') => lista.find((x) => x.id === id)?.[campo] ?? String(id);
  const descripcionFiltros = (): string[] => {
    const d: string[] = [];
    if (consulta.fechaInicio || consulta.fechaFin) d.push(`Fechas: ${consulta.fechaInicio || 'inicio'} a ${consulta.fechaFin || 'hoy'}`);
    if (consulta.pointOfSaleId) d.push(`Punto de venta: ${nombre(opciones.puntosVenta, consulta.pointOfSaleId)}`);
    if (consulta.usuarioId) d.push(`Usuario: ${nombre(opciones.usuarios, consulta.usuarioId)}`);
    if (consulta.productId) d.push(`Producto: ${nombre(opciones.productos, consulta.productId)}`);
    if (consulta.warehouseId) d.push(`Bodega: ${nombre(opciones.bodegas, consulta.warehouseId)}`);
    if (consulta.supplierId) d.push(`Proveedor: ${nombre(opciones.proveedores, consulta.supplierId)}`);
    if (consulta.cajaId) d.push(`Caja: ${nombre(opciones.cajas, consulta.cajaId)}`);
    if (consulta.orden) d.push(`Orden: por ${consulta.orden}`);
    if (consulta.soloBajoMinimo) d.push('Solo bajo mínimo');
    if (consulta.soloDiferencias) d.push('Solo cierres con diferencia');
    return d;
  };

  const exportar = async (formato: 'pdf' | 'xlsx' | 'csv') => {
    const datos = { titulo: def.titulo, filtros: descripcionFiltros(), columnas, filas, totales, usuario: user?.nombre };
    setExportando(formato);
    try {
      if (formato === 'pdf') await exportPDF(datos);
      else if (formato === 'xlsx') await exportXLSX(datos);
      else exportCSV(datos);
    } catch (e: any) {
      setError(`No se pudo exportar: ${e?.message ?? e}`);
    } finally {
      setExportando('');
    }
  };

  const set = (k: string, v: string | boolean) => setFiltros((f) => ({ ...f, [k]: v }));
  const usa = (f: Filtro) => def.filtros.includes(f);
  const rangoRapido = (dias: number) => {
    const fin = new Date();
    const ini = new Date();
    ini.setDate(fin.getDate() - dias);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setFiltros((f) => ({ ...f, fechaInicio: iso(ini), fechaFin: iso(fin) }));
  };

  const select = (k: Filtro, label: string, lista: any[], texto: (x: any) => string) => (
    <label className="block">
      <span className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">{label}</span>
      <select value={String(filtros[k])} onChange={(e) => set(k, e.target.value)} className={`${inputClass} py-1.5 text-xs`}>
        <option value="">{def.requiere === k ? 'Seleccione...' : 'Todos'}</option>
        {lista.map((x) => <option key={x.id} value={x.id}>{texto(x)}</option>)}
      </select>
    </label>
  );

  const kpis = [
    { label: 'Ventas de hoy', valor: fmtMoney(dashboard?.ventasHoy), icon: DollarSign, color: 'bg-emerald-100 text-emerald-700' },
    { label: 'Transacciones hoy', valor: String(dashboard?.transaccionesHoy ?? 0), icon: ShoppingCart, color: 'bg-blue-100 text-blue-700' },
    { label: 'Ticket promedio hoy', valor: fmtMoney(dashboard?.ticketPromedio), icon: TrendingUp, color: 'bg-purple-100 text-purple-700' },
    { label: 'Alertas de bajo stock', valor: `${dashboard?.alertasStockBajo ?? 0} artículos`, icon: AlertTriangle, color: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Today's operating indicators (REP-008) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${k.color}`}><k.icon className="w-6 h-6" /></div>
            <div>
              <span className="text-xs text-gray-500 font-semibold block">{k.label}</span>
              <span className="text-xl font-extrabold text-gray-900 mt-0.5 block tabular-nums">{k.valor}</span>
            </div>
          </div>
        ))}
      </div>

      <Tabs
        tabs={REPORTES.map((r) => ({ id: r.id, label: TAB_LABEL[r.id] ?? r.titulo }))}
        active={tab}
        onChange={(id) => { setTab(id); setError(''); }}
      />

      {/* Filters of the active report */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
          {usa('fechas') && (
            <>
              <label className="block">
                <span className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Desde</span>
                <input type="date" value={String(filtros.fechaInicio)} max={hoyISO()} onChange={(e) => set('fechaInicio', e.target.value)} className={`${inputClass} py-1.5 text-xs`} />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Hasta (incluido)</span>
                <input type="date" value={String(filtros.fechaFin)} onChange={(e) => set('fechaFin', e.target.value)} className={`${inputClass} py-1.5 text-xs`} />
              </label>
            </>
          )}
          {usa('productId') && select('productId', 'Producto', opciones.productos.filter((p: any) => def.id !== 'kardex' || !p.esServicio), (p) => `${p.codigo} · ${p.nombre}`)}
          {usa('pointOfSaleId') && select('pointOfSaleId', 'Punto de venta', opciones.puntosVenta, (p) => p.nombre)}
          {usa('usuarioId') && select('usuarioId', 'Usuario', opciones.usuarios, (u) => u.nombre)}
          {usa('warehouseId') && select('warehouseId', 'Bodega', opciones.bodegas, (b) => b.nombre)}
          {usa('supplierId') && select('supplierId', 'Proveedor', opciones.proveedores, (p) => p.nombre)}
          {usa('cajaId') && select('cajaId', 'Caja', opciones.cajas, (c) => c.nombre)}
          {usa('orden') && (
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Ordenar por</span>
              <select value={String(filtros.orden)} onChange={(e) => set('orden', e.target.value)} className={`${inputClass} py-1.5 text-xs`}>
                <option value="cantidad">Cantidad vendida</option>
                <option value="monto">Monto vendido</option>
              </select>
            </label>
          )}
          {usa('soloBajoMinimo') && (
            <label className="flex items-center gap-2 text-xs text-gray-700 pb-2">
              <input type="checkbox" checked={Boolean(filtros.soloBajoMinimo)} onChange={(e) => set('soloBajoMinimo', e.target.checked)} className="rounded text-emerald-600" />
              Solo bajo mínimo
            </label>
          )}
          {usa('soloDiferencias') && (
            <label className="flex items-center gap-2 text-xs text-gray-700 pb-2">
              <input type="checkbox" checked={Boolean(filtros.soloDiferencias)} onChange={(e) => set('soloDiferencias', e.target.checked)} className="rounded text-emerald-600" />
              Solo con sobrante o faltante
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {usa('fechas') && (
              <>
                <Button variant="ghost" small onClick={() => rangoRapido(0)}>Hoy</Button>
                <Button variant="ghost" small onClick={() => rangoRapido(6)}>Últimos 7 días</Button>
                <Button variant="ghost" small onClick={() => rangoRapido(29)}>Últimos 30 días</Button>
              </>
            )}
            <Button variant="ghost" small onClick={() => setFiltros(FILTROS_INICIALES)}>Limpiar filtros</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" small disabled={!filas.length || Boolean(exportando)} onClick={() => exportar('pdf')}>
              <FileText className="w-3.5 h-3.5" /> {exportando === 'pdf' ? 'Generando...' : 'PDF'}
            </Button>
            <Button variant="secondary" small disabled={!filas.length || Boolean(exportando)} onClick={() => exportar('xlsx')}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> {exportando === 'xlsx' ? 'Generando...' : 'Excel'}
            </Button>
            <Button variant="secondary" small disabled={!filas.length || Boolean(exportando)} onClick={() => exportar('csv')}>
              <FileDown className="w-3.5 h-3.5" /> CSV
            </Button>
          </div>
        </div>
      </div>

      {error && <Alert kind="error" message={error} onClose={() => setError('')} />}

      {def.tarjetas && filas.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {def.tarjetas(resumen).map((t) => (
            <div key={t.label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <span className="block text-[11px] text-gray-500 font-semibold uppercase truncate">{t.label}</span>
              <span className="block text-base font-extrabold text-gray-900 tabular-nums">{t.valor}</span>
            </div>
          ))}
        </div>
      )}

      {def.requiere && !consulta[def.requiere] ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          Seleccione un producto para ver su Kardex.
        </div>
      ) : cargando ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Generando reporte...</div>
      ) : (
        <ReportTable columnas={columnas} filas={filas} totales={totales} resaltar={def.resaltar} />
      )}
    </div>
  );
};
