// Purchasing routes (/api/compras).

import { Router } from 'express';
import {
  createOrdenCompra,
  getOrdenesCompra,
  registrarRecepcion, getSolicitudes, postSolicitud, postRevisionSolicitud, postCancelarSolicitud, postConvertirSolicitud } from './compras.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post('/ordenes', requirePermission('COMPRAS', 'CREAR'), createOrdenCompra);
router.get('/ordenes', requirePermission('COMPRAS', 'VER'), getOrdenesCompra);
router.post('/recepciones', requirePermission('COMPRAS', 'EDITAR'), registrarRecepcion);

// Internal requests (COM-002/003): permissions are validated inside each operation
router.get('/solicitudes', getSolicitudes);
router.post('/solicitudes', postSolicitud);
router.post('/solicitudes/:id/revision', postRevisionSolicitud);
router.post('/solicitudes/:id/cancelar', postCancelarSolicitud);
router.post('/solicitudes/:id/convertir', postConvertirSolicitud);

export default router;
