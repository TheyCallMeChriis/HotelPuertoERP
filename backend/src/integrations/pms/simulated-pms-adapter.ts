// Simulated PMS adapter (PMS-001).

import { CargoPMS, PmsAdapter, RespuestaPMS, ReversionPMS } from './pms-adapter';

// Local PMS simulator (MVP scope). Confirms immediately or, when requested,
// simulates a communication failure to demonstrate the retry queue.
export class SimulatedPmsAdapter implements PmsAdapter {
  readonly nombre = 'simulado';
  readonly endpointCargo = '/api/v1/pms/folio/charge';

  async enviarCargo(cargo: CargoPMS): Promise<RespuestaPMS> {
    if (cargo.simularError) {
      return { ok: false, code: 'PMS_CONN_TIMEOUT', message: 'Tiempo de espera simulado agotado' };
    }
    return { ok: true, code: 'PMS_SUCCESS', message: 'Cargo confirmado en el simulador local', referenciaExterna: `SIM-${cargo.transaccionUuid}` };
  }

  async revertirCargo(reversion: ReversionPMS): Promise<RespuestaPMS> {
    return { ok: true, code: 'PMS_SIMULATED_REVERSAL', message: `Cargo anulado en el simulador local: ${reversion.motivo}` };
  }
}
