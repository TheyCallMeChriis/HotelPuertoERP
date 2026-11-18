// Sales routes (/api/ventas).

import { Router } from 'express';
import {
  createVenta,
  getVentas,
  getVentaById,
  anularVenta,
} from './ventas.controller';
import { getVentasSuspendidas, suspenderVenta, descartarVentaSuspendida } from './suspended-sales';
import { getNotasCredito, postNotaCredito, postReimpresionNota, postReimpresionVenta } from './credit-notes.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post('/', requirePermission('VENTAS', 'CREAR'), createVenta);
// Suspended sales (declared before '/:id' so they are not mistaken for a sale id)
router.get('/suspendidas', requirePermission('VENTAS', 'CREAR'), getVentasSuspendidas);
router.post('/suspendidas', requirePermission('VENTAS', 'CREAR'), suspenderVenta);
router.delete('/suspendidas/:id', requirePermission('VENTAS', 'CREAR'), descartarVentaSuspendida);
// Credit notes (FAC-005) and reprints (FAC-006); declared before '/:id'
router.get('/notas-credito', requirePermission('VENTAS', 'VER'), getNotasCredito);
router.post('/notas-credito/:id/reimpresion', requirePermission('VENTAS', 'VER'), postReimpresionNota);
router.post('/:id/nota-credito', postNotaCredito); // VENTAS:ANULAR is validated inside the operation
router.post('/:id/reimpresion', requirePermission('VENTAS', 'VER'), postReimpresionVenta);
router.get('/', requirePermission('VENTAS', 'VER'), getVentas);
router.get('/:id', requirePermission('VENTAS', 'VER'), getVentaById);
router.post('/:id/anular', anularVenta); // Permission validated in the controller with a specific message

export default router;
