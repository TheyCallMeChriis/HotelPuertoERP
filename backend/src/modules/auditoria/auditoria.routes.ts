// Audit log routes (/api/auditoria).

import { Router } from 'express';
import { getBitacoraAuditoria } from './auditoria.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

// Only ADMINISTRADOR or AUDITOR roles may read the audit log
router.get('/', requireRole(['ADMINISTRADOR', 'AUDITOR']), getBitacoraAuditoria);

export default router;
