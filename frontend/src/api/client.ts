const API_BASE = '/api';

function queryString(params?: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

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

export const api = {
  // Autenticación
  auth: {
    login: (body: { username: string; password: string }) =>
      apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    getMe: () => apiRequest('/auth/me'),
  },

  // Catálogos
  catalogos: {
    getProductos: (params?: { busqueda?: string; categoriaId?: string }) => {
      return apiRequest(`/catalogos/productos${queryString(params)}`);
    },
    getCategorias: () => apiRequest('/catalogos/categorias'),
    getClientes: (busqueda?: string) =>
      apiRequest(`/catalogos/clientes${busqueda ? `?busqueda=${encodeURIComponent(busqueda)}` : ''}`),
    createCliente: (body: any) =>
      apiRequest('/catalogos/clientes', { method: 'POST', body: JSON.stringify(body) }),
    getProveedores: () => apiRequest('/catalogos/proveedores'),
    getBodegas: () => apiRequest('/catalogos/bodegas'),
    getPuntosVenta: () => apiRequest('/catalogos/puntos-venta'),
    getFormasPago: () => apiRequest('/catalogos/formas-pago'),
  },

  // Caja y Turnos
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

  // Ventas (POS)
  ventas: {
    createVenta: (body: any) =>
      apiRequest('/ventas', { method: 'POST', body: JSON.stringify(body) }),
    getVentas: (params?: any) => {
      return apiRequest(`/ventas${queryString(params)}`);
    },
    getVentaById: (id: string) => apiRequest(`/ventas/${id}`),
    anularVenta: (id: string, motivo: string) =>
      apiRequest(`/ventas/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) }),
  },

  // Inventarios y Kardex
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
  },

  // Compras
  compras: {
    createOrden: (body: any) =>
      apiRequest('/compras/ordenes', { method: 'POST', body: JSON.stringify(body) }),
    getOrdenes: (params?: any) => {
      return apiRequest(`/compras/ordenes${queryString(params)}`);
    },
    registrarRecepcion: (body: any) =>
      apiRequest('/compras/recepciones', { method: 'POST', body: JSON.stringify(body) }),
  },

  // Integración Hotelera / PMS
  pms: {
    getHabitacionesOcupadas: () => apiRequest('/pms/habitaciones'),
    enviarCargo: (body: any) =>
      apiRequest('/pms/cargo', { method: 'POST', body: JSON.stringify(body) }),
    reintentarCargo: (id: string) =>
      apiRequest(`/pms/reintentar/${id}`, { method: 'POST' }),
    getConciliacion: () => apiRequest('/pms/conciliacion'),
  },

  // Reportes y Dashboard
  reportes: {
    getDashboardKPIs: () => apiRequest('/reportes/dashboard'),
    getVentas: (params?: any) => {
      return apiRequest(`/reportes/ventas${queryString(params)}`);
    },
    getFormasPago: (params?: any) => {
      return apiRequest(`/reportes/formas-pago${queryString(params)}`);
    },
    getDiferenciasCaja: () => apiRequest('/reportes/caja-diferencias'),
  },

  // Auditoría
  auditoria: {
    getBitacora: (params?: any) => {
      const q = new URLSearchParams(params).toString();
      return apiRequest(`/auditoria?${q}`);
    },
  },
};
