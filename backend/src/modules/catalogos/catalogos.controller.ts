// Master catalog endpoints: products, categories, customers, suppliers, warehouses, cash registers,
// departments, points of sale and payment methods. Every change records its author and an audit entry.

import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { autorCreacion, autorModificacion, registrarAuditoria } from '../../utils/audit';
import { operationError, parseOperation } from '../../utils/operation-validation';
import { parseCustomer, validarIdentificacion } from './customer-validation';
import {
  productSchema, productUpdateSchema, categorySchema, categoryUpdateSchema, customerUpdateSchema,
  supplierSchema, supplierUpdateSchema, warehouseSchema, warehouseUpdateSchema, cashRegisterSchema,
  cashRegisterUpdateSchema, departmentSchema, departmentUpdateSchema, pointOfSaleSchema, pointOfSaleUpdateSchema,
} from './catalog-validation';

// Catalog records are never physically deleted: they are deactivated (GEN-010).
// By default queries return active records only; ?todos=true includes inactive ones for maintenance.
const includeInactive = (req: AuthenticatedRequest) => req.query.todos === 'true';

// Picks the audit action name: activation, deactivation or a regular edit
function activityAction(entity: string, before: { activo: boolean }, input: { activo?: boolean }) {
  if (input.activo === false && before.activo) return `INACTIVAR_${entity}`;
  if (input.activo === true && !before.activo) return `ACTIVAR_${entity}`;
  return `EDITAR_${entity}`;
}

// Audit shortcut; the JSON round trip turns Decimal and Date values into plain JSON
async function audit(req: AuthenticatedRequest, accion: string, entidad: string, entidadId: string, detalle: unknown) {
  await registrarAuditoria({
    userId: req.user?.id, accion, entidad, entidadId, ip: req.ip,
    detalle: JSON.parse(JSON.stringify(detalle)),
  });
}

// ================= PRODUCTS (GEN-005, GEN-006) =================
export const getProductos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { busqueda, categoriaId } = req.query;

  const whereClause: any = {};
  if (!includeInactive(req)) whereClause.activo = true;
  if (categoriaId) whereClause.categoriaId = String(categoriaId);
  if (busqueda) {
    const q = String(busqueda).trim();
    whereClause.OR = [
      { codigo: { contains: q, mode: 'insensitive' } },
      { nombre: { contains: q, mode: 'insensitive' } },
      { codigoBarras: { contains: q, mode: 'insensitive' } },
    ];
  }

  const productos = await prisma.product.findMany({
    where: whereClause,
    include: { categoria: true, stock: { include: { warehouse: true } } },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: productos });
};

// A product can only be assigned to an active category
async function assertActiveCategory(categoriaId: string) {
  const categoria = await prisma.category.findUnique({ where: { id: categoriaId } });
  if (!categoria?.activo) throw operationError('La categoría no existe o está inactiva');
}

// Barcodes must be unique across products
async function assertUniqueBarcode(codigoBarras: string | null | undefined, excludeId?: string) {
  if (!codigoBarras) return;
  const other = await prisma.product.findFirst({ where: { codigoBarras, id: excludeId ? { not: excludeId } : undefined } });
  if (other) throw operationError(`El código de barras ya está asignado a ${other.codigo}`, 409);
}

// Creates a product (default VAT 13 %).
export const createProducto = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(productSchema, req.body);
  await assertActiveCategory(input.categoriaId);
  await assertUniqueBarcode(input.codigoBarras);

  const producto = await prisma.product.create({
    data: { ...autorCreacion(req.user),
      codigo: input.codigo,
      nombre: input.nombre,
      descripcion: input.descripcion,
      categoriaId: input.categoriaId,
      precioVenta: input.precioVenta,
      costo: input.costo ?? new Prisma.Decimal(0),
      impuesto: input.impuesto ?? 13,
      codigoBarras: input.codigoBarras,
      esServicio: Boolean(input.esServicio),
      activo: input.activo ?? true,
    },
    include: { categoria: true },
  });

  await audit(req, 'CREAR_PRODUCTO', 'Product', producto.id, {
    codigo: producto.codigo, nombre: producto.nombre, precioVenta: producto.precioVenta, costo: producto.costo,
  });
  res.status(201).json({ success: true, message: 'Producto creado exitosamente', data: producto });
};

