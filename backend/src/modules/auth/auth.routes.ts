// Authentication routes. Login and initial setup are public; the rest require a valid token.
import { Router } from 'express';
import { login, getMe, logout, cambiarPassword } from './auth.controller';
import { authenticateToken } from '../../middleware/auth.middleware';
import { getSetupStatus, registrarAdministradorInicial } from './setup.controller';

const router = Router();

router.post('/login', login);
router.get('/setup', getSetupStatus);
router.post('/setup', registrarAdministradorInicial);
router.get('/me', authenticateToken, getMe);
router.post('/logout', authenticateToken, logout);
router.put('/password', authenticateToken, cambiarPassword);

export default router;
