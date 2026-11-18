// PMS routes (/api/pms).

import { Router } from 'express';
import {
  getHabitacionesOcupadas,
  enviarCargoPMS,
  reintentarCargoPMS,
  getConciliacionPMS,
} from './pms.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/habitaciones', requirePermission('HOTEL_PMS', 'VER'), getHabitacionesOcupadas);
router.post('/cargo', requirePermission('HOTEL_PMS', 'CREAR'), enviarCargoPMS);
router.post('/reintentar/:id', requirePermission('HOTEL_PMS', 'CREAR'), reintentarCargoPMS);
router.get('/conciliacion', requirePermission('HOTEL_PMS', 'VER'), getConciliacionPMS);

export default router;