// Updates a product. The product/service flag is locked once the product has inventory movements.
export const updateProducto = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(productUpdateSchema, req.body);
  const anterior = await prisma.product.findUnique({ where: { id } });
  if (!anterior) throw operationError('Producto no encontrado', 404);
  if (input.categoriaId && input.categoriaId !== anterior.categoriaId) await assertActiveCategory(input.categoriaId);
  if (input.codigoBarras !== undefined) await assertUniqueBarcode(input.codigoBarras, id);
  if (input.esServicio !== undefined && input.esServicio !== anterior.esServicio) {
    const conMovimientos = await prisma.inventoryMovement.count({ where: { productId: id } });
    if (conMovimientos > 0) throw operationError('No se puede cambiar el tipo producto/servicio: ya tiene movimientos de inventario', 409);
  }

  const actualizado = await prisma.product.update({
    where: { id },
    data: {
      nombre: input.nombre,
      descripcion: input.descripcion,
      categoriaId: input.categoriaId,
      precioVenta: input.precioVenta,
      costo: input.costo,
      impuesto: input.impuesto,
      codigoBarras: input.codigoBarras,
      esServicio: input.esServicio,
      activo: input.activo,
      ...autorModificacion(req.user),
    },
    include: { categoria: true },
  });

  await audit(req, activityAction('PRODUCTO', anterior, input), 'Product', id, { antes: anterior, ahora: actualizado });
  // SEG-004: price changes are logged as a dedicated event
  if (input.precioVenta && !input.precioVenta.equals(anterior.precioVenta)) {
    await audit(req, 'CAMBIO_PRECIO', 'Product', id, {
      codigo: anterior.codigo, precioAnterior: anterior.precioVenta, precioNuevo: actualizado.precioVenta,
    });
  }
  res.json({ success: true, message: 'Producto actualizado exitosamente', data: actualizado });
};

// ================= CATEGORIES =================
export const getCategorias = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const categorias = await prisma.category.findMany({
    where: includeInactive(req) ? {} : { activo: true },
    include: { _count: { select: { products: true } } },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: categorias });
};

// Creates a category.
export const createCategoria = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(categorySchema, req.body);
  const categoria = await prisma.category.create({ data: { ...autorCreacion(req.user), nombre: input.nombre, descripcion: input.descripcion, activo: input.activo ?? true } });
  await audit(req, 'CREAR_CATEGORIA', 'Category', categoria.id, input);
  res.status(201).json({ success: true, message: 'Categoría creada', data: categoria });
};

// Updates a category; it cannot be deactivated while it has active products.
export const updateCategoria = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(categoryUpdateSchema, req.body);
  const anterior = await prisma.category.findUnique({ where: { id } });
  if (!anterior) throw operationError('Categoría no encontrada', 404);
  if (input.activo === false && anterior.activo) {
    const activos = await prisma.product.count({ where: { categoriaId: id, activo: true } });
    if (activos > 0) throw operationError(`La categoría tiene ${activos} producto(s) activo(s); reasígnelos o inactívelos primero`, 409);
  }
  const categoria = await prisma.category.update({ where: { id }, data: { ...input, ...autorModificacion(req.user) } });
  await audit(req, activityAction('CATEGORIA', anterior, input), 'Category', id, { antes: anterior, ahora: categoria });
  res.json({ success: true, message: 'Categoría actualizada', data: categoria });
};

// ================= CUSTOMERS (GEN-007, CLI-001, CLI-002, CLI-004) =================
export const getClientes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { busqueda } = req.query;
  const whereClause: any = includeInactive(req) ? {} : { activo: true };
  if (busqueda) {
    const q = String(busqueda).trim();
    whereClause.OR = [
      { identificacion: { contains: q, mode: 'insensitive' } },
      { nombre: { contains: q, mode: 'insensitive' } },
    ];
  }
  const clientes = await prisma.customer.findMany({ where: whereClause, orderBy: { nombre: 'asc' } });
  res.json({ success: true, data: clientes });
};

