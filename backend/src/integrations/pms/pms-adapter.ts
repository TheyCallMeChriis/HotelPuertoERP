// Contract for the integration with the hotel PMS (PMS-001).
// The POS and the PMS module depend only on this interface; to connect a real PMS
// add another adapter and select it with PMS_ADAPTER, without changing sales or cash code.

export interface CargoPMS {
  transaccionUuid: string; // idempotency key: the PMS must ignore repeated submissions
  habitacion: string;
  huespedId: string;
  monto: string; // decimal as text to avoid precision loss
  saleId?: string | null;
  simularError?: boolean; // only honored by the simulator
}

export interface ReversionPMS {
  transaccionUuid: string;
  motivo: string;
}

export interface RespuestaPMS {
  ok: boolean;
  code: string;
  message: string;
  referenciaExterna?: string | null;
}

export interface PmsAdapter {
  readonly nombre: string;
  readonly endpointCargo: string;
  enviarCargo(cargo: CargoPMS): Promise<RespuestaPMS>;
  revertirCargo(reversion: ReversionPMS): Promise<RespuestaPMS>;
}
