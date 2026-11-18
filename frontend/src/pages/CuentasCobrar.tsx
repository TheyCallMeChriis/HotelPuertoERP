import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Plus, Search, XCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ReportTable } from '../components/ReportTable';
import { Alert, Button, Field, Modal, Tabs, inputClass } from '../components/ui';
import { ReportColumn, exportPDF, exportXLSX, formatValue } from '../utils/report-export';

// Accounts receivable: balances, payments, statements and aging (CLI-004, CLI-005, CLI-006)

const fmt = (v: unknown) => formatValue(v, 'money');
const TRAMOS: Array<{ key: string; label: string }> = [
  { key: 'CORRIENTE', label: 'Corriente' }, { key: '1-30', label: '1-30 días' }, { key: '31-60', label: '31-60 días' },
  { key: '61-90', label: '61-90 días' }, { key: 'MAS_90', label: 'Más de 90' },
];
const COL_DOCS: ReportColumn[] = [
  { key: 'consecutivo', label: 'Documento' }, { key: 'fecha', label: 'Fecha', type: 'date' }, { key: 'vencimiento', label: 'Vence', type: 'date' },
  { key: 'monto', label: 'Monto', type: 'money' }, { key: 'abonado', label: 'Abonado', type: 'money' },
  { key: 'notasCredito', label: 'N. crédito', type: 'money' }, { key: 'saldo', label: 'Saldo', type: 'money' },
  { key: 'diasVencido', label: 'Días venc.', type: 'int' }, { key: 'estado', label: 'Estado' },
];
const COL_ABONOS: ReportColumn[] = [
  { key: 'consecutivo', label: 'Abono' }, { key: 'fecha', label: 'Fecha', type: 'datetime' }, { key: 'formaPago', label: 'Forma de pago' },
  { key: 'referencia', label: 'Referencia' }, { key: 'documentos', label: 'Aplicado a' }, { key: 'usuario', label: 'Recibió' },
  { key: 'monto', label: 'Monto', type: 'money' }, { key: 'estado', label: 'Estado' },
];
// Aging report columns
const COL_ANT: ReportColumn[] = [
  { key: 'identificacion', label: 'Identificación' }, { key: 'cliente', label: 'Cliente' }, { key: 'documentos', label: 'Docs.', type: 'int' },
  ...TRAMOS.map((t) => ({ key: t.key, label: t.label, type: 'money' as const })), { key: 'total', label: 'Total', type: 'money' },
];

