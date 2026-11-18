// HTTP client for the backend API. Every call returns { success, data, message } and never throws,
// so screens can show the server message directly. Requests go through the Vite proxy at /api.

const API_BASE = '/api';

// Builds "?a=1&b=2" skipping undefined, null and empty values (false and 0 are kept)
function queryString(params?: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

// Session token storage (the token is a signed JWT; the server re-checks permissions on every call)
export function getAuthToken(): string | null {
  return localStorage.getItem('pos_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('pos_token', token);
}

export function removeAuthToken(): void {
  localStorage.removeItem('pos_token');
  localStorage.removeItem('pos_user');
}

// Sends a request with the session token and normalizes success and error responses.
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; message?: string; error?: string }> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json();
    // SEG-005: expired or invalid session → back to the login screen
    if (token && res.status === 401) {
      removeAuthToken();
      window.dispatchEvent(new Event('auth:expired'));
    }
    if (!res.ok) {
      return {
        success: false,
        message: data.message || 'Error en la petición',
        error: data.message,
      };
    }
    return data;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error de conexión con el servidor',
      error: err.message,
    };
  }
}

// Typed shortcuts per backend module
export const api = {
  // Authentication
  auth: {
    login: (body: { username: string; password: string }) =>
      apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    getMe: () => apiRequest('/auth/me'),
    logout: () => apiRequest('/auth/logout', { method: 'POST' }),
    getSetup: () => apiRequest('/auth/setup'),
    setup: (body: { username: string; nombre: string; email: string; password: string; codigo?: string }) =>
      apiRequest('/auth/setup', { method: 'POST', body: JSON.stringify(body) }),
    cambiarPassword: (actual: string, nueva: string) =>
      apiRequest('/auth/password', { method: 'PUT', body: JSON.stringify({ actual, nueva }) }),
  },

  // Catalogs (lookups for operations and master catalog maintenance)
  catalogos: {
    getProductos: (params?: { busqueda?: string; categoriaId?: string; todos?: boolean }) =>
      apiRequest(`/catalogos/productos${queryString(params)}`),
    getCategorias: (params?: { todos?: boolean }) => apiRequest(`/catalogos/categorias${queryString(params)}`),
    getClientes: (busqueda?: string, todos?: boolean) =>
      apiRequest(`/catalogos/clientes${queryString({ busqueda, todos })}`),
    getProveedores: (params?: { todos?: boolean; busqueda?: string }) =>
      apiRequest(`/catalogos/proveedores${queryString(params)}`),
    getBodegas: (params?: { todos?: boolean }) => apiRequest(`/catalogos/bodegas${queryString(params)}`),
    getCajas: (params?: { todos?: boolean }) => apiRequest(`/catalogos/cajas${queryString(params)}`),
    getDepartamentos: (params?: { todos?: boolean }) => apiRequest(`/catalogos/departamentos${queryString(params)}`),
    getPuntosVenta: (params?: { todos?: boolean }) => apiRequest(`/catalogos/puntos-venta${queryString(params)}`),
    getFormasPago: () => apiRequest('/catalogos/formas-pago'),
    // Generic create/update: resource = productos | categorias | clientes | proveedores | bodegas | cajas | departamentos | puntos-venta
    crear: (recurso: string, body: any) =>
      apiRequest(`/catalogos/${recurso}`, { method: 'POST', body: JSON.stringify(body) }),
    actualizar: (recurso: string, id: string, body: any) =>
      apiRequest(`/catalogos/${recurso}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },

  // User, role and permission administration
  admin: {
    getUsuarios: (params?: { busqueda?: string; estado?: string }) => apiRequest(`/admin/usuarios${queryString(params)}`),
    createUsuario: (body: any) => apiRequest('/admin/usuarios', { method: 'POST', body: JSON.stringify(body) }),
    updateUsuario: (id: string, body: any) =>
      apiRequest(`/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    resetPassword: (id: string, password: string) =>
      apiRequest(`/admin/usuarios/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
    getRoles: () => apiRequest('/admin/roles'),
    createRol: (body: any) => apiRequest('/admin/roles', { method: 'POST', body: JSON.stringify(body) }),
    updateRol: (id: string, body: any) => apiRequest(`/admin/roles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    setPermisosRol: (id: string, permissionIds: string[]) =>
      apiRequest(`/admin/roles/${id}/permisos`, { method: 'PUT', body: JSON.stringify({ permissionIds }) }),
    getPermisos: () => apiRequest('/admin/permisos'),
    getParametros: () => apiRequest('/admin/parametros'),
    updateParametro: (clave: string, valor: string) =>
      apiRequest(`/admin/parametros/${clave}`, { method: 'PUT', body: JSON.stringify({ valor }) }),
  },

  // Cash registers and shifts
  caja: {
    getTurnoActivo: (cajaId?: string) =>
      apiRequest(`/caja/turno-activo${cajaId ? `?cajaId=${cajaId}` : ''}`),
    abrirCaja: (body: { cajaId: string; montoInicial: number; notas?: string }) =>
      apiRequest('/caja/apertura', { method: 'POST', body: JSON.stringify(body) }),
    registrarMovimiento: (body: { cashShiftId: string; tipo: string; monto: number; motivo: string }) =>
      apiRequest('/caja/movimiento', { method: 'POST', body: JSON.stringify(body) }),
    cerrarCaja: (body: { cashShiftId: string; montoContado: number; notas?: string }) =>
      apiRequest('/caja/cierre', { method: 'POST', body: JSON.stringify(body) }),
    getHistorico: (cajaId?: string) =>
      apiRequest(`/caja/historico${cajaId ? `?cajaId=${cajaId}` : ''}`),
  },

  // Sales (POS)
  ventas: {
    createVenta: (body: any) =>
      apiRequest('/ventas', { method: 'POST', body: JSON.stringify(body) }),
    getVentas: (params?: any) => {
      return apiRequest(`/ventas${queryString(params)}`);
    },
    getVentaById: (id: string) => apiRequest(`/ventas/${id}`),
    // Suspended sales (POS-006)
    getSuspendidas: (pointOfSaleId: string) => apiRequest(`/ventas/suspendidas${queryString({ pointOfSaleId })}`),
    suspender: (body: any) => apiRequest('/ventas/suspendidas', { method: 'POST', body: JSON.stringify(body) }),
    descartarSuspendida: (id: string, motivo?: string) =>
      apiRequest(`/ventas/suspendidas/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo: motivo ?? '' }) }),
    anularVenta: (id: string, motivo: string) =>
      apiRequest(`/ventas/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) }),
    // Credit notes (FAC-005) and recorded reprints (FAC-006)
    notaCredito: (id: string, body: any) => apiRequest(`/ventas/${id}/nota-credito`, { method: 'POST', body: JSON.stringify(body) }),
    reimprimir: (id: string) => apiRequest(`/ventas/${id}/reimpresion`, { method: 'POST' }),
    reimprimirNota: (id: string) => apiRequest(`/ventas/notas-credito/${id}/reimpresion`, { method: 'POST' }),
  },

  // Inventory and stock ledger
  inventario: {
    getExistencias: (params?: { warehouseId?: string; soloBajoMinimo?: boolean }) => {
      return apiRequest(`/inventario/existencias${queryString(params)}`);
    },
    getKardex: (productId: string, warehouseId?: string) =>
      apiRequest(`/inventario/kardex/${productId}${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),
    registrarMovimiento: (body: any) =>
      apiRequest('/inventario/movimiento', { method: 'POST', body: JSON.stringify(body) }),
    realizarTraslado: (body: any) =>
      apiRequest('/inventario/traslado', { method: 'POST', body: JSON.stringify(body) }),
    realizarAjuste: (body: any) =>
      apiRequest('/inventario/ajuste', { method: 'POST', body: JSON.stringify(body) }),
    // Physical inventory count (INV-007)
    getTomas: (params?: { warehouseId?: string; estado?: string }) => apiRequest(`/inventario/tomas${queryString(params)}`),
    getToma: (id: string) => apiRequest(`/inventario/tomas/${id}`),
    iniciarToma: (body: { warehouseId: string; notas?: string }) =>
      apiRequest('/inventario/tomas', { method: 'POST', body: JSON.stringify(body) }),
    guardarConteos: (id: string, conteos: Array<{ productId: string; cantidadContada: string | number | null }>) =>
      apiRequest(`/inventario/tomas/${id}/conteos`, { method: 'PUT', body: JSON.stringify({ conteos }) }),
    aplicarToma: (id: string, motivo?: string) =>
      apiRequest(`/inventario/tomas/${id}/aplicar`, { method: 'POST', body: JSON.stringify({ motivo: motivo || null }) }),
    anularToma: (id: string, motivo: string) =>
      apiRequest(`/inventario/tomas/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) }),
    configurarNiveles: (body: { warehouseId: string; productId: string; stockMinimo: number; stockMaximo?: number }) =>
      apiRequest('/inventario/niveles', { method: 'PUT', body: JSON.stringify(body) }),
  },

  // Purchasing
  compras: {
    createOrden: (body: any) =>
      apiRequest('/compras/ordenes', { method: 'POST', body: JSON.stringify(body) }),
    getOrdenes: (params?: any) => {
      return apiRequest(`/compras/ordenes${queryString(params)}`);
    },
    registrarRecepcion: (body: any) =>
      apiRequest('/compras/recepciones', { method: 'POST', body: JSON.stringify(body) }),
    // Internal requests with approval (COM-002, COM-003)
    getSolicitudes: (estado?: string) => apiRequest(`/compras/solicitudes${queryString({ estado })}`),
    crearSolicitud: (body: any) => apiRequest('/compras/solicitudes', { method: 'POST', body: JSON.stringify(body) }),
    revisarSolicitud: (id: string, body: { decision: 'APROBAR' | 'RECHAZAR'; comentario?: string | null }) =>
      apiRequest(`/compras/solicitudes/${id}/revision`, { method: 'POST', body: JSON.stringify(body) }),
    cancelarSolicitud: (id: string, motivo: string) =>
      apiRequest(`/compras/solicitudes/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) }),
    convertirSolicitud: (id: string, body: any) =>
      apiRequest(`/compras/solicitudes/${id}/convertir`, { method: 'POST', body: JSON.stringify(body) }),
  },

  // Hotel integration / PMS
  pms: {
    getHabitacionesOcupadas: () => apiRequest('/pms/habitaciones'),
    enviarCargo: (body: any) =>
      apiRequest('/pms/cargo', { method: 'POST', body: JSON.stringify(body) }),
    reintentarCargo: (id: string) =>
      apiRequest(`/pms/reintentar/${id}`, { method: 'POST' }),
    getConciliacion: () => apiRequest('/pms/conciliacion'),
  },

  // Accounts receivable (CLI-005, CLI-006)
  cxc: {
    getClientes: (fechaCorte?: string) => apiRequest(`/cxc/clientes${fechaCorte ? `?fechaCorte=${fechaCorte}` : ''}`),
    getEstadoCuenta: (id: string, fechaCorte?: string) =>
      apiRequest(`/cxc/clientes/${id}/estado-cuenta${fechaCorte ? `?fechaCorte=${fechaCorte}` : ''}`),
    getAntiguedad: (fechaCorte?: string) => apiRequest(`/cxc/antiguedad${fechaCorte ? `?fechaCorte=${fechaCorte}` : ''}`),
    registrarAbono: (body: any) => apiRequest('/cxc/abonos', { method: 'POST', body: JSON.stringify(body) }),
    anularAbono: (id: string, motivo: string) =>
      apiRequest(`/cxc/abonos/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) }),
  },

  // Reports and dashboard
  reportes: {
    getDashboardKPIs: () => apiRequest('/reportes/dashboard'),
    // Generic reports: ventas, formas-pago, productos-vendidos, existencias, kardex, compras, cierres-caja, opciones
    get: (reporte: string, params?: Record<string, unknown>) =>
      apiRequest(`/reportes/${reporte}${queryString(params)}`) as Promise<{ success: boolean; data?: any; message?: string; resumen?: any }>,
  },

  // Audit log
  auditoria: {
    getBitacora: (params?: any) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/auditoria?${q}`);
    },
  },
};
