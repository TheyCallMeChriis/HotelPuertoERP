// Login screen. On a fresh installation (or with SETUP_TOKEN) it first offers the initial
// administrator registration.

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Hotel, Lock, User, AlertCircle, ArrowRight, UserPlus, Mail, KeyRound, BadgeCheck } from 'lucide-react';

// Same minimum as the backend (PASSWORD_MIN)
const PASSWORD_MIN = 12;
const inputClass =
  'block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm';

// Text input with a leading icon
const IconInput: React.FC<{
  label: string;
  icon: React.ElementType;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
}> = ({ label, icon: Icon, type = 'text', value, onChange, placeholder, autoComplete, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">{label}</label>
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
        <Icon className="w-5 h-5" />
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={inputClass}
        required
      />
    </div>
    {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
  </div>
);

// Login and initial administrator registration
export const Login: React.FC = () => {
  const { login, startSession } = useAuth();
  const [modo, setModo] = useState<'cargando' | 'login' | 'registro'>('cargando');
  const [registroDisponible, setRegistroDisponible] = useState(false);
  const [requiereCodigo, setRequiereCodigo] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On first load: if administrator registration is enabled, it is shown first
  useEffect(() => {
    api.auth.getSetup().then((res) => {
      const disponible = Boolean(res.success && res.data?.disponible);
      setRegistroDisponible(disponible);
      setRequiereCodigo(Boolean(res.data?.requiereCodigo));
      setModo(disponible ? 'registro' : 'login');
    });
  }, []);

  const cambiarModo = (m: 'login' | 'registro') => {
    setModo(m);
    setError(null);
    setPassword('');
    setConfirmar('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor complete todos los campos');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await login(username, password);
    setLoading(false);
    if (!res.success) setError(res.message || 'Error al iniciar sesión');
  };

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) return setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`);
    if (password !== confirmar) return setError('Las contraseñas no coinciden');
    if (requiereCodigo && !codigo.trim()) return setError('Ingrese el código de instalación definido en backend/.env');
    setLoading(true);
    setError(null);
    const res = await api.auth.setup({ username, nombre, email, password, codigo: requiereCodigo ? codigo : undefined });
    setLoading(false);
    if (!res.success || !res.data) return setError(res.message || 'No se pudo registrar el administrador');
    startSession(res.data.token, res.data.user);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
          <Hotel className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">Hotel Puerto Limón</h2>
        <p className="mt-2 text-sm text-slate-400">Sistema Modular POS-ERP para Operación Hotelera</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          {modo === 'cargando' && <p className="text-center text-sm text-gray-400">Cargando...</p>}

          {error && modo !== 'cargando' && (
            <div className="mb-5 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm flex items-center space-x-2 rounded">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {modo === 'registro' && (
            <form className="space-y-4" onSubmit={handleRegistro}>
              <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <UserPlus className="w-5 h-5 text-emerald-700 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-900">Registrar administrador</p>
                  <p className="text-xs text-emerald-800">
                    {requiereCodigo
                      ? 'Registro habilitado con código de instalación. Al terminar, borre SETUP_TOKEN de backend/.env.'
                      : 'No hay administradores activos. Cree la cuenta que configurará el sistema.'}
                  </p>
                </div>
              </div>
              {requiereCodigo && (
                <IconInput label="Código de instalación" icon={BadgeCheck} type="password" value={codigo} onChange={setCodigo}
                  autoComplete="off" hint="Valor de SETUP_TOKEN en backend/.env" />
              )}
              <IconInput label="Nombre completo" icon={User} value={nombre} onChange={setNombre} placeholder="ej. Christopher León" />
              <IconInput label="Usuario" icon={User} value={username} onChange={setUsername} placeholder="ej. chris.admin" autoComplete="username"
                hint="Minúsculas, números, punto o guion" />
              <IconInput label="Correo" icon={Mail} type="email" value={email} onChange={setEmail} autoComplete="email" />
              <IconInput label="Contraseña" icon={Lock} type="password" value={password} onChange={setPassword} autoComplete="new-password"
                hint={`Mínimo ${PASSWORD_MIN} caracteres`} />
              <IconInput label="Confirmar contraseña" icon={KeyRound} type="password" value={confirmar} onChange={setConfirmar} autoComplete="new-password" />
              <button type="submit" disabled={loading}
                className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {loading ? 'Registrando...' : 'Crear administrador e ingresar'}
              </button>
              {requiereCodigo && (
                <button type="button" onClick={() => cambiarModo('login')} className="w-full text-xs text-gray-500 hover:text-emerald-700">
                  Ya tengo una cuenta: iniciar sesión
                </button>
              )}
            </form>
          )}

          {modo === 'login' && (
            <form className="space-y-5" onSubmit={handleLogin}>
              <IconInput label="Usuario" icon={User} value={username} onChange={setUsername} placeholder="ej. admin o cajero1" autoComplete="username" />
              <IconInput label="Contraseña" icon={Lock} type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" />
              <button type="submit" disabled={loading}
                className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {loading ? 'Iniciando sesión...' : 'Ingresar al Sistema'}
                {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
              </button>
              {registroDisponible && (
                <button type="button" onClick={() => cambiarModo('registro')} className="w-full text-xs text-gray-500 hover:text-emerald-700">
                  Registrar un administrador
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
