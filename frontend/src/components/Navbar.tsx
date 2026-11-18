import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Alert, Button, Field, Modal, inputClass } from './ui';
import {
  ShoppingCart,
  DollarSign,
  Package,
  Truck,
  Hotel,
  BarChart3,
  ShieldCheck,
  LogOut,
  User as UserIcon,
  Database,
  Users,
  KeyRound,
  Wallet,
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

// Tabs shown according to permissions. The UI only hides them; the backend validates every action (SEG-002).
export function useNavItems() {
  const { hasRole, hasPermission } = useAuth();
  return [
    { id: 'pos', label: 'POS / Ventas', icon: ShoppingCart, visible: hasPermission('VENTAS', 'CREAR') }, // view sales without selling: Reports
    { id: 'caja', label: 'Caja', icon: DollarSign, visible: hasPermission('CAJA', 'VER') },
    { id: 'inventario', label: 'Inventario', icon: Package, visible: hasPermission('INVENTARIO', 'VER') },
    { id: 'compras', label: 'Compras', icon: Truck, visible: hasPermission('COMPRAS', 'VER') || hasPermission('COMPRAS', 'APROBAR') || hasPermission('INVENTARIO', 'CREAR') },
    { id: 'pms', label: 'PMS', icon: Hotel, visible: hasPermission('HOTEL_PMS', 'VER') },
    { id: 'reportes', label: 'Reportes', icon: BarChart3, visible: hasPermission('REPORTES', 'VER') },
    { id: 'catalogos', label: 'Catálogos', icon: Database,
      visible: hasPermission('CATALOGOS', 'VER') || hasPermission('CLIENTES', 'VER') || hasPermission('PROVEEDORES', 'VER') },
    { id: 'cxc', label: 'Cobros', icon: Wallet, visible: hasPermission('CLIENTES', 'VER') },
    { id: 'admin', label: 'Usuarios', icon: Users, visible: hasPermission('SEGURIDAD', 'VER') },
    { id: 'auditoria', label: 'Auditoría', icon: ShieldCheck, visible: hasRole('AUDITOR') },
  ].filter((item) => item.visible);
}

// Modal to change the signed-in user's own password
const CambiarPassword: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const guardar = async () => {
    if (nueva.length < 12) return setError('La nueva contraseña debe tener al menos 12 caracteres');
    if (nueva !== confirmar) return setError('Las contraseñas no coinciden');
    const res = await api.auth.cambiarPassword(actual, nueva);
    if (!res.success) return setError(res.message || 'No se pudo cambiar la contraseña');
    setError('');
    setOk(true);
  };

  return (
    <Modal title="Cambiar mi contraseña" onClose={onClose}
      footer={ok ? <Button onClick={onClose}>Cerrar</Button> : <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={guardar}>Guardar</Button></>}>
      {error && <Alert kind="error" message={error} />}
      {ok ? <Alert kind="success" message="Contraseña actualizada correctamente." /> : (
        <>
          <Field label="Contraseña actual" required>
            <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} className={inputClass} autoComplete="current-password" />
          </Field>
          <Field label="Nueva contraseña" required hint="Mínimo 12 caracteres">
            <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={inputClass} autoComplete="new-password" />
          </Field>
          <Field label="Confirmar nueva contraseña" required>
            <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={inputClass} autoComplete="new-password" />
          </Field>
        </>
      )}
    </Modal>
  );
};

// Top bar with tabs, current user, password change and logout.
export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, logout } = useAuth();
  const navItems = useNavItems();
  const [cambiarClave, setCambiarClave] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Hotel logo and name */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('pos')}>
            <div className="bg-emerald-600 text-white p-2 rounded-lg shadow">
              <Hotel className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-bold text-gray-900 tracking-tight">Hotel Puerto Limón</span>
              <span className="block text-xs text-emerald-700 font-semibold tracking-wider uppercase">
                Sistema POS-ERP Modular
              </span>
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex flex-1 justify-center overflow-x-auto mx-4 space-x-1">
            {navItems
              .map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    className={`shrink-0 flex items-center space-x-1.5 px-2.5 2xl:px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-600'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden 2xl:inline">{item.label}</span>
                  </button>
                );
              })}
          </nav>

          {/* Current user and logout */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-right">
              <div className="bg-emerald-100 p-1.5 rounded-full text-emerald-800">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-bold text-gray-800">{user?.nombre}</p>
                <div className="flex space-x-1">
                  {user?.roles.map((r) => (
                    <span key={r} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setCambiarClave(true)}
              title="Cambiar contraseña"
              className="p-2 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              <KeyRound className="w-5 h-5" />
            </button>
            <button
              onClick={logout}
              title="Cerrar Sesión"
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      {cambiarClave && <CambiarPassword onClose={() => setCambiarClave(false)} />}
    </header>
  );
};
