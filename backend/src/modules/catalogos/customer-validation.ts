// Customer validation (CLI-001, CLI-002, CLI-004).

import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { idField, moneyField, operationError, optionalText, parseOperation } from '../../utils/operation-validation';

// CLI-001: individuals (national ID, DIMEX, passport) and companies (corporate ID).
export const TIPOS_IDENTIFICACION = ['CEDULA_FISICA', 'CEDULA_JURIDICA', 'DIMEX', 'PASAPORTE'] as const;

// Costa Rican formats; dashes or spaces are accepted and the number of digits is validated
export function validarIdentificacion(tipo: string, identificacion: string): string | null {
  const digitos = identificacion.replace(/[\s-]/g, '');
  switch (tipo) {
    case 'CEDULA_FISICA':
      return /^[1-9]\d{8}$/.test(digitos) ? null : 'La cédula física debe tener 9 dígitos (ej. 1-0234-0567)';
    case 'CEDULA_JURIDICA':
      return /^[2-5]\d{9}$/.test(digitos) ? null : 'La cédula jurídica debe tener 10 dígitos (ej. 3-101-123456)';
    case 'DIMEX':
      return /^\d{11,12}$/.test(digitos) ? null : 'El DIMEX debe tener 11 o 12 dígitos';
    case 'PASAPORTE':
      return /^[A-Za-z0-9]{6,20}$/.test(digitos) ? null : 'El pasaporte debe tener de 6 a 20 letras o números';
    default:
      return 'Tipo de identificación no válido';
  }
}

// Body accepted when creating a customer
const customerSchema = z.object({
  tipoIdentificacion: z.enum(TIPOS_IDENTIFICACION).optional().default('CEDULA_FISICA'), identificacion: idField,
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(150),
  email: optionalText, telefono: optionalText, direccion: optionalText, contacto: optionalText,
  limiteCredito: moneyField.optional(), diasCredito: z.number().int().min(0).max(3650).optional().default(0),
  creditoActivo: z.boolean().optional().default(false),
});
// Validates a new customer. Granting credit requires CLIENTES:EDITAR, and active credit needs
// a positive limit and a term in days.
export function parseCustomer(body: unknown, user: AuthenticatedUser) {
  const input = parseOperation(customerSchema, body);
  if ((input.creditoActivo || input.limiteCredito?.gt(0) || input.diasCredito > 0)
    && !user.roles.includes('ADMINISTRADOR') && !user.permisos.includes('CLIENTES:EDITAR')) {
    throw operationError('Se requiere permiso CLIENTES:EDITAR para autorizar condiciones de crédito', 403);
  }
  if (input.creditoActivo && (!input.limiteCredito?.gt(0) || input.diasCredito <= 0)) {
    throw operationError('El crédito activo requiere un límite positivo y un plazo en días');
  }
  const errorId = validarIdentificacion(input.tipoIdentificacion, input.identificacion);
  if (errorId) throw operationError(errorId);
  return input;
}
