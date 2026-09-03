import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { registrarAuditoria } from '../../utils/audit';

// ================= PRODUCTOS =================
export const getProductos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { busqueda, categoriaId, soloActivos } = req.query;

  const whereClause: any = {};
  if (soloActivos !== 'false') {
    whereClause.activo = true;
  }
  if (categoriaId) {
    whereClause.categoriaId = String(categoriaId);
  }
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
    include: {
      categoria: true,
      stock: {
        include: { warehouse: true },
      },
    },
    orderBy: { nombre: 'asc' },
  });

  res.json({ success: true, data: productos });
};

export const createProducto = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { codigo, nombre, descripcion, categoriaId, precioVenta, costo, impuesto, codigoBarras, esServicio } = req.body;

  if (!codigo || !nombre || !categoriaId || precioVenta === undefined) {
    res.status(400).json({ success: false, message: 'Código, nombre, categoría y precio son obligatorios' });
    return;
  }

  const existe = await prisma.product.findUnique({ where: { codigo } });
  if (existe) {
    res.status(400).json({ success: false, message: 'Ya existe un producto con este código' });
    return;
  }

  const producto = await prisma.product.create({
    data: {
      codigo,
      nombre,
      descripcion,
      categoriaId,
      precioVenta,
      costo: costo || 0,
      impuesto: impuesto !== undefined ? impuesto : 13.0,
      codigoBarras,
      esServicio: Boolean(esServicio),
    },
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'CREAR_PRODUCTO',
    entidad: 'Product',
    entidadId: producto.id,
    detalle: { codigo, nombre, precioVenta },
    ip: req.ip,
  });

  res.status(201).json({ success: true, message: 'Producto creado exitosamente', data: producto });
};

export const updateProducto = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { nombre, descripcion, categoriaId, precioVenta, costo, impuesto, codigoBarras, activo, esServicio } = req.body;

  const anterior = await prisma.product.findUnique({ where: { id } });
  if (!anterior) {
    res.status(404).json({ success: false, message: 'Producto no encontrado' });
    return;
  }

  const actualizado = await prisma.product.update({
    where: { id },
    data: {
      nombre: nombre ?? anterior.nombre,
      descripcion: descripcion ?? anterior.descripcion,
      categoriaId: categoriaId ?? anterior.categoriaId,
      precioVenta: precioVenta !== undefined ? precioVenta : anterior.precioVenta,
      costo: costo !== undefined ? costo : anterior.costo,
      impuesto: impuesto !== undefined ? impuesto : anterior.impuesto,
      codigoBarras: codigoBarras ?? anterior.codigoBarras,
      activo: activo !== undefined ? activo : anterior.activo,
      esServicio: esServicio !== undefined ? esServicio : anterior.esServicio,
    },
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'EDITAR_PRODUCTO',
    entidad: 'Product',
    entidadId: id,
    detalle: { antes: anterior, ahora: actualizado },
    ip: req.ip,
  });

  res.json({ success: true, message: 'Producto actualizado exitosamente', data: actualizado });
};

// ================= CATEGORIAS =================
export const getCategorias = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const categorias = await prisma.category.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: categorias });
};

export const createCategoria = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { nombre, descripcion } = req.body;
  if (!nombre) {
    res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    return;
  }
  const categoria = await prisma.category.create({ data: { nombre, descripcion } });
  res.status(201).json({ success: true, data: categoria });
};

// ================= CLIENTES =================
export const getClientes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { busqueda } = req.query;
  const whereClause: any = { activo: true };

  if (busqueda) {
    const q = String(busqueda).trim();
    whereClause.OR = [
      { identificacion: { contains: q, mode: 'insensitive' } },
      { nombre: { contains: q, mode: 'insensitive' } },
    ];
  }

  const clientes = await prisma.customer.findMany({
    where: whereClause,
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: clientes });
};

export const createCliente = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { tipoIdentificacion, identificacion, nombre, email, telefono, direccion, limiteCredito, diasCredito, creditoActivo } = req.body;

  if (!identificacion || !nombre) {
    res.status(400).json({ success: false, message: 'Identificación y nombre son obligatorios' });
    return;
  }

  const existe = await prisma.customer.findUnique({ where: { identificacion } });
  if (existe) {
    res.status(400).json({ success: false, message: 'Ya existe un cliente con esta identificación' });
    return;
  }

  const cliente = await prisma.customer.create({
    data: {
      tipoIdentificacion: tipoIdentificacion || 'CEDULA_FISICA',
      identificacion,
      nombre,
      email,
      telefono,
      direccion,
      limiteCredito: limiteCredito || 0,
      diasCredito: diasCredito || 0,
      creditoActivo: Boolean(creditoActivo),
    },
  });

  await registrarAuditoria({
    userId: req.user?.id,
    accion: 'CREAR_CLIENTE',
    entidad: 'Customer',
    entidadId: cliente.id,
    detalle: { identificacion, nombre },
    ip: req.ip,
  });

  res.status(201).json({ success: true, message: 'Cliente registrado exitosamente', data: cliente });
};

// ================= PROVEEDORES =================
export const getProveedores = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const proveedores = await prisma.supplier.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: proveedores });
};

export const createProveedor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { identificacion, nombre, razonSocial, email, telefono, direccion, diasCredito } = req.body;

  if (!identificacion || !nombre) {
    res.status(400).json({ success: false, message: 'Identificación y nombre son requeridos' });
    return;
  }

  const proveedor = await prisma.supplier.create({
    data: {
      identificacion,
      nombre,
      razonSocial,
      email,
      telefono,
      direccion,
      diasCredito: diasCredito || 0,
    },
  });

  res.status(201).json({ success: true, data: proveedor });
};

// ================= BODEGAS, PUNTOS DE VENTA Y FORMAS DE PAGO =================
export const getBodegas = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const bodegas = await prisma.warehouse.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: bodegas });
};

export const getPuntosVenta = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const pos = await prisma.pointOfSale.findMany({
    where: { activo: true },
    include: {
      caja: true,
      bodegaDefecto: true,
    },
  });
  res.json({ success: true, data: pos });
};

export const getFormasPago = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const formasPago = await prisma.paymentMethod.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json({ success: true, data: formasPago });
};
