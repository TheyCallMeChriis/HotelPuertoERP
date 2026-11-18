// Generic catalog maintenance component.

import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Power, Search } from 'lucide-react';
import { api } from '../api/client';
import { Alert, AuditInfo, Button, Field, Modal, StatusBadge, inputClass } from './ui';

// Generic catalog maintenance: list, search, create, edit and deactivate (GEN-004/005/007, GEN-010).
// Records are never deleted: they are activated or deactivated, keeping their history.

export type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'email';

export interface CatalogField {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  createOnly?: boolean; // editable only on create (codes and identifications)
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  step?: string;
  visible?: (form: Record<string, any>) => boolean;
}

export interface CatalogColumn {
  label: string;
  render: (row: any) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
}

interface Props {
  recurso: string; // API route: productos, clientes, bodegas...
  titulo: string;
  singular: string;
  load: () => Promise<{ success: boolean; data?: any; message?: string }>;
  columns: CatalogColumn[];
  fields: CatalogField[];
  searchText: (row: any) => string;
  defaults?: Record<string, any>;
  canCreate: boolean;
  canEdit: boolean;
  toForm?: (row: any) => Record<string, any>;
  // Converts the form into the body expected by the API
  toPayload?: (form: Record<string, any>, editing: boolean) => Record<string, any>;
  onChanged?: () => void;
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

// Empty text fields are sent as null
const emptyToNull = (v: unknown) => (v === '' ? null : v);

// Reusable list + form for any master catalog
export const CatalogManager: React.FC<Props> = ({
  recurso, titulo, singular, load, columns, fields, searchText, defaults = {}, canCreate, canEdit, toForm, toPayload, onChanged,
}) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = async () => {
    setLoading(true);
    const res = await load();
    if (res.success) setRows(res.data || []);
    else setError(res.message || 'No se pudo cargar la información');
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurso]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return rows
      .filter((r) => verInactivos || r.activo !== false)
      .filter((r) => !q || searchText(r).toLowerCase().includes(q));
  }, [rows, filtro, verInactivos, searchText]);

  const abrirNuevo = () => {
    setEditing(null);
    setForm({ ...defaults });
    setError('');
  };

  const abrirEdicion = (row: any) => {
    setEditing(row);
    const base = toForm ? toForm(row) : row;
    const f: Record<string, any> = {};
    for (const field of fields) f[field.name] = base[field.name] ?? (field.type === 'checkbox' ? false : '');
    setForm(f);
    setError('');
  };

  const cerrar = () => {
    setForm(null);
    setEditing(null);
  };

  const guardar = async () => {
    if (!form) return;
    const faltante = fields.find(
      (f) => f.required && (!f.visible || f.visible(form)) && (form[f.name] === '' || form[f.name] === undefined || form[f.name] === null),
    );
    if (faltante) {
      setError(`Complete el campo: ${faltante.label}`);
      return;
    }
    const raw: Record<string, any> = {};
    for (const f of fields) {
      if (editing && f.createOnly) continue;
      if (f.visible && !f.visible(form)) continue;
      let v = form[f.name];
      if (f.type === 'number') v = v === '' || v === undefined ? undefined : Number(v);
      else if (f.type !== 'checkbox') v = emptyToNull(typeof v === 'string' ? v.trim() : v);
      if (v !== undefined) raw[f.name] = v;
    }
    const body = toPayload ? toPayload(raw, Boolean(editing)) : raw;
    setSaving(true);
    const res = editing ? await api.catalogos.actualizar(recurso, editing.id, body) : await api.catalogos.crear(recurso, body);
    setSaving(false);
    if (!res.success) {
      setError(res.message || 'No se pudo guardar');
      return;
    }
    setMensaje(editing ? `${singular} actualizado correctamente` : `${singular} creado correctamente`);
    cerrar();
    await cargar();
    onChanged?.();
  };

  const cambiarEstado = async (row: any) => {
    const activar = row.activo === false;
    if (!activar && !window.confirm(`¿Inactivar "${row.nombre ?? row.codigo}"? Se conservará su historial.`)) return;
    const res = await api.catalogos.actualizar(recurso, row.id, { activo: activar });
    if (!res.success) {
      setMensaje('');
      setError(res.message || 'No se pudo cambiar el estado');
      return;
    }
    setError('');
    setMensaje(activar ? `${singular} activado` : `${singular} inactivado`);
    await cargar();
    onChanged?.();
  };

  const set = (name: string, value: any) => setForm((f) => ({ ...(f || {}), [name]: value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder={`Buscar en ${titulo.toLowerCase()}...`}
              className={`${inputClass} pl-9 w-64`}
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="rounded text-emerald-600" />
            Mostrar inactivos
          </label>
          <span className="text-xs text-gray-400">{visibles.length} registro(s)</span>
        </div>
        {canCreate && (
          <Button onClick={abrirNuevo}>
            <Plus className="w-4 h-4" /> Nuevo {singular.toLowerCase()}
          </Button>
        )}
      </div>

      {mensaje && <Alert kind="success" message={mensaje} onClose={() => setMensaje('')} />}
      {error && !form && <Alert kind="error" message={error} onClose={() => setError('')} />}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
            <tr>
              {columns.map((c) => (
                <th key={c.label} className={`px-4 py-3 font-semibold ${alignClass[c.align ?? 'left']}`}>{c.label}</th>
              ))}
              <th className="px-4 py-3 font-semibold text-center">Estado</th>
              {canEdit && <th className="px-4 py-3 font-semibold text-center">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={columns.length + 2} className="px-4 py-6 text-center text-gray-400">Cargando...</td></tr>
            )}
            {!loading && visibles.length === 0 && (
              <tr><td colSpan={columns.length + 2} className="px-4 py-6 text-center text-gray-400">Sin registros</td></tr>
            )}
            {!loading && visibles.map((row) => (
              <tr key={row.id} className={row.activo === false ? 'bg-gray-50 text-gray-400' : ''}>
                {columns.map((c) => (
                  <td key={c.label} className={`px-4 py-2.5 ${alignClass[c.align ?? 'left']}`}>{c.render(row)}</td>
                ))}
                <td className="px-4 py-2.5 text-center"><StatusBadge activo={row.activo !== false} /></td>
                {canEdit && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" small onClick={() => abrirEdicion(row)} title="Editar">
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </Button>
                      <Button variant="ghost" small onClick={() => cambiarEstado(row)} title={row.activo === false ? 'Activar' : 'Inactivar'}
                        className={row.activo === false ? '' : 'text-red-600 hover:bg-red-50'}>
                        <Power className="w-3.5 h-3.5" /> {row.activo === false ? 'Activar' : 'Inactivar'}
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal
          title={editing ? `Editar ${singular.toLowerCase()}` : `Nuevo ${singular.toLowerCase()}`}
          onClose={cerrar}
          footer={
            <>
              <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
              <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
            </>
          }
        >
          {error && <Alert kind="error" message={error} />}
          {editing && <AuditInfo row={editing} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.filter((f) => !f.visible || f.visible(form)).map((f) => {
              const disabled = Boolean(editing && f.createOnly);
              const value = form[f.name] ?? '';
              const full = f.type === 'textarea' ? 'sm:col-span-2' : '';
              if (f.type === 'checkbox') {
                return (
                  <label key={f.name} className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
                    <input type="checkbox" checked={Boolean(form[f.name])} onChange={(e) => set(f.name, e.target.checked)} className="rounded text-emerald-600" />
                    {f.label}
                    {f.hint && <span className="text-[11px] text-gray-400">— {f.hint}</span>}
                  </label>
                );
              }
              return (
                <div key={f.name} className={full}>
                  <Field label={f.label} hint={f.hint} required={f.required && !disabled}>
                    {f.type === 'select' ? (
                      <select value={value} disabled={disabled} onChange={(e) => set(f.name, e.target.value)} className={inputClass}>
                        <option value="">Seleccione...</option>
                        {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea value={value} disabled={disabled} onChange={(e) => set(f.name, e.target.value)} rows={2} className={inputClass} />
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'}
                        step={f.step}
                        min={f.type === 'number' ? 0 : undefined}
                        value={value}
                        disabled={disabled}
                        onChange={(e) => set(f.name, e.target.value)}
                        className={inputClass}
                      />
                    )}
                  </Field>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
};
