// Credit note modal (FAC-005, FAC-006).

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Alert, Button, Field, Modal, inputClass } from './ui';

// Full or partial credit note on a sale (FAC-005). Requires VENTAS:ANULAR.
// Then shows the issued document ready to print; reprints are recorded (FAC-006).

const money = (v: unknown) => `₡${Number(v || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Credit note form and the printable issued document
export const NotaCreditoModal: React.FC<{ ventaId: string; onClose: () => void; onEmitida?: () => void }> = ({ ventaId, onClose, onEmitida }) => {
  const [venta, setVenta] = useState<any | null>(null);
  const [cant, setCant] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('');
  const [metodoId, setMetodoId] = useState('');
  const [cajas, setCajas] = useState<any[]>([]);
  const [cajaId, setCajaId] = useState('');
  const [turno, setTurno] = useState<any | null>(null);
  const [referencia, setReferencia] = useState('');
  const [reintegrar, setReintegrar] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [emitida, setEmitida] = useState<any | null>(null);

  useEffect(() => {
    api.ventas.getVentaById(ventaId).then((r) => {
      if (!r.success) return setError(r.message || 'No se pudo cargar la venta');
      setVenta(r.data);
      const primero = r.data.payments.find((p: any) => p.paymentMethod.codigo !== 'CARGO_HABITACION');
      setMetodoId(primero?.paymentMethodId ?? '');
    });
    api.catalogos.getCajas().then((r) => r.success && setCajas(r.data || []));
    api.caja.getTurnoActivo().then((r) => { if (r.success && r.data) { setTurno(r.data); setCajaId(r.data.cajaId); } });
  }, [ventaId]);

  const devuelto = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of venta?.notasCredito ?? []) for (const d of n.details) m[d.saleDetailId] = (m[d.saleDetailId] ?? 0) + Number(d.cantidad);
    return m;
  }, [venta]);
  const pendiente = (d: any) => Number(d.cantidad) - (devuelto[d.id] ?? 0);
  const estimado = (venta?.details ?? []).reduce((t: number, d: any) => t + (Number(cant[d.id] || 0) * Number(d.total)) / Number(d.cantidad), 0);
  const metodos = (venta?.payments ?? []).filter((p: any) => p.paymentMethod.codigo !== 'CARGO_HABITACION');
  const codigo = metodos.find((p: any) => p.paymentMethodId === metodoId)?.paymentMethod.codigo;
  const tieneHabitacion = venta?.payments?.some((p: any) => p.paymentMethod.codigo === 'CARGO_HABITACION');

  const elegirCaja = async (id: string) => {
    setCajaId(id);
    const r = id ? await api.caja.getTurnoActivo(id) : null;
    setTurno(r?.success ? r.data : null);
  };
  const todo = () => setCant(Object.fromEntries((venta?.details ?? []).map((d: any) => [d.id, String(pendiente(d))])));

  const emitir = async () => {
    const items = (venta.details as any[]).filter((d) => Number(cant[d.id] || 0) > 0).map((d) => ({ saleDetailId: d.id, cantidad: Number(cant[d.id]) }));
    if (items.length === 0) return setError('Indique al menos una cantidad a devolver');
    if (motivo.trim().length < 5) return setError('Indique el motivo (mínimo 5 caracteres)');
    if (codigo === 'EFECTIVO' && !turno) return setError('Para reintegrar efectivo seleccione una caja con turno abierto');
    const total = items.every((it) => it.cantidad === pendiente(venta.details.find((d: any) => d.id === it.saleDetailId)))
      && items.length === venta.details.filter((d: any) => pendiente(d) > 0).length;
    setGuardando(true);
    const r = await api.ventas.notaCredito(venta.id, {
      motivo: motivo.trim(), ...(total ? { total: true } : { items }), paymentMethodId: metodoId,
      cashShiftId: codigo === 'EFECTIVO' ? turno?.id : null, referencia: referencia || null, reintegrarInventario: reintegrar,
    });
    setGuardando(false);
    if (!r.success) return setError(r.message || 'No se pudo emitir la nota de crédito');
    setEmitida(r.data);
    onEmitida?.();
  };

  const reimprimir = async () => {
    const r = await api.ventas.reimprimirNota(emitida.id);
    if (r.success) { setEmitida(r.data); setTimeout(() => window.print(), 50); }
  };

  if (emitida) {
    return (
      <Modal title={`Nota de crédito ${emitida.consecutivo}`} onClose={onClose}
        footer={<><Button variant="secondary" onClick={() => (emitida.impreso || emitida.copia ? reimprimir() : (setEmitida({ ...emitida, impreso: true }), window.print()))}>
          {emitida.impreso || emitida.copia ? 'Reimprimir copia' : 'Imprimir'}</Button><Button onClick={onClose}>Cerrar</Button></>}>
        <div className="font-mono text-xs space-y-1">
          <p className="text-center font-bold">HOTEL PUERTO LIMÓN · NOTA DE CRÉDITO</p>
          {emitida.copia > 0 && <p className="text-center font-bold text-red-600">*** COPIA {emitida.copia} ***</p>}
          <p>Documento: <b>{emitida.consecutivo}</b> ({emitida.tipo})</p>
          <p>Venta original: <b>{emitida.sale.consecutivo}</b> del {new Date(emitida.sale.createdAt).toLocaleString('es-CR')}</p>
          <p>Fecha: {new Date(emitida.createdAt).toLocaleString('es-CR')} · Autorizó: {emitida.usuario.nombre}</p>
          {emitida.sale.customer && <p>Cliente: {emitida.sale.customer.nombre} ({emitida.sale.customer.identificacion})</p>}
          <p>Motivo: {emitida.motivo}</p>
          <div className="border-y py-1 my-1">
            {emitida.details.map((d: any) => (
              <div key={d.id} className="flex justify-between"><span>{d.product.nombre} x{Number(d.cantidad)}</span><span>{money(d.total)}</span></div>
            ))}
          </div>
          <div className="flex justify-between"><span>Subtotal</span><span>{money(emitida.subtotal)}</span></div>
          <div className="flex justify-between"><span>I.V.A.</span><span>{money(emitida.impuesto)}</span></div>
          <div className="flex justify-between font-bold text-sm"><span>TOTAL DEVUELTO</span><span>{money(emitida.total)}</span></div>
          <p>Reintegro: {emitida.paymentMethod.nombre}{emitida.referencia ? ` · Ref. ${emitida.referencia}` : ''}</p>
          <p>{emitida.reintegraInventario ? 'Mercadería reintegrada al inventario' : 'Sin reintegro al inventario'}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal wide title={`Nota de crédito sobre ${venta?.consecutivo ?? ''}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={emitir} disabled={guardando || !venta || tieneHabitacion}>{guardando ? 'Emitiendo...' : 'Emitir nota de crédito'}</Button></>}>
      {error && <Alert kind="error" message={error} />}
      {!venta && !error && <p className="text-sm text-gray-400">Cargando...</p>}
      {tieneHabitacion && <Alert kind="error" message="La venta se cargó a una habitación: use Anular, que revierte el cargo en el PMS." />}
      {venta && !tieneHabitacion && <>
        <p className="text-xs text-gray-500">Venta del {new Date(venta.createdAt).toLocaleString('es-CR')} por {money(venta.total)}. La venta original no se modifica: la nota de crédito la compensa.</p>
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-500"><tr>
            <th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Vendido</th><th className="px-3 py-2 text-right">Ya devuelto</th>
            <th className="px-3 py-2 text-right">Total línea</th><th className="px-3 py-2 text-right">Devolver</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {venta.details.map((d: any) => (
              <tr key={d.id}>
                <td className="px-3 py-2">{d.product?.nombre}</td><td className="px-3 py-2 text-right">{Number(d.cantidad)}</td>
                <td className="px-3 py-2 text-right">{devuelto[d.id] ?? 0}</td><td className="px-3 py-2 text-right">{money(d.total)}</td>
                <td className="px-3 py-2 text-right">
                  <input type="number" min={0} max={pendiente(d)} step="0.001" disabled={pendiente(d) <= 0} value={cant[d.id] ?? ''}
                    onChange={(e) => setCant({ ...cant, [d.id]: e.target.value })} className={`${inputClass} w-24 text-right ml-auto`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between items-center">
          <Button variant="ghost" small onClick={todo}>Devolver todo lo pendiente</Button>
          <span className="text-sm font-bold">Monto estimado: {money(estimado)}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Reintegrar por" required hint="Solo formas de pago usadas en la venta">
            <select value={metodoId} onChange={(e) => setMetodoId(e.target.value)} className={inputClass}>
              {metodos.map((p: any) => <option key={p.id} value={p.paymentMethodId}>{p.paymentMethod.nombre} (pagado {money(p.monto)})</option>)}
            </select>
          </Field>
          {codigo === 'EFECTIVO' ? (
            <Field label="Caja de donde sale el efectivo" required hint={turno ? `Turno abierto de ${turno.usuario?.nombre}` : 'Sin turno abierto'}>
              <select value={cajaId} onChange={(e) => elegirCaja(e.target.value)} className={inputClass}>
                <option value="">Seleccione...</option>
                {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Referencia" hint={codigo === 'CREDITO' ? 'Se rebaja del saldo del cliente' : 'Comprobante de la devolución'}>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={inputClass} />
            </Field>
          )}
        </div>
        <Field label="Motivo" required>
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={reintegrar} onChange={(e) => setReintegrar(e.target.checked)} className="rounded text-emerald-600" />
          Reintegrar la mercadería al inventario (desmarque si está dañada)
        </label>
      </>}
    </Modal>
  );
};
