import { Router } from 'express';
import {
  createOrdenCompra,
  getOrdenesCompra,
  registrarRecepcion,
} from './compras.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.post('/ordenes', requirePermission('COMPRAS', 'CREAR'), createOrdenCompra);
router.get('/ordenes', requirePermission('COMPRAS', 'VER'), getOrdenesCompra);
router.post('/recepciones', requirePermission('COMPRAS', 'EDITAR'), registrarRecepcion);

export default router;
