// Administration routes (/api/admin).

import { Router } from 'express';
import { getParametros, updateParametro } from './parametros.controller';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import {
  getUsuarios, createUsuario, updateUsuario, resetPassword,
  getRoles, getPermisos, createRol, updateRol, setPermisosRol,
} from './admin.controller';

const router = Router();
router.use(authenticateToken);

// Users (GEN-002)
router.get('/usuarios', requirePermission('SEGURIDAD', 'VER'), getUsuarios);
router.post('/usuarios', requirePermission('SEGURIDAD', 'CREAR'), createUsuario);
router.put('/usuarios/:id', requirePermission('SEGURIDAD', 'EDITAR'), updateUsuario);
router.put('/usuarios/:id/password', requirePermission('SEGURIDAD', 'EDITAR'), resetPassword);

// Roles and permissions (GEN-003)
router.get('/roles', requirePermission('SEGURIDAD', 'VER'), getRoles);
router.post('/roles', requirePermission('SEGURIDAD', 'CREAR'), createRol);
router.put('/roles/:id', requirePermission('SEGURIDAD', 'EDITAR'), updateRol);
router.put('/roles/:id/permisos', requirePermission('SEGURIDAD', 'EDITAR'), setPermisosRol);
router.get('/permisos', requirePermission('SEGURIDAD', 'VER'), getPermisos);

// Business parameters (costing method)
router.get('/parametros', requirePermission('SEGURIDAD', 'VER'), getParametros);
router.put('/parametros/:clave', requirePermission('SEGURIDAD', 'EDITAR'), updateParametro);

export default router;
