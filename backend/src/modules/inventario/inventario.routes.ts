// Inventory routes (/api/inventario).

import { Router } from 'express';
import {
  getExistencias,
  getKardexByProducto,
  registrarMovimientoManual,
  realizarTraslado,
  realizarAjuste,
  configurarNivelesStock,
} from './inventario.controller';
import { listarTomas, obtenerToma, iniciarToma, registrarConteos, aplicarToma, anularToma } from './physical-count';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/existencias', requirePermission('INVENTARIO', 'VER'), getExistencias);
router.get('/kardex/:productId', requirePermission('INVENTARIO', 'VER'), getKardexByProducto);
router.post('/movimiento', requirePermission('INVENTARIO', 'CREAR'), registrarMovimientoManual);
router.post('/traslado', requirePermission('INVENTARIO', 'CREAR'), realizarTraslado);
router.post('/ajuste', requirePermission('INVENTARIO', 'AJUSTE'), realizarAjuste);
router.put('/niveles', requirePermission('INVENTARIO', 'EDITAR'), configurarNivelesStock);

// Physical inventory count (INV-007): counting requires CREAR; applying or voiding requires AJUSTE
router.get('/tomas', requirePermission('INVENTARIO', 'VER'), listarTomas);
router.get('/tomas/:id', requirePermission('INVENTARIO', 'VER'), obtenerToma);
router.post('/tomas', requirePermission('INVENTARIO', 'CREAR'), iniciarToma);
router.put('/tomas/:id/conteos', requirePermission('INVENTARIO', 'CREAR'), registrarConteos);
router.post('/tomas/:id/aplicar', requirePermission('INVENTARIO', 'AJUSTE'), aplicarToma);
router.post('/tomas/:id/anular', requirePermission('INVENTARIO', 'AJUSTE'), anularToma);

export default router;