// Accounts receivable screen
export const CuentasCobrar: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [tab, setTab] = useState('clientes');
  const [corte, setCorte] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [filtro, setFiltro] = useState('');
  const [soloSaldo, setSoloSaldo] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState<any | null>(null);
  const [ant, setAnt] = useState<{ filas: any[]; resumen: any }>({ filas: [], resumen: {} });
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [abono, setAbono] = useState<any | null>(null);
  const [formas, setFormas] = useState<any[]>([]);
  const [cajas, setCajas] = useState<any[]>([]);
  const [turno, setTurno] = useState<any | null>(null);
  const [anular, setAnular] = useState<any | null>(null);

  const cargarClientes = async () => {
    const r = await api.cxc.getClientes(corte || undefined);
    if (r.success) setClientes(r.data || []); else setError(r.message || 'No se pudieron cargar las cuentas');
  };
  const cargarCuenta = async (id = sel) => {
    if (!id) return;
    const r = await api.cxc.getEstadoCuenta(id, corte || undefined);
    if (r.success) setCuenta(r.data); else setError(r.message || 'No se pudo cargar el estado de cuenta');
  };
  const cargarAntiguedad = async () => {
    const r: any = await api.cxc.getAntiguedad(corte || undefined);
    if (r.success) setAnt({ filas: r.data || [], resumen: r.resumen || {} }); else setError(r.message || 'No se pudo cargar el reporte');
  };

  useEffect(() => {
    cargarClientes();
    if (sel) cargarCuenta();
    if (tab === 'antiguedad') cargarAntiguedad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corte, tab]);

  useEffect(() => {
    api.catalogos.getFormasPago().then((r) => r.success && setFormas((r.data || []).filter((f: any) => !['CREDITO', 'CARGO_HABITACION'].includes(f.codigo))));
    api.catalogos.getCajas().then((r) => r.success && setCajas(r.data || []));
  }, []);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return clientes.filter((c) => (!soloSaldo || c.saldo > 0) && (!q || `${c.identificacion} ${c.nombre}`.toLowerCase().includes(q)));
  }, [clientes, filtro, soloSaldo]);

  const abrirCuenta = (id: string) => { setSel(id); setCuenta(null); cargarCuenta(id); };

  const abrirAbono = async () => {
    setError('');
    const propio = await api.caja.getTurnoActivo();
    setTurno(propio.success ? propio.data : null);
    setAbono({ paymentMethodId: formas[0]?.id ?? '', monto: '', saleId: '', referencia: '', notas: '', cajaId: propio.data?.cajaId ?? '' });
  };
  const elegirCaja = async (cajaId: string) => {
    setAbono((a: any) => ({ ...a, cajaId }));
    const r = cajaId ? await api.caja.getTurnoActivo(cajaId) : null;
    setTurno(r?.success ? r.data : null);
  };
  const esEfectivo = formas.find((f) => f.id === abono?.paymentMethodId)?.codigo === 'EFECTIVO';

  const guardarAbono = async () => {
    const monto = Number(abono.monto);
    if (!(monto > 0)) return setError('Indique un monto mayor que cero');
    if (esEfectivo && !turno) return setError('Para recibir efectivo seleccione una caja con turno abierto');
    const r = await api.cxc.registrarAbono({
      customerId: sel, paymentMethodId: abono.paymentMethodId, monto, saleId: abono.saleId || null,
      cashShiftId: turno?.id ?? null, referencia: abono.referencia || null, notas: abono.notas || null,
    });
    if (!r.success) return setError(r.message || 'No se pudo registrar el abono');
    setAbono(null);
    setMensaje(`${r.message}. Saldo actual: ${fmt(r.data.saldoNuevo)}`);
    cargarCuenta(); cargarClientes();
  };

  const guardarAnulacion = async () => {
    if (!anular.motivo?.trim()) return setError('Indique el motivo de la anulación');
    const r = await api.cxc.anularAbono(anular.id, anular.motivo.trim());
    if (!r.success) return setError(r.message || 'No se pudo anular');
    setAnular(null);
    setMensaje(r.message || 'Abono anulado');
    cargarCuenta(); cargarClientes();
  };

  const exportar = async (formato: 'pdf' | 'xlsx', tipo: 'cuenta' | 'antiguedad') => {
    const filtros = [`Fecha de corte: ${corte || 'hoy'}`];
    const datos = tipo === 'cuenta'
      ? {
          titulo: `Estado de cuenta · ${cuenta.cliente.nombre} (${cuenta.cliente.identificacion})`,
          filtros: [...filtros, `Límite ${fmt(cuenta.cliente.limiteCredito)} · plazo ${cuenta.cliente.diasCredito} días · saldo ${fmt(cuenta.resumen.saldo)} · vencido ${fmt(cuenta.resumen.vencido)}`],
          columnas: COL_DOCS, filas: cuenta.documentos,
          totales: { consecutivo: 'TOTAL', monto: cuenta.resumen.totalCredito, abonado: cuenta.resumen.totalAbonado, notasCredito: cuenta.resumen.totalNotasCredito, saldo: cuenta.resumen.saldo },
          usuario: user?.nombre,
        }
      : { titulo: 'Antigüedad de saldos', filtros, columnas: COL_ANT, filas: ant.filas, totales: { cliente: 'TOTAL', ...ant.resumen }, usuario: user?.nombre };
    try { if (formato === 'pdf') await exportPDF(datos); else await exportXLSX(datos); } catch (e: any) { setError(`No se pudo exportar: ${e?.message ?? e}`); }
  };

  const puedeAbonar = hasPermission('CLIENTES', 'CREAR');
  const puedeAnular = hasPermission('CLIENTES', 'ANULAR');
  const pendientes = cuenta?.documentos.filter((d: any) => d.saldo > 0) ?? [];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900">Cuentas por cobrar</h1>
          <p className="text-xs text-gray-500">Saldos de clientes a crédito, abonos, estado de cuenta y antigüedad de saldos.</p>
        </div>
        <label className="block">
          <span className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Fecha de corte</span>
          <input type="date" value={corte} onChange={(e) => setCorte(e.target.value)} className={`${inputClass} py-1.5 text-xs`} />
        </label>
      </div>
      <Tabs tabs={[{ id: 'clientes', label: 'Clientes y estado de cuenta' }, { id: 'antiguedad', label: 'Antigüedad de saldos' }]} active={tab} onChange={setTab} />
      {mensaje && <Alert kind="success" message={mensaje} onClose={() => setMensaje('')} />}
      {error && !abono && !anular && <Alert kind="error" message={error} onClose={() => setError('')} />}

      {tab === 'clientes' && (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 space-y-2 h-fit">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar cliente..." className={`${inputClass} pl-9`} />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={soloSaldo} onChange={(e) => setSoloSaldo(e.target.checked)} className="rounded text-emerald-600" /> Solo con saldo
            </label>
            <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {visibles.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">Sin clientes</p>}
              {visibles.map((c) => (
                <button key={c.id} onClick={() => abrirCuenta(c.id)}
                  className={`w-full text-left px-2 py-2 rounded-md ${sel === c.id ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                  <span className="block text-xs font-bold text-gray-900">{c.nombre}</span>
                  <span className="flex justify-between text-[11px] text-gray-500">
                    <span className="font-mono">{c.identificacion}</span>
                    <span className={c.vencido > 0 ? 'text-red-600 font-bold' : 'font-semibold'}>{fmt(c.saldo)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {!sel && <p className="text-sm text-gray-400 text-center py-16">Seleccione un cliente para ver su estado de cuenta.</p>}
            {sel && !cuenta && <p className="text-sm text-gray-400 text-center py-16">Cargando...</p>}
            {cuenta && <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-black text-gray-900">{cuenta.cliente.nombre}</h2>
                  <p className="text-xs text-gray-500">
                    {cuenta.cliente.identificacion} · {cuenta.cliente.creditoActivo ? `Límite ${fmt(cuenta.cliente.limiteCredito)} a ${cuenta.cliente.diasCredito} días` : 'Crédito no autorizado'}
                    {cuenta.cliente.contacto ? ` · Contacto: ${cuenta.cliente.contacto}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" small onClick={() => exportar('pdf', 'cuenta')}><FileDown className="w-3.5 h-3.5" /> PDF</Button>
                  <Button variant="secondary" small onClick={() => exportar('xlsx', 'cuenta')}><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</Button>
                  {puedeAbonar && pendientes.length > 0 && <Button small onClick={abrirAbono}><Plus className="w-3.5 h-3.5" /> Registrar abono</Button>}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[['Saldo', cuenta.resumen.saldo, 'text-gray-900'], ['Vencido', cuenta.resumen.vencido, 'text-red-600'],
                  ['Disponible', cuenta.resumen.disponible, 'text-emerald-700'], ['Total abonado', cuenta.resumen.totalAbonado, 'text-blue-700']].map(([l, v, c]) => (
                  <div key={l as string} className="bg-white border border-gray-200 rounded-xl p-3">
                    <span className="block text-[11px] text-gray-500 uppercase font-semibold">{l}</span>
                    <span className={`block text-lg font-black ${c}`}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                {TRAMOS.map((t) => (
                  <div key={t.key} className={`rounded-lg p-2 ${t.key === 'CORRIENTE' ? 'bg-emerald-50' : cuenta.resumen.tramos[t.key] > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <span className="block text-[10px] text-gray-500 uppercase font-semibold">{t.label}</span>
                    <span className="block text-xs font-bold">{fmt(cuenta.resumen.tramos[t.key])}</span>
                  </div>
                ))}
              </div>
              <h3 className="text-sm font-bold text-gray-700">Documentos</h3>
              <ReportTable columnas={COL_DOCS} filas={cuenta.documentos.map((d: any) => ({ ...d, estado: ({ AL_DIA: 'Al día', VENCIDO: 'Vencido', PAGADO: 'Pagado' } as Record<string, string>)[d.estado] ?? d.estado }))} vacio="El cliente no tiene ventas a crédito"
                resaltar={(f) => (f.estado === 'Vencido' ? 'bg-red-50/60' : f.estado === 'Pagado' ? 'text-gray-400' : undefined)}
                totales={{ consecutivo: 'TOTAL', monto: cuenta.resumen.totalCredito, abonado: cuenta.resumen.totalAbonado, notasCredito: cuenta.resumen.totalNotasCredito, saldo: cuenta.resumen.saldo }} />
              <h3 className="text-sm font-bold text-gray-700">Historial de abonos</h3>
              <ReportTable columnas={puedeAnular ? [...COL_ABONOS, { key: 'accion', label: '' }] : COL_ABONOS} vacio="Sin abonos registrados"
                resaltar={(f) => (f.estado === 'ANULADO' ? 'text-gray-400 line-through' : undefined)}
                filas={cuenta.abonos.map((a: any) => ({
                  ...a,
                  estado: a.estado === 'ANULADO' ? `ANULADO: ${a.motivoAnulacion}` : a.estado,
                  accion: a.estado === 'APLICADO' && (
                    <button onClick={() => { setError(''); setAnular({ ...a, motivo: '' }); }} className="text-red-600 hover:underline inline-flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Anular
                    </button>
                  ),
                }))} />
            </>}
          </div>
        </div>
      )}

      {tab === 'antiguedad' && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" small onClick={() => exportar('pdf', 'antiguedad')}><FileDown className="w-3.5 h-3.5" /> PDF</Button>
            <Button variant="secondary" small onClick={() => exportar('xlsx', 'antiguedad')}><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</Button>
          </div>
          <ReportTable columnas={COL_ANT} filas={ant.filas} vacio="No hay saldos pendientes a la fecha de corte"
            totales={ant.filas.length ? { cliente: `TOTAL (${ant.resumen.clientes})`, ...ant.resumen } : undefined} />
        </div>
      )}

      {abono && (
        <Modal title="Registrar abono" onClose={() => setAbono(null)}
          footer={<><Button variant="secondary" onClick={() => setAbono(null)}>Cancelar</Button><Button onClick={guardarAbono}>Registrar</Button></>}>
          {error && <Alert kind="error" message={error} />}
          <p className="text-xs text-gray-500">Saldo pendiente: <b>{fmt(cuenta.resumen.saldo)}</b></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Forma de pago" required>
              <select value={abono.paymentMethodId} onChange={(e) => setAbono({ ...abono, paymentMethodId: e.target.value })} className={inputClass}>
                {formas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </Field>
            <Field label="Monto (₡)" required>
              <input type="number" min={0} step="0.01" value={abono.monto} onChange={(e) => setAbono({ ...abono, monto: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Aplicar a" hint="Automático: documentos más antiguos primero">
              <select value={abono.saleId} onChange={(e) => setAbono({ ...abono, saleId: e.target.value })} className={inputClass}>
                <option value="">Automático</option>
                {pendientes.map((d: any) => <option key={d.saleId} value={d.saleId}>{d.consecutivo} · saldo {fmt(d.saldo)}</option>)}
              </select>
            </Field>
            <Field label="Caja que recibe" required={esEfectivo} hint={turno ? `Turno abierto por ${turno.usuario?.nombre}` : 'Sin turno abierto'}>
              <select value={abono.cajaId} onChange={(e) => elegirCaja(e.target.value)} className={inputClass}>
                <option value="">{esEfectivo ? 'Seleccione...' : 'Ninguna'}</option>
                {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>
            <Field label="Referencia" hint="Voucher o comprobante SINPE">
              <input value={abono.referencia} onChange={(e) => setAbono({ ...abono, referencia: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Notas">
              <input value={abono.notas} onChange={(e) => setAbono({ ...abono, notas: e.target.value })} className={inputClass} />
            </Field>
          </div>
        </Modal>
      )}

      {anular && (
        <Modal title={`Anular abono ${anular.consecutivo}`} onClose={() => setAnular(null)}
          footer={<><Button variant="secondary" onClick={() => setAnular(null)}>Cancelar</Button><Button variant="danger" onClick={guardarAnulacion}>Anular abono</Button></>}>
          {error && <Alert kind="error" message={error} />}
          <p className="text-xs text-gray-600">Se restituirá {fmt(anular.monto)} al saldo del cliente. Si el abono fue en efectivo, su turno de caja debe seguir abierto.</p>
          <Field label="Motivo" required>
            <textarea rows={2} value={anular.motivo} onChange={(e) => setAnular({ ...anular, motivo: e.target.value })} className={inputClass} />
          </Field>
        </Modal>
      )}
    </div>
  );
};