// Creates a customer after validating its identification and credit terms (CLI-001, CLI-002).
export const createCliente = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseCustomer(req.body, req.user!);
  const cliente = await prisma.customer.create({
    data: { ...autorCreacion(req.user),
      tipoIdentificacion: input.tipoIdentificacion || 'CEDULA_FISICA',
      identificacion: input.identificacion,
      nombre: input.nombre,
      email: input.email || null,
      telefono: input.telefono || null,
      direccion: input.direccion || null,
      limiteCredito: input.limiteCredito ?? 0,
      diasCredito: input.diasCredito ?? 0,
      creditoActivo: input.creditoActivo,
      contacto: input.contacto ?? null,
    },
  });
  await audit(req, 'CREAR_CLIENTE', 'Customer', cliente.id, {
    identificacion: cliente.identificacion, nombre: cliente.nombre,
    creditoActivo: cliente.creditoActivo, limiteCredito: cliente.limiteCredito,
  });
  res.status(201).json({ success: true, message: 'Cliente registrado exitosamente', data: cliente });
};

// Updates a customer. Changing the ID type re-validates the stored identification;
// credit-term changes get a dedicated audit event.
export const updateCliente = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(customerUpdateSchema, req.body);
  const anterior = await prisma.customer.findUnique({ where: { id } });
  if (!anterior) throw operationError('Cliente no encontrado', 404);

  if (input.tipoIdentificacion && input.tipoIdentificacion !== anterior.tipoIdentificacion) {
    const errorId = validarIdentificacion(input.tipoIdentificacion, anterior.identificacion);
    if (errorId) throw operationError(`${errorId}. La identificación registrada no corresponde al nuevo tipo.`);
  }
  const creditoActivo = input.creditoActivo ?? anterior.creditoActivo;
  const limite = input.limiteCredito ?? anterior.limiteCredito;
  const dias = input.diasCredito ?? anterior.diasCredito;
  if (creditoActivo && (!new Prisma.Decimal(limite).gt(0) || dias <= 0)) {
    throw operationError('El crédito activo requiere un límite positivo y un plazo en días');
  }

  const cliente = await prisma.customer.update({ where: { id }, data: { ...input, ...autorModificacion(req.user) } });
  await audit(req, activityAction('CLIENTE', anterior, input), 'Customer', id, { antes: anterior, ahora: cliente });
  const creditoCambio = anterior.creditoActivo !== cliente.creditoActivo
    || !anterior.limiteCredito.equals(cliente.limiteCredito) || anterior.diasCredito !== cliente.diasCredito;
  if (creditoCambio) {
    await audit(req, 'CAMBIO_CONDICIONES_CREDITO', 'Customer', id, {
      antes: { creditoActivo: anterior.creditoActivo, limiteCredito: anterior.limiteCredito, diasCredito: anterior.diasCredito },
      ahora: { creditoActivo: cliente.creditoActivo, limiteCredito: cliente.limiteCredito, diasCredito: cliente.diasCredito },
    });
  }
  res.json({ success: true, message: 'Cliente actualizado', data: cliente });
};

// ================= SUPPLIERS (COM-001, COM-009) =================
export const getProveedores = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { busqueda } = req.query;
  const where: any = includeInactive(req) ? {} : { activo: true };
  if (busqueda) {
    const q = String(busqueda).trim();
    where.OR = [
      { identificacion: { contains: q, mode: 'insensitive' } },
      { nombre: { contains: q, mode: 'insensitive' } },
    ];
  }
  const proveedores = await prisma.supplier.findMany({ where, orderBy: { nombre: 'asc' } });
  res.json({ success: true, data: proveedores });
};

// Creates a supplier with its credit days and payment terms (COM-001, COM-009).
export const createProveedor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(supplierSchema, req.body);
  const proveedor = await prisma.supplier.create({
    data: { ...autorCreacion(req.user), ...input, diasCredito: input.diasCredito ?? 0, activo: input.activo ?? true },
  });
  await audit(req, 'CREAR_PROVEEDOR', 'Supplier', proveedor.id, input);
  res.status(201).json({ success: true, message: 'Proveedor registrado', data: proveedor });
};

