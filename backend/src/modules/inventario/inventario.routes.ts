import { Router } from 'express';
import {
  getExistencias,
  getKardexByProducto,
  registrarMovimientoManual,
  realizarTraslado,
  realizarAjuste,
} from './inventario.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/existencias', requirePermission('INVENTARIO', 'VER'), getExistencias);
router.get('/kardex/:productId', requirePermission('INVENTARIO', 'VER'), getKardexByProducto);
router.post('/movimiento', requirePermission('INVENTARIO', 'CREAR'), registrarMovimientoManual);
router.post('/traslado', requirePermission('INVENTARIO', 'CREAR'), realizarTraslado);
router.post('/ajuste', requirePermission('INVENTARIO', 'AJUSTE'), realizarAjuste);

export default router;
