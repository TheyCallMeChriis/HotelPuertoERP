import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Power, Search, ShieldCheck, Users } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert, AuditInfo, Button, Field, Modal, StatusBadge, Tabs, inputClass } from '../components/ui';

// User, role and permission administration (GEN-002, GEN-003)

const PASSWORD_MIN = 12;
const MODULOS: Record<string, string> = {
  VENTAS: 'Ventas / POS', CAJA: 'Caja', INVENTARIO: 'Inventario', COMPRAS: 'Compras', CLIENTES: 'Clientes',
  PROVEEDORES: 'Proveedores', REPORTES: 'Reportes', SEGURIDAD: 'Seguridad y usuarios', HOTEL_PMS: 'Hotel / PMS',
  CATALOGOS: 'Catálogos maestros',
};
const ACCIONES = ['VER', 'CREAR', 'EDITAR', 'ANULAR', 'DESCUENTO', 'AJUSTE', 'APROBAR'];

// ======================= USERS =======================
const UsuariosTab: React.FC = () => {
  const { user: actual, hasPermission } = useAuth();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [filtro, setFiltro] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<any | null>(null); // { id?, username, nombre, email, password, roleIds }
  const [reset, setReset] = useState<any | null>(null); // { user, password, confirm }
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    const [u, r] = await Promise.all([api.admin.getUsuarios(), api.admin.getRoles()]);
    if (u.success) setUsuarios(u.data || []);
    else setError(u.message || 'No se pudo cargar usuarios');
    if (r.success) setRoles(r.data || []);
  };
  useEffect(() => {
    cargar();
  }, []);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return usuarios
      .filter((u) => verInactivos || u.activo)
      .filter((u) => !q || `${u.username} ${u.nombre} ${u.email}`.toLowerCase().includes(q));
  }, [usuarios, filtro, verInactivos]);

  const puedeCrear = hasPermission('SEGURIDAD', 'CREAR');
  const puedeEditar = hasPermission('SEGURIDAD', 'EDITAR');

  const toggleRol = (id: string) =>
    setForm((f: any) => ({ ...f, roleIds: f.roleIds.includes(id) ? f.roleIds.filter((x: string) => x !== id) : [...f.roleIds, id] }));

  const guardar = async () => {
    setError('');
    if (!form.nombre?.trim() || !form.email?.trim() || (!form.id && !form.username?.trim())) {
      setError('Complete usuario, nombre y correo');
      return;
    }
    if (!form.id && (form.password?.length ?? 0) < PASSWORD_MIN) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`);
      return;
    }
    if (form.roleIds.length === 0) {
      setError('Asigne al menos un rol');
      return;
    }
    setSaving(true);
    const res = form.id
      ? await api.admin.updateUsuario(form.id, { nombre: form.nombre, email: form.email, roleIds: form.roleIds })
      : await api.admin.createUsuario({ username: form.username, nombre: form.nombre, email: form.email, password: form.password, roleIds: form.roleIds });
    setSaving(false);
    if (!res.success) {
      setError(res.message || 'No se pudo guardar');
      return;
    }
    setMensaje(form.id ? 'Usuario actualizado' : 'Usuario creado');
    setForm(null);
    cargar();
  };

  const cambiarEstado = async (u: any) => {
    if (u.activo && !window.confirm(`¿Desactivar la cuenta "${u.username}"? No podrá iniciar sesión, pero se conserva su historial.`)) return;
    const res = await api.admin.updateUsuario(u.id, { activo: !u.activo });
    if (!res.success) {
      setMensaje('');
      setError(res.message || 'No se pudo cambiar el estado');
      return;
    }
    setError('');
    setMensaje(u.activo ? 'Usuario desactivado' : 'Usuario activado');
    cargar();
  };

  const guardarReset = async () => {
    if (reset.password.length < PASSWORD_MIN) return setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`);
    if (reset.password !== reset.confirm) return setError('Las contraseñas no coinciden');
    setSaving(true);
    const res = await api.admin.resetPassword(reset.user.id, reset.password);
    setSaving(false);
    if (!res.success) return setError(res.message || 'No se pudo restablecer');
    setMensaje(`Contraseña de ${reset.user.username} restablecida`);
    setReset(null);
    setError('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar usuario..." className={`${inputClass} pl-9 w-64`} />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="rounded text-emerald-600" />
            Mostrar inactivos
          </label>
        </div>
        {puedeCrear && (
          <Button onClick={() => { setError(''); setForm({ username: '', nombre: '', email: '', password: '', roleIds: [] }); }}>
            <Plus className="w-4 h-4" /> Nuevo usuario
          </Button>
        )}
      </div>

      {mensaje && <Alert kind="success" message={mensaje} onClose={() => setMensaje('')} />}
      {error && !form && !reset && <Alert kind="error" message={error} onClose={() => setError('')} />}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Usuario</th>
              <th className="px-4 py-3 text-left font-semibold">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold">Correo</th>
              <th className="px-4 py-3 text-left font-semibold">Roles</th>
              <th className="px-4 py-3 text-center font-semibold">Estado</th>
              {puedeEditar && <th className="px-4 py-3 text-center font-semibold">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'bg-gray-50 text-gray-400'}>
                <td className="px-4 py-2.5 font-mono font-bold text-gray-900">
                  {u.username} {u.id === actual?.id && <span className="text-[10px] text-emerald-600 font-sans">(usted)</span>}
                </td>
                <td className="px-4 py-2.5 font-semibold">{u.nombre}</td>
                <td className="px-4 py-2.5">{u.email}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r: any) => (
                      <span key={r.id} className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono text-[10px]">{r.nombre}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center"><StatusBadge activo={u.activo} /></td>
                {puedeEditar && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" small onClick={() => { setError(''); setForm({ id: u.id, username: u.username, nombre: u.nombre, email: u.email, roleIds: u.roles.map((r: any) => r.id), audit: u }); }}>
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </Button>
                      <Button variant="ghost" small onClick={() => { setError(''); setReset({ user: u, password: '', confirm: '' }); }}>
                        <KeyRound className="w-3.5 h-3.5" /> Clave
                      </Button>
                      {u.id !== actual?.id && (
                        <Button variant="ghost" small onClick={() => cambiarEstado(u)} className={u.activo ? 'text-red-600 hover:bg-red-50' : ''}>
                          <Power className="w-3.5 h-3.5" /> {u.activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin usuarios</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal
          title={form.id ? `Editar usuario ${form.username}` : 'Nuevo usuario'}
          onClose={() => setForm(null)}
          footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button></>}
        >
          {error && <Alert kind="error" message={error} />}
          {form.audit && <AuditInfo row={form.audit} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Usuario" required={!form.id} hint={form.id ? 'No se puede cambiar' : 'Minúsculas, números, punto o guion'}>
              <input value={form.username} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} autoComplete="off" />
            </Field>
            <Field label="Nombre completo" required>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Correo" required>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </Field>
            {!form.id && (
              <Field label="Contraseña inicial" required hint={`Mínimo ${PASSWORD_MIN} caracteres`}>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} autoComplete="new-password" />
              </Field>
            )}
          </div>
          <div>
            <span className="block text-xs font-semibold text-gray-700 mb-2">Roles <span className="text-red-500">*</span></span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {roles.filter((r) => r.activo || form.roleIds.includes(r.id)).map((r) => (
                <label key={r.id} className={`flex items-start gap-2 border rounded-lg p-2 cursor-pointer ${form.roleIds.includes(r.id) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={form.roleIds.includes(r.id)} onChange={() => toggleRol(r.id)} className="mt-0.5 rounded text-emerald-600" />
                  <span>
                    <span className="block text-xs font-bold font-mono text-gray-900">{r.nombre}</span>
                    <span className="block text-[11px] text-gray-500">{r.descripcion}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {reset && (
        <Modal
          title={`Restablecer contraseña de ${reset.user.username}`}
          onClose={() => setReset(null)}
          footer={<><Button variant="secondary" onClick={() => setReset(null)}>Cancelar</Button><Button onClick={guardarReset} disabled={saving}>Restablecer</Button></>}
        >
          {error && <Alert kind="error" message={error} />}
          <Field label="Nueva contraseña" required hint={`Mínimo ${PASSWORD_MIN} caracteres. Entréguela al usuario por un medio seguro.`}>
            <input type="password" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} className={inputClass} autoComplete="new-password" />
          </Field>
          <Field label="Confirmar contraseña" required>
            <input type="password" value={reset.confirm} onChange={(e) => setReset({ ...reset, confirm: e.target.value })} className={inputClass} autoComplete="new-password" />
          </Field>
        </Modal>
      )}
    </div>
  );
};

// ======================= ROLES AND PERMISSIONS =======================
const RolesTab: React.FC = () => {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [permisos, setPermisos] = useState<any[]>([]);
  const [seleccion, setSeleccion] = useState<string>('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<any | null>(null);

  const puedeEditar = hasPermission('SEGURIDAD', 'EDITAR');
  const puedeCrear = hasPermission('SEGURIDAD', 'CREAR');

  const cargar = async (mantener?: string) => {
    const [r, p] = await Promise.all([api.admin.getRoles(), api.admin.getPermisos()]);
    if (r.success) {
      setRoles(r.data || []);
      const id = mantener || seleccion || r.data?.[0]?.id || '';
      setSeleccion(id);
      const rol = (r.data || []).find((x: any) => x.id === id);
      setMarcados(new Set((rol?.permisos || []).map((x: any) => x.id)));
    } else setError(r.message || 'No se pudieron cargar los roles');
    if (p.success) setPermisos(p.data || []);
  };
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rol = roles.find((r) => r.id === seleccion);
  const esAdmin = rol?.nombre === 'ADMINISTRADOR';
  const editable = puedeEditar && !esAdmin;

  const seleccionar = (id: string) => {
    setSeleccion(id);
    const r = roles.find((x) => x.id === id);
    setMarcados(new Set((r?.permisos || []).map((x: any) => x.id)));
    setMensaje('');
    setError('');
  };

  const permisoId = (modulo: string, accion: string) => permisos.find((p) => p.modulo === modulo && p.accion === accion)?.id;
  const modulos = Array.from(new Set(permisos.map((p) => p.modulo)));

  const toggle = (id?: string) => {
    if (!id || !editable) return;
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const original = new Set((rol?.permisos || []).map((x: any) => x.id));
  const cambios = marcados.size !== original.size || [...marcados].some((id) => !original.has(id));

  const guardarPermisos = async () => {
    const res = await api.admin.setPermisosRol(seleccion, [...marcados]);
    if (!res.success) return setError(res.message || 'No se pudieron guardar los permisos');
    setError('');
    setMensaje(`Permisos de ${rol.nombre} actualizados. Los usuarios verán el cambio en su próxima solicitud.`);
    cargar(seleccion);
  };

  const guardarRol = async () => {
    const res = form.id
      ? await api.admin.updateRol(form.id, { nombre: form.nombre, descripcion: form.descripcion })
      : await api.admin.createRol({ nombre: form.nombre, descripcion: form.descripcion });
    if (!res.success) return setError(res.message || 'No se pudo guardar el rol');
    setForm(null);
    setError('');
    setMensaje(form.id ? 'Rol actualizado' : 'Rol creado');
    cargar(res.data?.id);
  };

  const cambiarEstadoRol = async () => {
    if (rol.activo && !window.confirm(`¿Desactivar el rol ${rol.nombre}? Sus usuarios perderán esos permisos.`)) return;
    const res = await api.admin.updateRol(rol.id, { activo: !rol.activo });
    if (!res.success) return setError(res.message || 'No se pudo cambiar el estado');
    setMensaje(rol.activo ? 'Rol desactivado' : 'Rol activado');
    cargar(rol.id);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 space-y-1 h-fit">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-xs font-bold text-gray-500 uppercase">Roles</span>
          {puedeCrear && (
            <Button variant="ghost" small onClick={() => { setError(''); setForm({ nombre: '', descripcion: '' }); }}>
              <Plus className="w-3.5 h-3.5" /> Nuevo
            </Button>
          )}
        </div>
        {roles.map((r) => (
          <button key={r.id} onClick={() => seleccionar(r.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs ${r.id === seleccion ? 'bg-emerald-50 text-emerald-800 font-bold' : 'hover:bg-gray-50 text-gray-700'} ${r.activo ? '' : 'opacity-50'}`}>
            <span className="font-mono">{r.nombre}</span>
            <span className="block text-[10px] text-gray-400">{r.usuarios} usuario(s){r.activo ? '' : ' · inactivo'}</span>
          </button>
        ))}
      </div>

      <div className="lg:col-span-3 space-y-4">
        {mensaje && <Alert kind="success" message={mensaje} onClose={() => setMensaje('')} />}
        {error && !form && <Alert kind="error" message={error} onClose={() => setError('')} />}
        {rol && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 font-mono flex items-center gap-2">{rol.nombre} <StatusBadge activo={rol.activo} /></h3>
                <p className="text-xs text-gray-500">{rol.descripcion}</p>
                {esAdmin && <p className="text-xs text-amber-700 mt-1">El administrador tiene acceso total; sus permisos no se editan.</p>}
              </div>
              {puedeEditar && !esAdmin && (
                <div className="flex gap-2">
                  <Button variant="secondary" small onClick={() => { setError(''); setForm({ id: rol.id, nombre: rol.nombre, descripcion: rol.descripcion ?? '', audit: rol }); }}>
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                  <Button variant="secondary" small onClick={cambiarEstadoRol}><Power className="w-3.5 h-3.5" /> {rol.activo ? 'Desactivar' : 'Activar'}</Button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Módulo</th>
                    {ACCIONES.map((a) => <th key={a} className="px-3 py-2 text-center font-semibold">{a}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modulos.map((m) => (
                    <tr key={m}>
                      <td className="px-4 py-2 font-semibold text-gray-800">{MODULOS[m] ?? m}</td>
                      {ACCIONES.map((a) => {
                        const id = permisoId(m, a);
                        return (
                          <td key={a} className="px-3 py-2 text-center">
                            {id ? (
                              <input type="checkbox" aria-label={`${m}:${a}`} checked={esAdmin || marcados.has(id)} disabled={!editable}
                                onChange={() => toggle(id)} className="rounded text-emerald-600" />
                            ) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
                <Button variant="secondary" disabled={!cambios} onClick={() => seleccionar(rol.id)}>Descartar</Button>
                <Button disabled={!cambios} onClick={guardarPermisos}>Guardar permisos</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {form && (
        <Modal title={form.id ? 'Editar rol' : 'Nuevo rol'} onClose={() => setForm(null)}
          footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={guardarRol}>Guardar</Button></>}>
          {error && <Alert kind="error" message={error} />}
          {form.audit && <AuditInfo row={form.audit} />}
          <Field label="Nombre" required hint="Mayúsculas y guion bajo, ej.: SUPERVISOR_BAR">
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase() })} className={inputClass} />
          </Field>
          <Field label="Descripción">
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} className={inputClass} />
          </Field>
        </Modal>
      )}
    </div>
  );
};

// Editable business parameters (INV-011: costing method)
const ETIQUETAS: Record<string, string> = {
  PROMEDIO: 'Costo promedio ponderado', ULTIMO_COSTO: 'Último costo de compra',
};
// Business parameters tab
const ParametrosTab: React.FC = () => {
  const { hasPermission } = useAuth();
  const [lista, setLista] = useState<any[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const cargar = () => api.admin.getParametros().then((r) => (r.success ? setLista(r.data || []) : setError(r.message || 'No se pudieron cargar')));
  useEffect(() => { cargar(); }, []);
  const cambiar = async (clave: string, valor: string) => {
    const r = await api.admin.updateParametro(clave, valor);
    if (!r.success) { setError(r.message || 'No se pudo guardar'); return; }
    setError(''); setMensaje(r.message || 'Guardado'); cargar();
  };
  return (
    <div className="space-y-3">
      {mensaje && <Alert kind="success" message={mensaje} onClose={() => setMensaje('')} />}
      {error && <Alert kind="error" message={error} onClose={() => setError('')} />}
      {lista.map((p) => (
        <div key={p.clave} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">{p.clave === 'METODO_COSTEO' ? 'Método de costeo de inventario' : p.clave}</p>
            <p className="text-xs text-gray-500">{p.descripcion}</p>
            <p className="text-[11px] text-gray-400 mt-1">
              Promedio: (existencia × costo actual + cantidad × costo de compra) ÷ existencia total. Aplica a las recepciones futuras.
            </p>
          </div>
          <div className="w-64 shrink-0">
            <select value={p.valor} disabled={!hasPermission('SEGURIDAD', 'EDITAR')} onChange={(e) => cambiar(p.clave, e.target.value)} className={inputClass}>
              {p.valores.map((v: string) => <option key={v} value={v}>{ETIQUETAS[v] ?? v}</option>)}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
};

// Security administration: users, roles and permissions, parameters
export const Administracion: React.FC = () => {
  const [tab, setTab] = useState('usuarios');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
          {tab === 'usuarios' ? <Users className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Administración de seguridad</h1>
          <p className="text-xs text-gray-500">Cuentas individuales, roles y permisos por módulo y acción. Todo cambio queda en la bitácora.</p>
        </div>
      </div>
      <Tabs tabs={[{ id: 'usuarios', label: 'Usuarios' }, { id: 'roles', label: 'Roles y permisos' }, { id: 'parametros', label: 'Parámetros' }]} active={tab} onChange={setTab} />
      {tab === 'usuarios' ? <UsuariosTab /> : tab === 'roles' ? <RolesTab /> : <ParametrosTab />}
    </div>
  );
};
