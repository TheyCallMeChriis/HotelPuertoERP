// Report routes (/api/reportes). The dashboard is open to every signed-in user; the rest need REPORTES:VER.

import { Router } from 'express';
import {
  getDashboardKPIs,
  getOpcionesReportes,
  getReporteVentas,
  getReporteFormasPago,
  getProductosMasVendidos,
  getReporteExistencias,
  getReporteKardex,
  getReporteCompras,
  getReporteCierresCaja,
  getReporteDiferenciasCaja,
} from './reportes.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/dashboard', getDashboardKPIs);
router.use(requirePermission('REPORTES', 'VER'));
router.get('/opciones', getOpcionesReportes);
router.get('/ventas', getReporteVentas);
router.get('/formas-pago', getReporteFormasPago);
router.get('/productos-vendidos', getProductosMasVendidos);
router.get('/existencias', getReporteExistencias);
router.get('/kardex', getReporteKardex);
router.get('/compras', getReporteCompras);
router.get('/cierres-caja', getReporteCierresCaja);
router.get('/caja-diferencias', getReporteDiferenciasCaja);

export default router;
