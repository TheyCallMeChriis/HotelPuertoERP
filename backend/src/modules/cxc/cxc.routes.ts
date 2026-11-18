// Accounts receivable routes (/api/cxc).

import { Router } from 'express';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { getAntiguedadSaldos, getCuentasClientes, getEstadoCuenta, postAbono, postAnularAbono } from './cxc.controller';

// Accounts receivable (CLI-005, CLI-006)
const router = Router();
router.use(authenticateToken);

router.get('/clientes', requirePermission('CLIENTES', 'VER'), getCuentasClientes);
router.get('/clientes/:id/estado-cuenta', requirePermission('CLIENTES', 'VER'), getEstadoCuenta);
router.get('/antiguedad', requirePermission('CLIENTES', 'VER'), getAntiguedadSaldos);
router.post('/abonos', requirePermission('CLIENTES', 'CREAR'), postAbono);
// The CLIENTES:ANULAR permission is validated inside the operation
router.post('/abonos/:id/anular', postAnularAbono);

export default router;
