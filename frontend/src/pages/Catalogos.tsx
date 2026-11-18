import React, { useCallback, useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { CatalogManager } from '../components/CatalogManager';
import { Tabs } from '../components/ui';

// Master catalog maintenance (GEN-004, GEN-005, GEN-007, COM-001, CLI-001, CLI-002, INV-001)

// Currency format for catalog tables
const money = (v: unknown) => `₡${Number(v ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Builds <select> options from catalog rows
const opt = (rows: any[], label: (r: any) => string, value: (r: any) => string = (r) => r.id) =>
  rows.filter((r) => r.activo !== false).map((r) => ({ value: value(r), label: label(r) }));

const TIPOS_ID = [
  { value: 'CEDULA_FISICA', label: 'Cédula física' },
  { value: 'CEDULA_JURIDICA', label: 'Cédula jurídica (empresa)' },
  { value: 'DIMEX', label: 'DIMEX' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
];

// Catalog maintenance tabs
export const Catalogos: React.FC = () => {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('productos');
  const [categorias, setCategorias] = useState<any[]>([]);
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [cajas, setCajas] = useState<any[]>([]);
  const [departamentos, setDepartamentos] = useState<any[]>([]);

  const cargarReferencias = useCallback(async () => {
    const [c, b, k, d] = await Promise.all([
      api.catalogos.getCategorias(),
      api.catalogos.getBodegas(),
      api.catalogos.getCajas(),
      api.catalogos.getDepartamentos(),
    ]);
    if (c.success) setCategorias(c.data || []);
    if (b.success) setBodegas(b.data || []);
    if (k.success) setCajas(k.data || []);
    if (d.success) setDepartamentos(d.data || []);
  }, []);

  useEffect(() => {
    cargarReferencias();
  }, [cargarReferencias]);

  const catCrear = hasPermission('CATALOGOS', 'CREAR');
  const catEditar = hasPermission('CATALOGOS', 'EDITAR');

  const tabs = [
    { id: 'productos', label: 'Productos' },
    { id: 'categorias', label: 'Categorías' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'proveedores', label: 'Proveedores' },
    { id: 'bodegas', label: 'Bodegas' },
    { id: 'cajas', label: 'Cajas' },
    { id: 'departamentos', label: 'Departamentos' },
    { id: 'puntos-venta', label: 'Puntos de venta' },
  ];

  const codigoNombre = [
    { label: 'Código', render: (r: any) => <span className="font-mono font-bold text-gray-900">{r.codigo}</span> },
    { label: 'Nombre', render: (r: any) => <span className="font-semibold">{r.nombre}</span> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg"><Database className="w-5 h-5" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Catálogos maestros</h1>
          <p className="text-xs text-gray-500">Los registros con historial no se eliminan: se inactivan.</p>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'productos' && (
        <CatalogManager
          recurso="productos" titulo="Productos" singular="Producto"
          load={() => api.catalogos.getProductos({ todos: true })}
          searchText={(r) => `${r.codigo} ${r.nombre} ${r.codigoBarras ?? ''} ${r.categoria?.nombre ?? ''}`}
          canCreate={catCrear} canEdit={catEditar}
          defaults={{ impuesto: 13, costo: 0, esServicio: false }}
          columns={[
            ...codigoNombre,
            { label: 'Categoría', render: (r) => r.categoria?.nombre },
            { label: 'Cód. barras', render: (r) => <span className="font-mono">{r.codigoBarras || '—'}</span> },
            { label: 'Precio', align: 'right', render: (r) => money(r.precioVenta) },
            { label: 'Costo', align: 'right', render: (r) => money(r.costo) },
            { label: 'IVA', align: 'right', render: (r) => `${Number(r.impuesto)}%` },
            { label: 'Tipo', render: (r) => (r.esServicio ? 'Servicio' : 'Inventariable') },
          ]}
          fields={[
            { name: 'codigo', label: 'Código', required: true, createOnly: true, hint: 'No se puede cambiar después' },
            { name: 'nombre', label: 'Nombre', required: true },
            { name: 'categoriaId', label: 'Categoría', type: 'select', required: true, options: opt(categorias, (c) => c.nombre) },
            { name: 'codigoBarras', label: 'Código de barras' },
            { name: 'precioVenta', label: 'Precio de venta (₡)', type: 'number', step: '0.01', required: true },
            { name: 'costo', label: 'Costo (₡)', type: 'number', step: '0.01' },
            { name: 'impuesto', label: 'Impuesto (%)', type: 'number', step: '0.01' },
            { name: 'descripcion', label: 'Descripción', type: 'textarea' },
            { name: 'esServicio', label: 'Es un servicio', type: 'checkbox', hint: 'no controla existencias' },
          ]}
        />
      )}

      {tab === 'categorias' && (
        <CatalogManager
          recurso="categorias" titulo="Categorías" singular="Categoría"
          load={() => api.catalogos.getCategorias({ todos: true })}
          searchText={(r) => `${r.nombre} ${r.descripcion ?? ''}`}
          canCreate={catCrear} canEdit={catEditar} onChanged={cargarReferencias}
          columns={[
            { label: 'Nombre', render: (r) => <span className="font-semibold">{r.nombre}</span> },
            { label: 'Descripción', render: (r) => r.descripcion || '—' },
            { label: 'Productos', align: 'right', render: (r) => r._count?.products ?? 0 },
          ]}
          fields={[
            { name: 'nombre', label: 'Nombre', required: true },
            { name: 'descripcion', label: 'Descripción', type: 'textarea' },
          ]}
        />
      )}

      {tab === 'clientes' && (
        <CatalogManager
          recurso="clientes" titulo="Clientes" singular="Cliente"
          load={() => api.catalogos.getClientes(undefined, true)}
          searchText={(r) => `${r.identificacion} ${r.nombre} ${r.email ?? ''}`}
          canCreate={hasPermission('CLIENTES', 'CREAR')} canEdit={hasPermission('CLIENTES', 'EDITAR')}
          defaults={{ tipoIdentificacion: 'CEDULA_FISICA', creditoActivo: false, limiteCredito: 0, diasCredito: 0 }}
          columns={[
            { label: 'Identificación', render: (r) => <span className="font-mono">{r.identificacion}</span> },
            { label: 'Nombre', render: (r) => <span className="font-semibold">{r.nombre}</span> },
            { label: 'Tipo', render: (r) => (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.tipoIdentificacion === 'CEDULA_JURIDICA' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                {r.tipoIdentificacion === 'CEDULA_JURIDICA' ? 'EMPRESA' : 'PERSONA'}
              </span>
            ) },
            { label: 'Contacto', render: (r) => [r.contacto, r.telefono, r.email].filter(Boolean).join(' · ') || '—' },
            { label: 'Crédito', render: (r) => (r.creditoActivo ? `${money(r.limiteCredito)} / ${r.diasCredito} días` : 'No autorizado') },
          ]}
          fields={[
            { name: 'tipoIdentificacion', label: 'Tipo de identificación', type: 'select', required: true, options: TIPOS_ID },
            { name: 'identificacion', label: 'Identificación', required: true, createOnly: true,
              hint: 'Física: 9 dígitos · Jurídica: 10 dígitos · DIMEX: 11-12 · Pasaporte: 6-20 caracteres' },
            { name: 'nombre', label: 'Nombre o razón social', required: true },
            { name: 'contacto', label: 'Persona de contacto', visible: (f) => f.tipoIdentificacion === 'CEDULA_JURIDICA' },
            { name: 'telefono', label: 'Teléfono' },
            { name: 'email', label: 'Correo', type: 'email' },
            { name: 'direccion', label: 'Dirección', type: 'textarea' },
            { name: 'creditoActivo', label: 'Autorizar ventas a crédito', type: 'checkbox', hint: 'requiere permiso CLIENTES:EDITAR' },
            { name: 'limiteCredito', label: 'Límite de crédito (₡)', type: 'number', step: '0.01', visible: (f) => Boolean(f.creditoActivo) },
            { name: 'diasCredito', label: 'Plazo (días)', type: 'number', step: '1', visible: (f) => Boolean(f.creditoActivo) },
          ]}
          toPayload={(f) => (f.creditoActivo ? f : { ...f, creditoActivo: false })}
        />
      )}

      {tab === 'proveedores' && (
        <CatalogManager
          recurso="proveedores" titulo="Proveedores" singular="Proveedor"
          load={() => api.catalogos.getProveedores({ todos: true })}
          searchText={(r) => `${r.identificacion} ${r.nombre} ${r.razonSocial ?? ''}`}
          canCreate={hasPermission('PROVEEDORES', 'CREAR')} canEdit={hasPermission('PROVEEDORES', 'EDITAR')}
          defaults={{ diasCredito: 0 }}
          columns={[
            { label: 'Identificación', render: (r) => <span className="font-mono">{r.identificacion}</span> },
            { label: 'Nombre', render: (r) => <span className="font-semibold">{r.nombre}</span> },
            { label: 'Contacto', render: (r) => [r.telefono, r.email].filter(Boolean).join(' · ') || '—' },
            { label: 'Días crédito', align: 'right', render: (r) => r.diasCredito },
            { label: 'Condiciones de pago', render: (r) => r.condicionesPago || '—' },
          ]}
          fields={[
            { name: 'identificacion', label: 'Identificación', required: true, createOnly: true },
            { name: 'nombre', label: 'Nombre comercial', required: true },
            { name: 'razonSocial', label: 'Razón social' },
            { name: 'telefono', label: 'Teléfono' },
            { name: 'email', label: 'Correo', type: 'email' },
            { name: 'diasCredito', label: 'Días de crédito', type: 'number', step: '1' },
            { name: 'condicionesPago', label: 'Condiciones de pago', hint: 'Ej.: Contado, 30 días contra factura' },
            { name: 'direccion', label: 'Dirección', type: 'textarea' },
          ]}
        />
      )}

      {tab === 'bodegas' && (
        <CatalogManager
          recurso="bodegas" titulo="Bodegas" singular="Bodega"
          load={() => api.catalogos.getBodegas({ todos: true })}
          searchText={(r) => `${r.codigo} ${r.nombre} ${r.ubicacion ?? ''}`}
          canCreate={catCrear} canEdit={catEditar} onChanged={cargarReferencias}
          columns={[...codigoNombre, { label: 'Ubicación', render: (r) => r.ubicacion || '—' }]}
          fields={[
            { name: 'codigo', label: 'Código', required: true, createOnly: true },
            { name: 'nombre', label: 'Nombre', required: true },
            { name: 'ubicacion', label: 'Ubicación' },
          ]}
        />
      )}

      {tab === 'cajas' && (
        <CatalogManager
          recurso="cajas" titulo="Cajas" singular="Caja"
          load={() => api.catalogos.getCajas({ todos: true })}
          searchText={(r) => `${r.codigo} ${r.nombre} ${r.ubicacion ?? ''}`}
          canCreate={catCrear} canEdit={catEditar} onChanged={cargarReferencias}
          columns={[...codigoNombre, { label: 'Ubicación', render: (r) => r.ubicacion || '—' }]}
          fields={[
            { name: 'codigo', label: 'Código', required: true, createOnly: true },
            { name: 'nombre', label: 'Nombre', required: true },
            { name: 'ubicacion', label: 'Ubicación' },
          ]}
        />
      )}

      {tab === 'departamentos' && (
        <CatalogManager
          recurso="departamentos" titulo="Departamentos" singular="Departamento"
          load={() => api.catalogos.getDepartamentos({ todos: true })}
          searchText={(r) => `${r.codigo} ${r.nombre}`}
          canCreate={catCrear} canEdit={catEditar} onChanged={cargarReferencias}
          columns={[...codigoNombre, { label: 'Descripción', render: (r) => r.descripcion || '—' }]}
          fields={[
            { name: 'codigo', label: 'Código', required: true, createOnly: true, hint: 'Ej.: RESTAURANTE' },
            { name: 'nombre', label: 'Nombre', required: true },
            { name: 'descripcion', label: 'Descripción', type: 'textarea' },
          ]}
        />
      )}

      {tab === 'puntos-venta' && (
        <CatalogManager
          recurso="puntos-venta" titulo="Puntos de venta" singular="Punto de venta"
          load={() => api.catalogos.getPuntosVenta({ todos: true })}
          searchText={(r) => `${r.codigo} ${r.nombre} ${r.departamento}`}
          canCreate={catCrear} canEdit={catEditar}
          columns={[
            ...codigoNombre,
            { label: 'Departamento', render: (r) => departamentos.find((d) => d.codigo === r.departamento)?.nombre ?? r.departamento },
            { label: 'Caja', render: (r) => r.caja?.nombre },
            { label: 'Bodega por defecto', render: (r) => r.bodegaDefecto?.nombre },
          ]}
          fields={[
            { name: 'codigo', label: 'Código', required: true, createOnly: true },
            { name: 'nombre', label: 'Nombre', required: true },
            { name: 'departamento', label: 'Departamento', type: 'select', required: true, options: opt(departamentos, (d) => d.nombre, (d) => d.codigo) },
            { name: 'cajaId', label: 'Caja', type: 'select', required: true, options: opt(cajas, (c) => `${c.nombre} (${c.codigo})`) },
            { name: 'bodegaDefectoId', label: 'Bodega de despacho', type: 'select', required: true, options: opt(bodegas, (b) => `${b.nombre} (${b.codigo})`) },
          ]}
        />
      )}
    </div>
  );
};
