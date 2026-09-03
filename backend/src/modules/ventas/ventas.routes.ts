import { Router } from 'express';
import {
  createVenta,
  getVentas,
  getVentaById,
  anularVenta,
} from './ventas.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post('/', requirePermission('VENTAS', 'CREAR'), createVenta);
router.get('/', requirePermission('VENTAS', 'VER'), getVentas);
router.get('/:id', requirePermission('VENTAS', 'VER'), getVentaById);
router.post('/:id/anular', anularVenta); // Permiso validado en el controlador con mensaje específico

export default router;
