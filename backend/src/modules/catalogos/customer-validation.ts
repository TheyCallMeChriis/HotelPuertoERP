import { z } from 'zod';
import type { AuthenticatedUser } from '../../middleware/auth.middleware';
import { idField, moneyField, operationError, optionalText, parseOperation } from '../../utils/operation-validation';

const customerSchema = z.object({
  tipoIdentificacion: idField.optional().default('CEDULA_FISICA'), identificacion: idField, nombre: idField,
  email: optionalText, telefono: optionalText, direccion: optionalText,
  limiteCredito: moneyField.optional(), diasCredito: z.number().int().min(0).max(3650).optional().default(0),
  creditoActivo: z.boolean().optional().default(false),
});
export function parseCustomer(body: unknown, user: AuthenticatedUser) {
  const input = parseOperation(customerSchema, body);
  if ((input.creditoActivo || input.limiteCredito?.gt(0) || input.diasCredito > 0)
    && !user.roles.includes('ADMINISTRADOR') && !user.permisos.includes('CLIENTES:EDITAR')) {
    throw operationError('Se requiere permiso CLIENTES:EDITAR para autorizar condiciones de crédito', 403);
  }
  if (input.creditoActivo && (!input.limiteCredito?.gt(0) || input.diasCredito <= 0)) {
    throw operationError('El crédito activo requiere un límite positivo y un plazo en días');
  }
  return input;
}
