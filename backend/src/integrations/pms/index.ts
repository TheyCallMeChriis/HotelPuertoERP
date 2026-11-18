// PMS adapter registry and selection (PMS-001).

import { PmsAdapter } from './pms-adapter';
import { SimulatedPmsAdapter } from './simulated-pms-adapter';

export * from './pms-adapter';

// Registry of available adapters. For a real PMS: implement PmsAdapter and register it here.
const ADAPTADORES: Record<string, () => PmsAdapter> = {
  simulado: () => new SimulatedPmsAdapter(),
};

let actual: PmsAdapter | null = null;

// Returns the adapter selected by PMS_ADAPTER (created once and then reused).
export function getPmsAdapter(): PmsAdapter {
  if (actual) return actual;
  const nombre = (process.env.PMS_ADAPTER || 'simulado').trim().toLowerCase();
  const crear = ADAPTADORES[nombre];
  if (!crear) throw new Error(`PMS_ADAPTER "${nombre}" no existe. Disponibles: ${Object.keys(ADAPTADORES).join(', ')}`);
  actual = crear();
  return actual;
}

