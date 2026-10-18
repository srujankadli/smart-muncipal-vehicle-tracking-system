export type FreshnessStatus = 'CURRENT' | 'STALE' | 'UNAVAILABLE';
export type ShiftStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type DeviceCredentialStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type TelemetryValidationStatus =
  | 'ACCEPTED'
  | 'REJECTED_OUT_OF_BOUNDS'
  | 'REJECTED_FUTURE_TIMESTAMP'
  | 'REJECTED_OUT_OF_ORDER'
  | 'REJECTED_SPEED_SPIKE';

export interface TelemetryIngestPayload {
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  heading_degrees?: number;
  recorded_at: string;
  vehicle_id?: string;
}

export interface AuthenticatedDevice {
  id: string;
  tenantId: string;
  vehicleId: string;
  deviceSerial: string;
  keyPrefix: string;
  status: DeviceCredentialStatus;
  isDemo: boolean;
}

export interface CitizenTrackingSnapshot {
  vehicle_id: string;
  vehicle_label: string;
  registration_number: string;
  locality_id: string;
  locality_name: string;
  ward_number?: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading_degrees: number;
  freshness: FreshnessStatus;
  elapsed_seconds: number;
  last_recorded_at: string;
  shift_status: ShiftStatus;
  is_demo: boolean;
  simulation_notice?: string;
}
