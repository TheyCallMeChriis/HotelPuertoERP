import React from 'react';
import { X } from 'lucide-react';

// Shared visual components used by the administration and catalog screens

// Standard input style
export const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100 disabled:text-gray-500';

// Modal dialog with title, scrollable body and optional footer
export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ title, onClose, children, footer, wide }) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <div className={`bg-white rounded-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-2xl flex flex-col max-h-[90vh]`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-base text-gray-900">{title}</h3>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded" aria-label="Cerrar">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="px-6 py-4 overflow-y-auto space-y-4">{children}</div>
      {footer && <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
    </div>
  </div>
);

// Form label with optional hint and required marker
export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; required?: boolean }> = ({
  label, hint, children, required,
}) => (
  <label className="block">
    <span className="block text-xs font-semibold text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </span>
    {children}
    {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
  </label>
);

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-emerald-700 hover:bg-emerald-50 disabled:text-gray-400',
};

// Button with visual variants
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }> = ({
  variant = 'primary', small, className = '', ...props
}) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${
      small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'
    } ${variantClass[variant]} ${className}`}
  />
);

// Active/inactive badge used in catalog tables
export const StatusBadge: React.FC<{ activo: boolean }> = ({ activo }) => (
  <span
    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
      activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
    }`}
  >
    {activo ? 'ACTIVO' : 'INACTIVO'}
  </span>
);

// Success or error message, optionally dismissible
export const Alert: React.FC<{ kind: 'error' | 'success'; message: string; onClose?: () => void }> = ({ kind, message, onClose }) => (
  <div
    className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ${
      kind === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
    }`}
    role={kind === 'error' ? 'alert' : 'status'}
  >
    <span>{message}</span>
    {onClose && (
      <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Cerrar mensaje">
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

// Horizontal tab selector
export const Tabs: React.FC<{
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div className="flex flex-wrap gap-1 border-b border-gray-200">
    {tabs.map((t) => (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
          active === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-800'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

// GEN-008: who created and modified the record, and when
export const AuditInfo: React.FC<{ row: { createdAt?: string; updatedAt?: string; creadoPor?: string | null; modificadoPor?: string | null } }> = ({ row }) => {
  if (!row?.createdAt) return null;
  const f = (d?: string) => (d ? new Date(d).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  return (
    <p className="text-[11px] text-gray-500 bg-gray-50 rounded-md px-3 py-2">
      Creado {f(row.createdAt)}{row.creadoPor ? ` por ${row.creadoPor}` : ''}
      {row.updatedAt && row.updatedAt !== row.createdAt && <> · Modificado {f(row.updatedAt)}{row.modificadoPor ? ` por ${row.modificadoPor}` : ''}</>}
    </p>
  );
};
