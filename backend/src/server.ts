import express from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import { errorHandler } from './middleware/error.middleware';

// Módulos de rutas
import authRoutes from './modules/auth/auth.routes';
import catalogosRoutes from './modules/catalogos/catalogos.routes';
import cajaRoutes from './modules/caja/caja.routes';
import ventasRoutes from './modules/ventas/ventas.routes';
import inventarioRoutes from './modules/inventario/inventario.routes';
import comprasRoutes from './modules/compras/compras.routes';
import pmsRoutes from './modules/pms/pms.routes';
import reportesRoutes from './modules/reportes/reportes.routes';
import auditoriaRoutes from './modules/auditoria/auditoria.routes';

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Endpoint de verificación de estado (Health Check)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    app: 'Sistema POS-ERP Operación Hotelera - Hotel Puerto Limón',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Enrutamiento de la API REST modular
app.use('/api/auth', authRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/pms', pmsRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/auditoria', auditoriaRoutes);

// Manejo centralizado de errores
app.use(errorHandler);

// Iniciar servidor
app.listen(ENV.PORT, () => {
  console.log(`======================================================`);
  console.log(`🚀 SERVIDOR POS-ERP HOTELERO EN EJECUCIÓN`);
  console.log(`📍 URL: http://localhost:${ENV.PORT}`);
  console.log(`🏥 Health Check: http://localhost:${ENV.PORT}/api/health`);
  console.log(`======================================================`);
});

export default app;
