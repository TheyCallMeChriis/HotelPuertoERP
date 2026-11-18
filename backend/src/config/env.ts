// Loads backend/.env and exposes the validated configuration. The server refuses to start
// with missing or insecure settings (RNF-008, SEG-007).
import dotenv from 'dotenv';
import path from 'path';
import { validateEnvironment } from './validate-env';
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

export const ENV = validateEnvironment(process.env);
