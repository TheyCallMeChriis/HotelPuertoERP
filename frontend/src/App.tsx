import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { POS } from './pages/POS';
import { Caja } from './pages/Caja';
import { Inventario } from './pages/Inventario';
import { Compras } from './pages/Compras';
import { PMS } from './pages/PMS';
import { Reportes } from './pages/Reportes';
import { Auditoria } from './pages/Auditoria';

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('pos');

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
        {activeTab === 'pos' && <POS />}
        {activeTab === 'caja' && <Caja />}
        {activeTab === 'inventario' && <Inventario />}
        {activeTab === 'compras' && <Compras />}
        {activeTab === 'pms' && <PMS />}
        {activeTab === 'reportes' && <Reportes />}
        {activeTab === 'auditoria' && <Auditoria />}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
};

export default App;
