// Validation schemas for master catalogs (GEN-004, GEN-005, GEN-007, COM-001, COM-009).
// Update schemas are partial and never allow changing the business code or identification.

import { z } from 'zod';
import { moneyField } from '../../utils/operation-validation';
import { TIPOS_IDENTIFICACION } from './customer-validation';

// Shared field rules
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,30}$/, 'Código: 2 a 30 caracteres (letras, números, guion o guion bajo)');
const name = z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(150);
const text = z.string().trim().max(500).nullish().transform((v) => (v ? v : null));
const email = z.union([z.string().trim().email('Correo inválido'), z.literal(''), z.null()]).optional()
  .transform((v) => (v ? v.toLowerCase() : null));
const percent = z.union([z.number(), z.string().trim()]).transform(Number)
  .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100, 'El impuesto debe estar entre 0 y 100');
const days = z.number().int().min(0).max(3650);

export const productSchema = z.object({
  codigo: code,
  nombre: name,
  descripcion: text,
  categoriaId: z.string().trim().min(1, 'Seleccione una categoría'),
  precioVenta: moneyField,
  costo: moneyField.optional(),
  impuesto: percent.optional(),
  codigoBarras: text,
  esServicio: z.boolean().optional(),
  activo: z.boolean().optional(),
});
export const productUpdateSchema = productSchema.omit({ codigo: true }).partial();

export const categorySchema = z.object({ nombre: name, descripcion: text, activo: z.boolean().optional() });
export const categoryUpdateSchema = categorySchema.partial();

export const customerUpdateSchema = z.object({
  tipoIdentificacion: z.enum(TIPOS_IDENTIFICACION).optional(),
  contacto: text,
  nombre: name.optional(),
  email,
  telefono: text,
  direccion: text,
  limiteCredito: moneyField.optional(),
  diasCredito: days.optional(),
  creditoActivo: z.boolean().optional(),
  activo: z.boolean().optional(),
}).partial();

export const supplierSchema = z.object({
  identificacion: z.string().trim().min(3, 'Identificación inválida').max(40),
  nombre: name,
  razonSocial: text,
  email,
  telefono: text,
  direccion: text,
  diasCredito: days.optional(),
  condicionesPago: text,
  activo: z.boolean().optional(),
});
export const supplierUpdateSchema = supplierSchema.omit({ identificacion: true }).partial();

export const warehouseSchema = z.object({ codigo: code, nombre: name, ubicacion: text, activo: z.boolean().optional() });
export const warehouseUpdateSchema = warehouseSchema.omit({ codigo: true }).partial();

// Cash registers share the warehouse fields: code, name and location
export const cashRegisterSchema = warehouseSchema;
export const cashRegisterUpdateSchema = warehouseUpdateSchema;

export const departmentSchema = z.object({ codigo: code, nombre: name, descripcion: text, activo: z.boolean().optional() });
export const departmentUpdateSchema = departmentSchema.omit({ codigo: true }).partial();

export const pointOfSaleSchema = z.object({
  codigo: code,
  nombre: name,
  departamento: code,
  cajaId: z.string().trim().min(1, 'Seleccione una caja'),
  bodegaDefectoId: z.string().trim().min(1, 'Seleccione una bodega'),
  activo: z.boolean().optional(),
});
export const pointOfSaleUpdateSchema = pointOfSaleSchema.omit({ codigo: true }).partial();