// Updates a supplier.
export const updateProveedor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(supplierUpdateSchema, req.body);
  const anterior = await prisma.supplier.findUnique({ where: { id } });
  if (!anterior) throw operationError('Proveedor no encontrado', 404);
  const proveedor = await prisma.supplier.update({ where: { id }, data: { ...input, ...autorModificacion(req.user) } });
  await audit(req, activityAction('PROVEEDOR', anterior, input), 'Supplier', id, { antes: anterior, ahora: proveedor });
  res.json({ success: true, message: 'Proveedor actualizado', data: proveedor });
};

// ================= WAREHOUSES (INV-001, GEN-004) =================
export const getBodegas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const bodegas = await prisma.warehouse.findMany({
    where: includeInactive(req) ? {} : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: bodegas });
};

// Creates a warehouse.
export const createBodega = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(warehouseSchema, req.body);
  const bodega = await prisma.warehouse.create({ data: { ...autorCreacion(req.user), ...input, activo: input.activo ?? true } });
  await audit(req, 'CREAR_BODEGA', 'Warehouse', bodega.id, input);
  res.status(201).json({ success: true, message: 'Bodega creada', data: bodega });
};

// Updates a warehouse; it cannot be deactivated with stock or while it is a POS default warehouse.
export const updateBodega = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(warehouseUpdateSchema, req.body);
  const anterior = await prisma.warehouse.findUnique({ where: { id } });
  if (!anterior) throw operationError('Bodega no encontrada', 404);
  if (input.activo === false && anterior.activo) {
    const conExistencia = await prisma.stock.count({ where: { warehouseId: id, cantidad: { gt: 0 } } });
    if (conExistencia > 0) throw operationError(`La bodega tiene ${conExistencia} producto(s) con existencia; trasládelos antes de inactivarla`, 409);
    const pos = await prisma.pointOfSale.count({ where: { bodegaDefectoId: id, activo: true } });
    if (pos > 0) throw operationError('La bodega es la bodega por defecto de un punto de venta activo', 409);
  }
  const bodega = await prisma.warehouse.update({ where: { id }, data: { ...input, ...autorModificacion(req.user) } });
  await audit(req, activityAction('BODEGA', anterior, input), 'Warehouse', id, { antes: anterior, ahora: bodega });
  res.json({ success: true, message: 'Bodega actualizada', data: bodega });
};

// ================= CASH REGISTERS (GEN-004) =================
export const getCajas = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const cajas = await prisma.cashRegister.findMany({
    where: includeInactive(req) ? {} : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: cajas });
};

// Creates a cash register.
export const createCaja = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(cashRegisterSchema, req.body);
  const caja = await prisma.cashRegister.create({ data: { ...autorCreacion(req.user), ...input, activo: input.activo ?? true } });
  await audit(req, 'CREAR_CAJA', 'CashRegister', caja.id, input);
  res.status(201).json({ success: true, message: 'Caja creada', data: caja });
};

// Updates a cash register; it cannot be deactivated with an open shift or while linked to an active POS.
export const updateCaja = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(cashRegisterUpdateSchema, req.body);
  const anterior = await prisma.cashRegister.findUnique({ where: { id } });
  if (!anterior) throw operationError('Caja no encontrada', 404);
  if (input.activo === false && anterior.activo) {
    const abierta = await prisma.cashShift.count({ where: { cajaId: id, estado: 'ABIERTA' } });
    if (abierta > 0) throw operationError('La caja tiene un turno abierto; ciérrelo antes de inactivarla', 409);
    const pos = await prisma.pointOfSale.count({ where: { cajaId: id, activo: true } });
    if (pos > 0) throw operationError('La caja está asociada a un punto de venta activo', 409);
  }
  const caja = await prisma.cashRegister.update({ where: { id }, data: { ...input, ...autorModificacion(req.user) } });
  await audit(req, activityAction('CAJA', anterior, input), 'CashRegister', id, { antes: anterior, ahora: caja });
  res.json({ success: true, message: 'Caja actualizada', data: caja });
};

// ================= DEPARTMENTS (GEN-004) =================
export const getDepartamentos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const departamentos = await prisma.department.findMany({
    where: includeInactive(req) ? {} : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: departamentos });
};

