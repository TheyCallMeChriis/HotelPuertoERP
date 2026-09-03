# Manual de Instalación y Despliegue: Sistema POS-ERP Hotel Puerto Limón

Este manual documenta el procedimiento paso a paso para desplegar el sistema completo en un ambiente limpio de pruebas o producción (RNF-009, Entregable 08).

---

## 1. Prerrequisitos del Sistema
* **Sistema Operativo:** Windows 10/11, Linux o macOS.
* **Node.js:** Versión 18+ o superior (probado en v24.19.0 LTS).
* **Base de Datos:** PostgreSQL 16 (local o contenedor Docker).
* **Navegador Web:** Google Chrome, Microsoft Edge, Firefox o Safari actualizados.

---

## 2. Configuración de Variables de Entorno (.env)
En la carpeta `backend/` crear el archivo `.env` basado en `.env.example`:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL="postgresql://pos_admin:pos_password_2026@localhost:5432/pos_erp_hotel?schema=public"
JWT_SECRET="pos_erp_hotel_jwt_secret_key_2026_secure_random"
JWT_EXPIRES_IN="8h"
```

> [!NOTE]
> En entornos de producción, el secreto JWT y las credenciales de base de datos deben configurarse con valores aleatorios robustos fuera del control de versiones (SEG-007).

---

## 3. Instalación de Dependencias

### Backend:
```bash
cd backend
npm install
```

### Frontend:
```bash
cd frontend
npm install
```

---

## 4. Inicialización de Base de Datos y Sembrado Inicial

1. **Generar el Cliente Prisma:**
   ```bash
   cd backend
   npm run prisma:generate
   ```

2. **Aplicar Migraciones / Estructura del Modelo:**
   ```bash
   npm run prisma:push
   ```

3. **Cargar Datos Iniciales (Seed Obligatorio):**
   ```bash
   npm run prisma:seed
   ```

Este comando poblará automáticamente:
* Los 7 roles requeridos por el sistema (`ADMINISTRADOR`, `CAJERO`, `RESTAURANTE_BAR`, `BODEGA`, `PROVEEDURIA`, `CONTABILIDAD`, `AUDITOR`).
* Los permisos RBAC granulares por módulo y acción.
* Las 5 formas de pago oficiales: Efectivo, Tarjeta, SINPE Móvil, Crédito, Cargo a Habitación.
* Las bodegas principales: Bodega Central y Bodega Bar/Restaurante.
* Las cajas y puntos de venta asociados.
* El catálogo de productos inicial con existencias en stock.
* Las habitaciones y huéspedes para la simulación del PMS.
* Los usuarios iniciales con contraseñas seguras cifradas con bcrypt.

---

## 5. Puesta en Marcha en Desarrollo

### Iniciar el Backend (Puerto 4000):
```bash
cd backend
npm run dev
```

### Iniciar el Frontend (Puerto 3000):
```bash
cd frontend
npm run dev
```

Abra el navegador en: **`http://localhost:3000`**

---

## 6. Procedimiento de Respaldo y Restauración de Base de Datos (SEG-008)

### Generación de Copia de Seguridad (Backup):
```powershell
pg_dump -U pos_admin -d pos_erp_hotel -F c -f "respaldo_pos_erp_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"
```

### Restauración de Respaldo:
```powershell
pg_restore -U pos_admin -d pos_erp_hotel -c -v "nombre_del_respaldo.dump"
```
Este procedimiento garantiza la recuperación completa de transacciones, existencias en Kardex y bitácoras de auditoría en ambientes limpios.
