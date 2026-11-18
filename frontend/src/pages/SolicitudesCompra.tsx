import React, { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, FileText, Plus, ShoppingBag, Trash2, XCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Field, Modal, inputClass } from '../components/ui';

// Internal purchase requests with approval (COM-002, COM-003).
// Warehouse or purchasing staff request; a role with COMPRAS:APROBAR approves or rejects;
// purchasing converts the approved request into a purchase order.

const ESTADOS = ['PENDIENTE', 'APROBADA', 'CONVERTIDA', 'RECHAZADA', 'CANCELADA'];
const estiloEstado: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800', APROBADA: 'bg-emerald-100 text-emerald-800', CONVERTIDA: 'bg-blue-100 text-blue-800',
  RECHAZADA: 'bg-red-100 text-red-700', CANCELADA: 'bg-gray-200 text-gray-600',
};
// Short local date and time
const fecha = (d?: string) => (d ? new Date(d).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Internal purchase requests tab
export const SolicitudesCompra: React.FC<{ onOrdenCreada?: () => void }> = ({ onOrdenCreada }) => {
  const { user, hasPermission, hasRole } = useAuth();
  const esAdmin = hasRole('ADMINISTRADOR');
  const puedeSolicitar = hasPermission('COMPRAS', 'CREAR') || hasPermission('INVENTARIO', 'CREAR');
  const puedeAprobar = hasPermission('COMPRAS', 'APROBAR');
  const puedeConvertir = hasPermission('COMPRAS', 'CREAR');

  const [lista, setLista] = useState<any[]>([]);
  const [estado, setEstado] = useState('');
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState<any | null>(null);
  const [detalle, setDetalle] = useState<any | null>(null);
  const [accion, setAccion] = useState<{ tipo: 'APROBAR' | 'RECHAZAR' | 'CANCELAR' | 'CONVERTIR'; texto: string; supplierId: string; fechaEsperada: string; precios: Record<string, string> } | null>(null);

  const cargar = async () => {
    const r = await api.compras.getSolicitudes(estado || undefined);
    if (r.success) setLista(r.data || []); else setError(r.message || 'No se pudieron cargar las solicitudes');
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [estado]);
  useEffect(() => {
    api.catalogos.getBodegas().then((r) => r.success && setBodegas(r.data || []));
    api.catalogos.getProductos().then((r) => r.success && setProductos((r.data || []).filter((p: any) => !p.esServicio)));
    if (puedeConvertir) api.catalogos.getProveedores().then((r) => r.success && setProveedores(r.data || []));
  }, [puedeConvertir]);

  const pendientes = useMemo(() => lista.filter((s) => s.estado === 'PENDIENTE').length, [lista]);

  const abrirNueva = () => {
    setError('');
    setNueva({ warehouseId: bodegas[0]?.id ?? '', departamento: '', justificacion: '', prioridad: 'NORMAL', items: [{ productId: '', cantidad: '' }] });
  };
  const setItem = (i: number, campo: string, valor: string) =>
    setNueva((n: any) => ({ ...n, items: n.items.map((it: any, j: number) => (j === i ? { ...it, [campo]: valor } : it)) }));

  const guardarNueva = async () => {
    const items = nueva.items.filter((it: any) => it.productId).map((it: any) => ({ productId: it.productId, cantidad: Number(it.cantidad), notas: it.notas || null }));
    if (items.length === 0) return setError('Agregue al menos un artículo');
    if (items.some((it: any) => !(it.cantidad > 0))) return setError('Las cantidades deben ser mayores que cero');
    const r = await api.compras.crearSolicitud({ ...nueva, departamento: nueva.departamento || null, items });
    if (!r.success) return setError(r.message || 'No se pudo registrar');
    setNueva(null); setMensaje(r.message || 'Solicitud registrada'); cargar();
  };

  const abrirAccion = (tipo: 'APROBAR' | 'RECHAZAR' | 'CANCELAR' | 'CONVERTIR') => {
    setError('');
    setAccion({ tipo, texto: '', supplierId: '', fechaEsperada: '', precios: {} });
  };

  const ejecutar = async () => {
    if (!accion || !detalle) return;
    let r;
    if (accion.tipo === 'APROBAR' || accion.tipo === 'RECHAZAR') {
      if (accion.tipo === 'RECHAZAR' && !accion.texto.trim()) return setError('Indique el motivo del rechazo');
      r = await api.compras.revisarSolicitud(detalle.id, { decision: accion.tipo, comentario: accion.texto.trim() || null });
    } else if (accion.tipo === 'CANCELAR') {
      if (accion.texto.trim().length < 3) return setError('Indique el motivo de la cancelación');
      r = await api.compras.cancelarSolicitud(detalle.id, accion.texto.trim());
    } else {
      if (!accion.supplierId) return setError('Seleccione el proveedor');
      const precios = Object.entries(accion.precios).filter(([, v]) => v !== '').map(([productId, v]) => ({ productId, precioUnitario: Number(v) }));
      r = await api.compras.convertirSolicitud(detalle.id, {
        supplierId: accion.supplierId, fechaEsperada: accion.fechaEsperada || null, notas: accion.texto.trim() || null, precios,
      });
      if (r.success) onOrdenCreada?.();
    }
    if (!r.success) return setError(r.message || 'No se pudo completar la acción');
    setAccion(null); setDetalle(null); setMensaje(r.message || 'Listo'); cargar();
  };

  const esMia = (s: any) => s.solicitante?.id === user?.id;
  const puedeRevisarEsta = (s: any) => puedeAprobar && s.estado === 'PENDIENTE' && (!esMia(s) || esAdmin);
  const puedeCancelarEsta = (s: any) => ['PENDIENTE', 'APROBADA'].includes(s.estado) && (esMia(s) || puedeAprobar);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" /> Solicitudes internas de compra
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Los departamentos solicitan, un aprobador autoriza y proveeduría genera la orden de compra.
            {puedeAprobar && pendientes > 0 && <b className="text-amber-700"> {pendientes} pendiente(s) de aprobación.</b>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={`${inputClass} py-1.5 text-xs w-40`}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          {puedeSolicitar && <Button onClick={abrirNueva} className="whitespace-nowrap"><Plus className="w-4 h-4" /> Nueva solicitud</Button>}
        </div>
      </div>

      {mensaje && <Alert kind="success" message={mensaje} onClose={() => setMensaje('')} />}
      {error && !nueva && !accion && <Alert kind="error" message={error} onClose={() => setError('')} />}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
            <tr>
              {['Solicitud', 'Fecha', 'Solicitante', 'Departamento', 'Bodega', 'Artículos', 'Prioridad', 'Estado', 'Orden', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lista.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Sin solicitudes</td></tr>}
            {lista.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono font-bold">{s.consecutivo}</td>
                <td className="px-4 py-2.5">{fecha(s.createdAt)}</td>
                <td className="px-4 py-2.5">{s.solicitante?.nombre}</td>
                <td className="px-4 py-2.5">{s.departamento || '—'}</td>
                <td className="px-4 py-2.5">{s.warehouse?.nombre}</td>
                <td className="px-4 py-2.5">{s.details.length}</td>
                <td className="px-4 py-2.5">{s.prioridad === 'URGENTE' ? <span className="text-red-600 font-bold">URGENTE</span> : 'Normal'}</td>
                <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${estiloEstado[s.estado]}`}>{s.estado}</span></td>
                <td className="px-4 py-2.5 font-mono">{s.purchaseOrder?.consecutivo ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <Button variant="ghost" small onClick={() => { setError(''); setDetalle(s); }}><FileText className="w-3.5 h-3.5" /> Ver</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nueva && (
        <Modal wide title="Nueva solicitud de compra" onClose={() => setNueva(null)}
          footer={<><Button variant="secondary" onClick={() => setNueva(null)}>Cancelar</Button><Button onClick={guardarNueva}>Enviar a aprobación</Button></>}>
          {error && <Alert kind="error" message={error} />}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Bodega destino" required>
              <select value={nueva.warehouseId} onChange={(e) => setNueva({ ...nueva, warehouseId: e.target.value })} className={inputClass}>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </Field>
            <Field label="Departamento">
              <input value={nueva.departamento} onChange={(e) => setNueva({ ...nueva, departamento: e.target.value })} placeholder="Cocina, bar, mantenimiento..." className={inputClass} />
            </Field>
            <Field label="Prioridad">
              <select value={nueva.prioridad} onChange={(e) => setNueva({ ...nueva, prioridad: e.target.value })} className={inputClass}>
                <option value="NORMAL">Normal</option><option value="URGENTE">Urgente</option>
              </select>
            </Field>
          </div>
          <Field label="Justificación" required>
            <textarea rows={2} value={nueva.justificacion} onChange={(e) => setNueva({ ...nueva, justificacion: e.target.value })} className={inputClass} />
          </Field>
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-gray-700">Artículos</span>
            {nueva.items.map((it: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_110px_1fr_32px] gap-2 items-center">
                <select value={it.productId} onChange={(e) => setItem(i, 'productId', e.target.value)} className={inputClass}>
                  <option value="">Producto...</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
                </select>
                <input type="number" min={0} step="0.001" placeholder="Cantidad" value={it.cantidad} onChange={(e) => setItem(i, 'cantidad', e.target.value)} className={inputClass} />
                <input placeholder="Nota (opcional)" value={it.notas ?? ''} onChange={(e) => setItem(i, 'notas', e.target.value)} className={inputClass} />
                <button onClick={() => setNueva({ ...nueva, items: nueva.items.filter((_: any, j: number) => j !== i) })} className="text-gray-400 hover:text-red-600" aria-label="Quitar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <Button variant="ghost" small onClick={() => setNueva({ ...nueva, items: [...nueva.items, { productId: '', cantidad: '' }] })}>
              <Plus className="w-3.5 h-3.5" /> Agregar artículo
            </Button>
          </div>
        </Modal>
      )}

      {detalle && !accion && (
        <Modal wide title={`Solicitud ${detalle.consecutivo}`} onClose={() => setDetalle(null)}
          footer={<>
            {puedeCancelarEsta(detalle) && <Button variant="secondary" onClick={() => abrirAccion('CANCELAR')}><Ban className="w-4 h-4" /> Cancelar solicitud</Button>}
            {puedeRevisarEsta(detalle) && <Button variant="danger" onClick={() => abrirAccion('RECHAZAR')}><XCircle className="w-4 h-4" /> Rechazar</Button>}
            {puedeRevisarEsta(detalle) && <Button onClick={() => abrirAccion('APROBAR')}><CheckCircle2 className="w-4 h-4" /> Aprobar</Button>}
            {puedeConvertir && detalle.estado === 'APROBADA' && <Button onClick={() => abrirAccion('CONVERTIR')}><Plus className="w-4 h-4" /> Generar orden de compra</Button>}
          </>}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <p><b>Estado:</b> <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${estiloEstado[detalle.estado]}`}>{detalle.estado}</span></p>
            <p><b>Prioridad:</b> {detalle.prioridad}</p>
            <p><b>Solicitante:</b> {detalle.solicitante?.nombre} · {fecha(detalle.createdAt)}</p>
            <p><b>Bodega:</b> {detalle.warehouse?.nombre}{detalle.departamento ? ` · ${detalle.departamento}` : ''}</p>
            {detalle.revisor && <p className="col-span-2"><b>Revisó:</b> {detalle.revisor.nombre} · {fecha(detalle.fechaRevision)}{detalle.comentarioRevision ? ` — “${detalle.comentarioRevision}”` : ''}</p>}
            {detalle.purchaseOrder && <p className="col-span-2"><b>Orden de compra:</b> {detalle.purchaseOrder.consecutivo} ({detalle.purchaseOrder.estado})</p>}
            <p className="col-span-2"><b>Justificación:</b> {detalle.justificacion}</p>
          </div>
          {puedeAprobar && detalle.estado === 'PENDIENTE' && esMia(detalle) && !esAdmin && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-3 py-2">Usted creó esta solicitud: debe aprobarla otra persona.</p>
          )}
          <table className="min-w-full text-xs border border-gray-100 rounded">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-left">Nota</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {detalle.details.map((d: any) => (
                <tr key={d.id}><td className="px-3 py-2 font-mono">{d.product.codigo}</td><td className="px-3 py-2">{d.product.nombre}</td>
                  <td className="px-3 py-2 text-right">{Number(d.cantidad).toLocaleString('es-CR')}</td><td className="px-3 py-2 text-gray-500">{d.notas || ''}</td></tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {detalle && accion && (
        <Modal wide={accion.tipo === 'CONVERTIR'}
          title={{ APROBAR: 'Aprobar solicitud', RECHAZAR: 'Rechazar solicitud', CANCELAR: 'Cancelar solicitud', CONVERTIR: 'Generar orden de compra' }[accion.tipo] + ` ${detalle.consecutivo}`}
          onClose={() => setAccion(null)}
          footer={<><Button variant="secondary" onClick={() => setAccion(null)}>Volver</Button>
            <Button variant={accion.tipo === 'RECHAZAR' || accion.tipo === 'CANCELAR' ? 'danger' : 'primary'} onClick={ejecutar}>Confirmar</Button></>}>
          {error && <Alert kind="error" message={error} />}
          {accion.tipo === 'CONVERTIR' && <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Proveedor" required>
                <select value={accion.supplierId} onChange={(e) => setAccion({ ...accion, supplierId: e.target.value })} className={inputClass}>
                  <option value="">Seleccione...</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Field>
              <Field label="Fecha esperada">
                <input type="date" value={accion.fechaEsperada} onChange={(e) => setAccion({ ...accion, fechaEsperada: e.target.value })} className={inputClass} />
              </Field>
            </div>
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Precio unitario (₡)</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {detalle.details.map((d: any) => (
                  <tr key={d.id}><td className="px-3 py-2">{d.product.nombre}</td><td className="px-3 py-2 text-right">{Number(d.cantidad).toLocaleString('es-CR')}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} step="0.01" placeholder={String(Number(d.product.costo))} value={accion.precios[d.productId] ?? ''}
                        onChange={(e) => setAccion({ ...accion, precios: { ...accion.precios, [d.productId]: e.target.value } })} className={`${inputClass} w-32 text-right ml-auto`} />
                    </td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500">Si deja el precio vacío se usa el costo actual del producto.</p>
          </>}
          <Field label={accion.tipo === 'APROBAR' ? 'Comentario (opcional)' : accion.tipo === 'CONVERTIR' ? 'Notas para la orden' : 'Motivo'} required={accion.tipo === 'RECHAZAR' || accion.tipo === 'CANCELAR'}>
            <textarea rows={2} value={accion.texto} onChange={(e) => setAccion({ ...accion, texto: e.target.value })} className={inputClass} />
          </Field>
        </Modal>
      )}
    </div>
  );
};
