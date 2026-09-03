import { Router } from 'express';
import {
  getProductos,
  createProducto,
  updateProducto,
  getCategorias,
  createCategoria,
  getClientes,
  createCliente,
  getProveedores,
  createProveedor,
  getBodegas,
  getPuntosVenta,
  getFormasPago,
} from './catalogos.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

// Todas las rutas de catálogos requieren autenticación
router.use(authenticateToken);

// Productos
router.get('/productos', getProductos);
router.post('/productos', requirePermission('VENTAS', 'CREAR'), createProducto);
router.put('/productos/:id', requirePermission('VENTAS', 'EDITAR'), updateProducto);

// Categorías
router.get('/categorias', getCategorias);
router.post('/categorias', requirePermission('VENTAS', 'CREAR'), createCategoria);

// Clientes
router.get('/clientes', getClientes);
router.post('/clientes', requirePermission('CLIENTES', 'CREAR'), createCliente);

// Proveedores
router.get('/proveedores', getProveedores);
router.post('/proveedores', requirePermission('PROVEEDORES', 'CREAR'), createProveedor);

// Bodegas, POS, Formas de pago
router.get('/bodegas', getBodegas);
router.get('/puntos-venta', getPuntosVenta);
router.get('/formas-pago', getFormasPago);

export default router;
