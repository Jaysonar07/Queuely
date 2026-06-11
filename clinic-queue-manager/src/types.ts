/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Token {
  id: string;          // Format: T1001, T1002, etc.
  ticketNumber: string; // Printable display token string, e.g. "A101"
  patientName: string; // Plaintext for Screen A
  patientPhone?: string; // Optional phone number, masked in UI
  addedAt: string;     // ISO timestamp
  status: 'waiting' | 'called' | 'serving' | 'served' | 'cancelled';
  calledAt?: string;   // ISO timestamp
  startedAt?: string;  // ISO timestamp
  endedAt?: string;    // ISO timestamp
  isEmergency?: boolean; // Flag to indicate a high-priority emergency patient
}

export interface ConsultationHistory {
  tokenId: string;
  ticketNumber: string;
  durationSeconds: number; // endAt - startAt in seconds
  startedAt: string;
  endedAt: string;
}

export interface QueueState {
  currentToken: Token | null;
  queue: Token[];
  history: ConsultationHistory[];
  receptionistConfig: {
    manualAvgMinutes: number; // Configurable override average (5-60)
  };
  lastUpdated: string; // ISO timestamp
  version: number;     // Concurrency control sequence ID
}

export interface TelemetryEvent {
  id: string;
  eventName: string;
  timestamp: string;
  payload: Record<string, any>;
}

export interface RealtimeMessage {
  type: 'sync' | 'call_next' | 'add_patient' | 'end_consultation' | 'undo_called' | 'force_reconcile';
  state: QueueState;
  senderId: string;
  timestamp: string;
  seqId: number;
}
