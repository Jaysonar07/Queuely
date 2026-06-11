/**
 * API Client for Backend Communication
 * Provides optional backend sync with automatic fallback to localStorage.
 */

import { QueueState, Token, ConsultationHistory } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

let socket: any = null;
let onStateUpdate: ((state: QueueState) => void) | null = null;

export function isBackendEnabled(): boolean {
  return USE_BACKEND;
}

export function getApiUrl(): string {
  return API_URL;
}

// ─── Socket.IO Connection ───

export async function connectSocket(handler: (state: QueueState) => void): Promise<boolean> {
  if (!USE_BACKEND) return false;
  onStateUpdate = handler;

  try {
    const { io } = await import('socket.io-client');
    socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to backend');
    });

    socket.on('state_sync', (msg: any) => {
      if (msg?.state && onStateUpdate) {
        onStateUpdate(msg.state as QueueState);
      }
    });

    socket.on('disconnect', (reason: string) => {
      console.warn('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err: Error) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    return true;
  } catch (err) {
    console.warn('[Socket] Failed to load socket.io-client:', err);
    return false;
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ─── REST API Helpers ───

async function api<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
  const url = `${API_URL}/api${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Queue Actions ───

export async function fetchState(): Promise<QueueState> {
  const res = await api<{ success: boolean; data: QueueState }>('GET', '/queue/state');
  return res.data;
}

export async function addPatientApi(
  patientName: string,
  patientPhone?: string,
  ticketNumber?: string,
  isEmergency?: boolean,
  eventId?: string
): Promise<{ token: Token; state: QueueState }> {
  const res = await api<{ success: boolean; data: { token: Token; state: QueueState } }>('POST', '/queue/patient', {
    patientName,
    patientPhone,
    ticketNumber,
    isEmergency,
    eventId,
  });
  return res.data;
}

export async function callNextApi(eventId?: string): Promise<{ calledToken: Token; state: QueueState }> {
  const res = await api<{ success: boolean; data: { calledToken: Token; state: QueueState } }>('POST', '/queue/call-next', {
    eventId,
  });
  return res.data;
}

export async function undoCallApi(backup: {
  currentToken: Token | null;
  queue: Token[];
  history: ConsultationHistory[];
}): Promise<QueueState> {
  const res = await api<{ success: boolean; data: QueueState }>('POST', '/queue/undo', { backup });
  return res.data;
}

export async function endConsultationApi(eventId?: string): Promise<QueueState> {
  const res = await api<{ success: boolean; data: QueueState }>('POST', '/queue/end-consultation', { eventId });
  return res.data;
}

export async function reorderQueueApi(index: number, direction: 'up' | 'down'): Promise<QueueState> {
  const res = await api<{ success: boolean; data: QueueState }>('POST', '/queue/reorder', { index, direction });
  return res.data;
}

export async function removePatientApi(tokenId: string): Promise<QueueState> {
  const res = await api<{ success: boolean; data: QueueState }>('DELETE', `/queue/patient/${tokenId}`);
  return res.data;
}

export async function updateConfigApi(manualAvgMinutes: number): Promise<QueueState> {
  const res = await api<{ success: boolean; data: QueueState }>('PUT', '/queue/config', { manualAvgMinutes });
  return res.data;
}

export async function resetQueueApi(): Promise<QueueState> {
  const res = await api<{ success: boolean; data: QueueState }>('POST', '/queue/reset');
  return res.data;
}

export async function resetStatsApi(): Promise<QueueState> {
  const res = await api<{ success: boolean; data: QueueState }>('POST', '/queue/reset-stats');
  return res.data;
}
