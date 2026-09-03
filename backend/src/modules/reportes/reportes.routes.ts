import { Router } from 'express';
import {
  getDashboardKPIs,
  getReporteVentas,
  getReporteFormasPago,
  getReporteDiferenciasCaja,
} from './reportes.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/dashboard', getDashboardKPIs);
router.get('/ventas', requirePermission('REPORTES', 'VER'), getReporteVentas);
router.get('/formas-pago', requirePermission('REPORTES', 'VER'), getReporteFormasPago);
router.get('/caja-diferencias', requirePermission('REPORTES', 'VER'), getReporteDiferenciasCaja);

export default router;
