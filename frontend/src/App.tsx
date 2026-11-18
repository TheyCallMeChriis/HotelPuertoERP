// Application shell: shows the login screen or the main layout with the tabs allowed for the user.

import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar, useNavItems } from './components/Navbar';
import { Login } from './pages/Login';
import { POS } from './pages/POS';
import { Caja } from './pages/Caja';
import { Inventario } from './pages/Inventario';
import { Compras } from './pages/Compras';
import { PMS } from './pages/PMS';
import { Reportes } from './pages/Reportes';
import { Auditoria } from './pages/Auditoria';
import { Catalogos } from './pages/Catalogos';
import { Administracion } from './pages/Administracion';
import { CuentasCobrar } from './pages/CuentasCobrar';

// Main layout: navigation bar plus the active screen
const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('pos');
  const navItems = useNavItems();

  // If the profile cannot access the current tab, show the first allowed one
  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((i) => i.id === activeTab)) setActiveTab(navItems[0].id);
  }, [navItems, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-400">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1">
        {/* Only screens allowed for the profile are mounted (avoids API calls without permission) */}
        {navItems.some((i) => i.id === activeTab) && <>
        {activeTab === 'pos' && <POS />}
        {activeTab === 'caja' && <Caja />}
        {activeTab === 'inventario' && <Inventario />}
        {activeTab === 'compras' && <Compras />}
        {activeTab === 'pms' && <PMS />}
        {activeTab === 'reportes' && <Reportes />}
        {activeTab === 'auditoria' && <Auditoria />}
        {activeTab === 'catalogos' && <Catalogos />}
        {activeTab === 'cxc' && <CuentasCobrar />}
        {activeTab === 'admin' && <Administracion />}
        </>}
        {user && navItems.length === 0 && (
          <p className="text-center text-sm text-gray-500 py-16">Su cuenta no tiene módulos asignados. Contacte al administrador.</p>
        )}
      </main>
    </div>
  );
};

// Root component wrapped in the authentication provider
export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
};

export default App;
