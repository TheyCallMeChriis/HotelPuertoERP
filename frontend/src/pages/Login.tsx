import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Hotel, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor complete todos los campos');
      return;
    }

    setLoading(true);
    setError(null);
    const res = await login(username, password);
    setLoading(false);

    if (!res.success) {
      setError(res.message || 'Error al iniciar sesión');
    }
  };

  const setDemoUser = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
          <Hotel className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Hotel Puerto Limón</h2>
        <p className="mt-2 text-sm text-slate-400">
          Sistema Modular POS-ERP para Operación Hotelera
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm flex items-center space-x-2 rounded">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Usuario
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. admin o cajero1"
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-50"
            >
              {loading ? 'Iniciando sesión...' : 'Ingresar al Sistema'}
              {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
            </button>
          </form>

          {/* Accesos rápidos para demostración y evaluación */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 text-center">
              Acceso Rápido por Perfil (Demostración)
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDemoUser('admin', 'AdminPassword2026!')}
                className="p-2 border border-gray-200 rounded hover:bg-emerald-50 hover:border-emerald-300 text-left transition"
              >
                <span className="font-bold text-gray-800 block">👑 Administrador</span>
                <span className="text-gray-500 text-[11px]">Acceso total</span>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('cajero1', 'Hotel2026!')}
                className="p-2 border border-gray-200 rounded hover:bg-emerald-50 hover:border-emerald-300 text-left transition"
              >
                <span className="font-bold text-gray-800 block">💳 Cajero / POS</span>
                <span className="text-gray-500 text-[11px]">Ventas y caja</span>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('mesero1', 'Hotel2026!')}
                className="p-2 border border-gray-200 rounded hover:bg-emerald-50 hover:border-emerald-300 text-left transition"
              >
                <span className="font-bold text-gray-800 block">🍹 Restaurante/Bar</span>
                <span className="text-gray-500 text-[11px]">Comandas y cargos</span>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('bodeguero1', 'Hotel2026!')}
                className="p-2 border border-gray-200 rounded hover:bg-emerald-50 hover:border-emerald-300 text-left transition"
              >
                <span className="font-bold text-gray-800 block">📦 Bodeguero</span>
                <span className="text-gray-500 text-[11px]">Kardex y traslados</span>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('auditor1', 'Hotel2026!')}
                className="p-2 border border-gray-200 rounded hover:bg-emerald-50 hover:border-emerald-300 text-left col-span-2 transition"
              >
                <span className="font-bold text-gray-800 block">🛡️ Auditor / TI</span>
                <span className="text-gray-500 text-[11px]">Bitácora y supervisión técnica</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
