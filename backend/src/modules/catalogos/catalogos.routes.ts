// Catalog routes (/api/catalogos).

import { Router } from 'express';
import {
  getProductos, createProducto, updateProducto,
  getCategorias, createCategoria, updateCategoria,
  getClientes, createCliente, updateCliente,
  getProveedores, createProveedor, updateProveedor,
  getBodegas, createBodega, updateBodega,
  getCajas, createCaja, updateCaja,
  getDepartamentos, createDepartamento, updateDepartamento,
  getPuntosVenta, createPuntoVenta, updatePuntoVenta,
  getFormasPago,
} from './catalogos.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

// Every catalog route requires authentication.
// Read endpoints stay available to operations (POS, purchasing, inventory);
// creating and editing master catalogs requires specific permissions (SEG-002).
router.use(authenticateToken);

// Products and categories
router.get('/productos', getProductos);
router.post('/productos', requirePermission('CATALOGOS', 'CREAR'), createProducto);
router.put('/productos/:id', requirePermission('CATALOGOS', 'EDITAR'), updateProducto);
router.get('/categorias', getCategorias);
router.post('/categorias', requirePermission('CATALOGOS', 'CREAR'), createCategoria);
router.put('/categorias/:id', requirePermission('CATALOGOS', 'EDITAR'), updateCategoria);

// Customers
router.get('/clientes', getClientes);
router.post('/clientes', requirePermission('CLIENTES', 'CREAR'), createCliente);
router.put('/clientes/:id', requirePermission('CLIENTES', 'EDITAR'), updateCliente);

// Suppliers
router.get('/proveedores', getProveedores);
router.post('/proveedores', requirePermission('PROVEEDORES', 'CREAR'), createProveedor);
router.put('/proveedores/:id', requirePermission('PROVEEDORES', 'EDITAR'), updateProveedor);

// Operating setup: warehouses, cash registers, departments and points of sale
router.get('/bodegas', getBodegas);
router.post('/bodegas', requirePermission('CATALOGOS', 'CREAR'), createBodega);
router.put('/bodegas/:id', requirePermission('CATALOGOS', 'EDITAR'), updateBodega);
router.get('/cajas', getCajas);
router.post('/cajas', requirePermission('CATALOGOS', 'CREAR'), createCaja);
router.put('/cajas/:id', requirePermission('CATALOGOS', 'EDITAR'), updateCaja);
router.get('/departamentos', getDepartamentos);
router.post('/departamentos', requirePermission('CATALOGOS', 'CREAR'), createDepartamento);
router.put('/departamentos/:id', requirePermission('CATALOGOS', 'EDITAR'), updateDepartamento);
router.get('/puntos-venta', getPuntosVenta);
router.post('/puntos-venta', requirePermission('CATALOGOS', 'CREAR'), createPuntoVenta);
router.put('/puntos-venta/:id', requirePermission('CATALOGOS', 'EDITAR'), updatePuntoVenta);

router.get('/formas-pago', getFormasPago);

export default router;
