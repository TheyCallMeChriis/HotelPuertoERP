import { Router } from 'express';
import {
  getHabitacionesOcupadas,
  enviarCargoPMS,
  reintentarCargoPMS,
  getConciliacionPMS,
} from './pms.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/habitaciones', getHabitacionesOcupadas);
router.post('/cargo', enviarCargoPMS);
router.post('/reintentar/:id', reintentarCargoPMS);
router.get('/conciliacion', getConciliacionPMS);

export default router;