// Creates a department.
export const createDepartamento = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(departmentSchema, req.body);
  const dep = await prisma.department.create({ data: { ...autorCreacion(req.user), ...input, activo: input.activo ?? true } });
  await audit(req, 'CREAR_DEPARTAMENTO', 'Department', dep.id, input);
  res.status(201).json({ success: true, message: 'Departamento creado', data: dep });
};

// Updates a department; it cannot be deactivated while assigned to an active POS.
export const updateDepartamento = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(departmentUpdateSchema, req.body);
  const anterior = await prisma.department.findUnique({ where: { id } });
  if (!anterior) throw operationError('Departamento no encontrado', 404);
  if (input.activo === false && anterior.activo) {
    const pos = await prisma.pointOfSale.count({ where: { departamento: anterior.codigo, activo: true } });
    if (pos > 0) throw operationError('El departamento está asignado a un punto de venta activo', 409);
  }
  const dep = await prisma.department.update({ where: { id }, data: { ...input, ...autorModificacion(req.user) } });
  await audit(req, activityAction('DEPARTAMENTO', anterior, input), 'Department', id, { antes: anterior, ahora: dep });
  res.json({ success: true, message: 'Departamento actualizado', data: dep });
};

// ================= POINTS OF SALE (GEN-004) =================
export const getPuntosVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const pos = await prisma.pointOfSale.findMany({
    where: includeInactive(req) ? {} : { activo: true },
    include: { caja: true, bodegaDefecto: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: pos });
};

// The department, register and warehouse referenced by a POS must exist and be active
async function assertPosReferences(data: { departamento?: string; cajaId?: string; bodegaDefectoId?: string }) {
  if (data.departamento) {
    const dep = await prisma.department.findUnique({ where: { codigo: data.departamento } });
    if (!dep?.activo) throw operationError('El departamento no existe o está inactivo');
  }
  if (data.cajaId) {
    const caja = await prisma.cashRegister.findUnique({ where: { id: data.cajaId } });
    if (!caja?.activo) throw operationError('La caja no existe o está inactiva');
  }
  if (data.bodegaDefectoId) {
    const bodega = await prisma.warehouse.findUnique({ where: { id: data.bodegaDefectoId } });
    if (!bodega?.activo) throw operationError('La bodega no existe o está inactiva');
  }
}

// Creates a point of sale.
export const createPuntoVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const input = parseOperation(pointOfSaleSchema, req.body);
  await assertPosReferences(input);
  const pos = await prisma.pointOfSale.create({
    data: { ...autorCreacion(req.user), ...input, activo: input.activo ?? true }, include: { caja: true, bodegaDefecto: true },
  });
  await audit(req, 'CREAR_PUNTO_VENTA', 'PointOfSale', pos.id, input);
  res.status(201).json({ success: true, message: 'Punto de venta creado', data: pos });
};

// Updates a point of sale; its register cannot change while that register has an open shift.
export const updatePuntoVenta = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const input = parseOperation(pointOfSaleUpdateSchema, req.body);
  const anterior = await prisma.pointOfSale.findUnique({ where: { id } });
  if (!anterior) throw operationError('Punto de venta no encontrado', 404);
  await assertPosReferences({
    departamento: input.departamento !== anterior.departamento ? input.departamento : undefined,
    cajaId: input.cajaId !== anterior.cajaId ? input.cajaId : undefined,
    bodegaDefectoId: input.bodegaDefectoId !== anterior.bodegaDefectoId ? input.bodegaDefectoId : undefined,
  });
  if (input.cajaId && input.cajaId !== anterior.cajaId) {
    const abierta = await prisma.cashShift.count({ where: { cajaId: anterior.cajaId, estado: 'ABIERTA' } });
    if (abierta > 0) throw operationError('No se puede cambiar la caja mientras tenga un turno abierto', 409);
  }
  const pos = await prisma.pointOfSale.update({ where: { id }, data: { ...input, ...autorModificacion(req.user) }, include: { caja: true, bodegaDefecto: true } });
  await audit(req, activityAction('PUNTO_VENTA', anterior, input), 'PointOfSale', id, { antes: anterior, ahora: pos });
  res.json({ success: true, message: 'Punto de venta actualizado', data: pos });
};

// ================= PAYMENT METHODS =================
export const getFormasPago = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const formasPago = await prisma.paymentMethod.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
  res.json({ success: true, data: formasPago });
};
