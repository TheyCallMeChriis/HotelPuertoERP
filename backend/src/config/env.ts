import dotenv from 'dotenv';
import path from 'path';
import { validateEnvironment } from './validate-env';
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

export const ENV = validateEnvironment(process.env);
