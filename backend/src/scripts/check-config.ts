import { ENV } from '../config/env';
// No imprimir DATABASE_URL, JWT_SECRET ni contraseñas.
console.log(JSON.stringify({ port: ENV.PORT }));
