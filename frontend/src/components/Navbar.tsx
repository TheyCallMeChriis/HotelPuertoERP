import React from 'react';
import { useAuth } from '../context/AuthContext';
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
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, logout, hasRole } = useAuth();

  const navItems = [
    { id: 'pos', label: 'POS / Ventas', icon: ShoppingCart, visible: true },
    { id: 'caja', label: 'Caja & Arqueo', icon: DollarSign, visible: true },
    { id: 'inventario', label: 'Inventario & Kardex', icon: Package, visible: hasRole('BODEGA') || hasRole('ADMINISTRADOR') },
    { id: 'compras', label: 'Compras', icon: Truck, visible: hasRole('PROVEEDURIA') || hasRole('ADMINISTRADOR') },
    { id: 'pms', label: 'Simulador PMS', icon: Hotel, visible: true },
    { id: 'reportes', label: 'Reportes & KPIs', icon: BarChart3, visible: hasRole('CONTABILIDAD') || hasRole('ADMINISTRADOR') },
    { id: 'auditoria', label: 'Bitácora Auditoría', icon: ShieldCheck, visible: hasRole('AUDITOR') || hasRole('ADMINISTRADOR') },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo y Nombre del Hotel */}
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

          {/* Navegación por Pestañas */}
          <nav className="hidden md:flex space-x-1">
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-600'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
          </nav>

          {/* Usuario actual y Logout */}
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
              onClick={logout}
              title="Cerrar Sesión"
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
