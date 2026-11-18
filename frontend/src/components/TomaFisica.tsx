// Physical inventory count component.

import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, FileText, Play, Save, Search, XCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Field, Modal, inputClass } from './ui';
import { exportPDF, formatValue } from '../utils/report-export';

// Physical inventory count (INV-007): start, count, compare against the system and apply adjustments.

const estadoClase: Record<string, string> = {
  ABIERTA: 'bg-blue-100 text-blue-700',
  APLICADA: 'bg-emerald-100 text-emerald-700',
  ANULADA: 'bg-gray-200 text-gray-600',
};

// Physical count screen (shown as a tab in Inventory)
export const TomaFisica: React.FC<{ bodegas: any[]; bodegaId: string; onAplicada: () => void }> = ({ bodegas, bodegaId, onAplicada }) => {
  const { user, hasPermission } = useAuth();
  const puedeContar = hasPermission('INVENTARIO', 'CREAR');
  const puedeAplicar = hasPermission('INVENTARIO', 'AJUSTE');
  const [tomas, setTomas] = useState<any[]>([]);
  const [toma, setToma] = useState<any | null>(null);
  const [conteos, setConteos] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState('');
  const [vista, setVista] = useState<'todos' | 'pendientes' | 'diferencias'>('todos');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState<'aplicar' | 'anular' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const bodega = bodegas.find((b) => b.id === bodegaId);

  const cargarLista = async () => {
    const r = await api.inventario.getTomas({ warehouseId: bodegaId });
    if (r.success) setTomas(r.data || []);
  };
  const abrir = async (id: string) => {
    const r = await api.inventario.getToma(id);
    if (!r.success) return setError(r.message || 'No se pudo abrir la toma');
    setToma(r.data);
    setConteos(Object.fromEntries(r.data.lineas.map((l: any) => [l.productId, l.cantidadContada === null ? '' : String(l.cantidadContada)])));
  };

  useEffect(() => {
    setToma(null);
    if (bodegaId) cargarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodegaId]);

  const iniciar = async () => {
    setError('');
    const r = await api.inventario.iniciarToma({ warehouseId: bodegaId });
    if (!r.success) return setError(r.message || 'No se pudo iniciar la toma');
    setMensaje(r.message || 'Toma iniciada');
    await cargarLista();
    await abrir(r.data.id);
  };

  // Counts changed since the last save
  const cambios = useMemo(() => {
    if (!toma) return [];
    return toma.lineas
      .filter((l: any) => (conteos[l.productId] ?? '') !== (l.cantidadContada === null ? '' : String(l.cantidadContada)))
      .map((l: any) => ({ productId: l.productId, cantidadContada: conteos[l.productId] === '' ? null : conteos[l.productId] }));
  }, [toma, conteos]);

  const guardar = async () => {
    if (!toma || cambios.length === 0) return true;
    const invalido = cambios.find((c: any) => c.cantidadContada !== null && !/^\d+(\.\d{1,3})?$/.test(String(c.cantidadContada)));
    if (invalido) {
      setError('Los conteos deben ser números no negativos con máximo 3 decimales.');
      return false;
    }
    setGuardando(true);
    const r = await api.inventario.guardarConteos(toma.id, cambios);
    setGuardando(false);
    if (!r.success) {
      setError(r.message || 'No se pudieron guardar los conteos');
      return false;
    }
    setError('');
    setToma(r.data);
    setMensaje(`${cambios.length} conteo(s) guardado(s)`);
    return true;
  };

  const ejecutar = async () => {
    if (!toma || !confirmar) return;
    if (confirmar === 'aplicar') {
      if (!(await guardar())) return;
      const r = await api.inventario.aplicarToma(toma.id, motivo);
      if (!r.success) return setError(r.message || 'No se pudo aplicar');
      setToma(r.data);
      setMensaje(r.message || 'Toma aplicada');
      onAplicada();
    } else {
      if (!motivo.trim()) return setError('Indique el motivo de la anulación');
      const r = await api.inventario.anularToma(toma.id, motivo);
      if (!r.success) return setError(r.message || 'No se pudo anular');
      setMensaje(r.message || 'Toma anulada');
      setToma(null);
    }
    setConfirmar(null);
    setMotivo('');
    cargarLista();
  };

  // Live difference for what is being typed
  const lineas = useMemo(() => {
    if (!toma) return [];
    const q = filtro.trim().toLowerCase();
    return toma.lineas
      .map((l: any) => {
        const txt = conteos[l.productId] ?? '';
        const contada = txt === '' || !/^\d+(\.\d{1,3})?$/.test(txt) ? null : Number(txt);
        const diferencia = contada === null ? null : Math.round((contada - l.cantidadSistema) * 1000) / 1000;
        return { ...l, contadaVista: contada, diferenciaVista: diferencia };
      })
      .filter((l: any) => !q || `${l.codigo} ${l.producto} ${l.categoria}`.toLowerCase().includes(q))
      .filter((l: any) => vista === 'todos' || (vista === 'pendientes' ? l.contadaVista === null : l.diferenciaVista !== null && l.diferenciaVista !== 0));
  }, [toma, conteos, filtro, vista]);

  const hojaConteo = () =>
    toma && exportPDF({
      titulo: `Hoja de conteo ${toma.consecutivo} - ${toma.bodega.nombre}`,
      filtros: [`Iniciada: ${formatValue(toma.fechaInicio, 'datetime')}`, `Estado: ${toma.estado}`],
      columnas: [
        { key: 'codigo', label: 'Código' }, { key: 'producto', label: 'Producto' }, { key: 'categoria', label: 'Categoría' },
        { key: 'cantidadSistema', label: 'Sistema', type: 'qty' }, { key: 'cantidadContada', label: 'Contado', type: 'qty' },
        { key: 'diferencia', label: 'Diferencia', type: 'qty' },
      ],
      filas: toma.lineas,
      usuario: user?.nombre,
    });

  const abierta = tomas.find((t) => t.estado === 'ABIERTA');
  const editable = toma?.estado === 'ABIERTA' && puedeContar;

  return (
    <div className="space-y-4">
      {mensaje && <Alert kind="success" message={mensaje} onClose={() => setMensaje('')} />}
      {error && !confirmar && <Alert kind="error" message={error} onClose={() => setError('')} />}

      {!toma && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Tomas físicas · {bodega?.nombre}</h3>
              <p className="text-xs text-gray-500">Se congela la existencia del sistema al iniciar; al aplicar, cada diferencia genera un ajuste en el Kardex.</p>
            </div>
            {puedeContar && !abierta && (
              <Button onClick={iniciar}><Play className="w-4 h-4" /> Iniciar toma física</Button>
            )}
          </div>
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Toma</th><th className="px-4 py-2 text-left">Iniciada</th><th className="px-4 py-2 text-left">Por</th>
                <th className="px-4 py-2 text-right">Contados</th><th className="px-4 py-2 text-right">Con diferencia</th>
                <th className="px-4 py-2 text-right">Valor diferencia</th><th className="px-4 py-2 text-center">Estado</th><th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tomas.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No hay tomas en esta bodega</td></tr>}
              {tomas.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 font-mono font-bold">{t.consecutivo}</td>
                  <td className="px-4 py-2">{formatValue(t.fechaInicio, 'datetime')}</td>
                  <td className="px-4 py-2">{t.usuario}</td>
                  <td className="px-4 py-2 text-right">{t.resumen.contados}/{t.resumen.productos}</td>
                  <td className="px-4 py-2 text-right">{t.resumen.conDiferencia}</td>
                  <td className="px-4 py-2 text-right">{formatValue(t.resumen.valorDiferencia, 'money')}</td>
                  <td className="px-4 py-2 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${estadoClase[t.estado]}`}>{t.estado}</span></td>
                  <td className="px-4 py-2 text-right"><Button variant="ghost" small onClick={() => abrir(t.id)}>{t.estado === 'ABIERTA' ? 'Continuar' : 'Ver'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toma && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-600" /> {toma.consecutivo} · {toma.bodega.nombre}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${estadoClase[toma.estado]}`}>{toma.estado}</span>
              </h3>
              <p className="text-xs text-gray-500">
                Iniciada {formatValue(toma.fechaInicio, 'datetime')} por {toma.usuario}
                {toma.fechaAplicacion && ` · aplicada ${formatValue(toma.fechaAplicacion, 'datetime')} por ${toma.aplicadoPor}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" small onClick={() => setToma(null)}>Volver</Button>
              <Button variant="secondary" small onClick={hojaConteo}><FileText className="w-3.5 h-3.5" /> Hoja de conteo PDF</Button>
              {editable && <Button variant="secondary" small disabled={!cambios.length || guardando} onClick={guardar}><Save className="w-3.5 h-3.5" /> Guardar ({cambios.length})</Button>}
              {toma.estado === 'ABIERTA' && puedeAplicar && (
                <>
                  <Button small onClick={() => { setError(''); setConfirmar('aplicar'); }}>Aplicar ajustes</Button>
                  <Button variant="danger" small onClick={() => { setError(''); setConfirmar('anular'); }}><XCircle className="w-3.5 h-3.5" /> Anular</Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-3 bg-gray-50 text-xs">
            {[
              ['Productos', toma.resumen.productos], ['Contados', toma.resumen.contados], ['Pendientes', toma.resumen.pendientes],
              ['Sobrantes / faltantes', `${toma.resumen.sobrantes} / ${toma.resumen.faltantes}`], ['Valor diferencia', formatValue(toma.resumen.valorDiferencia, 'money')],
            ].map(([k, v]) => (
              <div key={String(k)}><span className="block text-[10px] uppercase text-gray-500 font-semibold">{k}</span><span className="font-bold text-gray-900">{v}</span></div>
            ))}
          </div>

          <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar producto..." className={`${inputClass} pl-9 w-60 py-1.5 text-xs`} />
            </div>
            {(['todos', 'pendientes', 'diferencias'] as const).map((v) => (
              <Button key={v} small variant={vista === v ? 'primary' : 'secondary'} onClick={() => setVista(v)}>
                {v === 'todos' ? 'Todos' : v === 'pendientes' ? 'Sin contar' : 'Con diferencia'}
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto max-h-[520px]">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">Código</th><th className="px-4 py-2 text-left">Producto</th>
                  <th className="px-4 py-2 text-right">Sistema</th><th className="px-4 py-2 text-right w-32">Contado</th>
                  <th className="px-4 py-2 text-right">Diferencia</th><th className="px-4 py-2 text-right">Valor</th>
                  {toma.estado === 'APLICADA' && <th className="px-4 py-2 text-right">Ajustado</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineas.map((l: any) => (
                  <tr key={l.productId} className={l.diferenciaVista ? (l.diferenciaVista < 0 ? 'bg-red-50/60' : 'bg-amber-50/60') : ''}>
                    <td className="px-4 py-1.5 font-mono">{l.codigo}</td>
                    <td className="px-4 py-1.5 font-semibold">{l.producto}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{formatValue(l.cantidadSistema, 'qty')}</td>
                    <td className="px-4 py-1.5 text-right">
                      {editable ? (
                        <input type="number" min="0" step="0.001" value={conteos[l.productId] ?? ''} aria-label={`Conteo ${l.codigo}`}
                          onChange={(e) => setConteos({ ...conteos, [l.productId]: e.target.value })}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-right text-xs focus:ring-1 focus:ring-emerald-500" />
                      ) : formatValue(l.cantidadContada, 'qty') || '—'}
                    </td>
                    <td className={`px-4 py-1.5 text-right font-bold tabular-nums ${l.diferenciaVista < 0 ? 'text-red-600' : l.diferenciaVista > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                      {l.diferenciaVista === null ? '—' : `${l.diferenciaVista > 0 ? '+' : ''}${formatValue(l.diferenciaVista, 'qty')}`}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{l.diferenciaVista ? formatValue(l.diferenciaVista * l.costo, 'money') : '—'}</td>
                    {toma.estado === 'APLICADA' && <td className="px-4 py-1.5 text-right tabular-nums">{formatValue(l.cantidadAjustada, 'qty') || '—'}</td>}
                  </tr>
                ))}
                {lineas.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Sin productos para este filtro</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmar && toma && (
        <Modal
          title={confirmar === 'aplicar' ? `Aplicar ${toma.consecutivo}` : `Anular ${toma.consecutivo}`}
          onClose={() => setConfirmar(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button variant={confirmar === 'anular' ? 'danger' : 'primary'} onClick={ejecutar}>{confirmar === 'aplicar' ? 'Aplicar ajustes' : 'Anular toma'}</Button></>}
        >
          {error && <Alert kind="error" message={error} />}
          {confirmar === 'aplicar' ? (
            <p className="text-sm text-gray-700">
              Se ajustarán los productos contados con diferencia. Los no contados no se modifican. Cada ajuste queda en el Kardex con el
              consecutivo {toma.consecutivo}. Esta acción no se puede deshacer.
            </p>
          ) : (
            <p className="text-sm text-gray-700">La toma se cerrará sin modificar existencias.</p>
          )}
          <Field label={confirmar === 'aplicar' ? 'Observación (opcional)' : 'Motivo'} required={confirmar === 'anular'}>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} />
          </Field>
        </Modal>
      )}
    </div>
  );
};
