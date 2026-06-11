/**
 * Shared TypeScript types for Clinic Queue Manager backend.
 * Mirrors the frontend types for seamless serialization.
 */

export interface Token {
  id: string;
  ticketNumber: string;
  patientName: string;
  patientPhone?: string | null;
  addedAt: string;
  status: 'waiting' | 'called' | 'serving' | 'served' | 'cancelled';
  calledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  isEmergency?: boolean;
}

export interface ConsultationHistory {
  tokenId: string;
  ticketNumber: string;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
}

export interface ReceptionistConfig {
  manualAvgMinutes: number;
}

export interface QueueState {
  currentToken: Token | null;
  queue: Token[];
  history: ConsultationHistory[];
  receptionistConfig: ReceptionistConfig;
  lastUpdated: string;
  version: number;
}

export interface TelemetryEvent {
  id: string;
  eventName: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface AddPatientInput {
  patientName: string;
  patientPhone?: string;
  ticketNumber?: string;
  isEmergency?: boolean;
}

export interface UpdateConfigInput {
  manualAvgMinutes: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  version?: number;
  lastUpdated?: string;
}
