import { Router } from 'express';
import {
  getTurnoActivo,
  abrirCaja,
  registrarMovimiento,
  cerrarCaja,
  getHistoricoCierres,
} from './caja.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/turno-activo', getTurnoActivo);
router.post('/apertura', requirePermission('CAJA', 'CREAR'), abrirCaja);
router.post('/movimiento', requirePermission('CAJA', 'CREAR'), registrarMovimiento);
router.post('/cierre', requirePermission('CAJA', 'EDITAR'), cerrarCaja);
router.get('/historico', requirePermission('CAJA', 'VER'), getHistoricoCierres);

export default router;
