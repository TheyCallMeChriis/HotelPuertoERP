import { Router } from 'express';
import { getBitacoraAuditoria } from './auditoria.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

// Solo roles ADMINISTRADOR o AUDITOR pueden consultar la bitácora
router.get('/', requireRole(['ADMINISTRADOR', 'AUDITOR']), getBitacoraAuditoria);

export default router;
