/**
 * Queue Business Logic Service
 * Handles all queue mutations with optimistic locking and idempotency.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  QueueState,
  Token,
  ConsultationHistory,
  AddPatientInput,
  TelemetryEvent,
} from '../types/index.js';
import * as db from './database.js';

// In-memory idempotency cache: eventId -> timestamp
const idempotencyCache = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 2000;

function cleanIdempotencyCache(): void {
  const now = Date.now();
  for (const [key, ts] of idempotencyCache.entries()) {
    if (now - ts > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}

setInterval(cleanIdempotencyCache, 5000);

function logEvent(eventName: string, payload: Record<string, unknown>): TelemetryEvent {
  const event: TelemetryEvent = {
    id: 'evt-' + Math.round(Math.random() * 1_000_000),
    eventName,
    timestamp: new Date().toISOString(),
    payload,
  };
  try {
    db.insertTelemetry(event);
  } catch {
    // Non-critical
  }
  return event;
}

function nowIso(): string {
  return new Date().toISOString();
}

function bumpVersion(state: QueueState): QueueState {
  return {
    ...state,
    version: state.version + 1,
    lastUpdated: nowIso(),
  };
}

// ─── Get State ───

export function getState(): QueueState {
  return db.loadFullState();
}

// ─── Add Patient ───

export function addPatient(input: AddPatientInput, eventId?: string): { state: QueueState; token: Token; event: TelemetryEvent } {
  if (eventId && idempotencyCache.has(eventId)) {
    const state = getState();
    const existing = state.queue.find((t) => t.patientName === input.patientName && t.addedAt > new Date(Date.now() - 5000).toISOString());
    return { state, token: existing ?? state.queue[state.queue.length - 1] ?? state.currentToken!, event: logEvent('patient_added_deduped', { eventId }) };
  }
  if (eventId) idempotencyCache.set(eventId, Date.now());

  let state = getState();

  const trimmedName = input.patientName.trim();
  const activePatientName = trimmedName.length > 0 ? trimmedName : (input.isEmergency ? 'Anonymous Emergency' : 'Anonymous Patient');

  let ticketNumber = input.ticketNumber?.trim().toUpperCase();
  if (ticketNumber) {
    const dup =
      (state.currentToken && state.currentToken.ticketNumber.toUpperCase() === ticketNumber) ||
      state.queue.some((p) => p.ticketNumber.toUpperCase() === ticketNumber);
    if (dup) {
      throw new Error('DUPLICATE_TICKET: This ticket number is already active.');
    }
  } else {
    ticketNumber = generateNextTicketNumber(state, input.isEmergency);
  }

  const newToken: Token = {
    id: 'T' + Math.round(Math.random() * 99999),
    ticketNumber,
    patientName: activePatientName,
    patientPhone: input.patientPhone?.trim() || undefined,
    addedAt: nowIso(),
    status: 'waiting',
    isEmergency: input.isEmergency,
  };

  let updatedQueue: Token[];
  if (input.isEmergency) {
    const firstNonEmgIdx = state.queue.findIndex((item) => !item.isEmergency);
    if (firstNonEmgIdx === -1) {
      updatedQueue = [...state.queue, newToken];
    } else {
      updatedQueue = [...state.queue.slice(0, firstNonEmgIdx), newToken, ...state.queue.slice(firstNonEmgIdx)];
    }
  } else {
    updatedQueue = [...state.queue, newToken];
  }

  state = bumpVersion({
    ...state,
    queue: updatedQueue,
  });

  db.saveFullState(state);

  const event = logEvent('patient_added', {
    tokenId: newToken.id,
    ticketNumber: newToken.ticketNumber,
    currentQueueSize: updatedQueue.length,
    isEmergency: !!input.isEmergency,
  });

  return { state, token: newToken, event };
}

// ─── Call Next ───

export function callNext(eventId?: string): { state: QueueState; calledToken: Token; event: TelemetryEvent } {
  if (eventId && idempotencyCache.has(eventId)) {
    const state = getState();
    return { state, calledToken: state.currentToken!, event: logEvent('call_next_deduped', { eventId }) };
  }
  if (eventId) idempotencyCache.set(eventId, Date.now());

  let state = getState();
  if (state.queue.length === 0) {
    throw new Error('EMPTY_QUEUE: No patients waiting.');
  }

  const nextServing = state.queue[0];
  const remainingQueue = state.queue.slice(1);

  let updatedHistory = [...state.history];
  if (state.currentToken) {
    const durationSecondsNow = Math.round((Date.now() - new Date(state.currentToken.calledAt || '').getTime()) / 1000);
    const entry: ConsultationHistory = {
      tokenId: state.currentToken.id,
      ticketNumber: state.currentToken.ticketNumber,
      durationSeconds: Math.max(12, durationSecondsNow),
      startedAt: state.currentToken.calledAt || nowIso(),
      endedAt: nowIso(),
    };
    updatedHistory.push(entry);
  }

  const currentServingToken: Token = {
    ...nextServing,
    status: 'serving',
    calledAt: nowIso(),
  };

  state = bumpVersion({
    ...state,
    currentToken: currentServingToken,
    queue: remainingQueue,
    history: updatedHistory,
  });

  db.saveFullState(state);

  const event = logEvent('call_next', {
    tokenId: currentServingToken.id,
    ticketNumber: currentServingToken.ticketNumber,
    remainingInQueue: remainingQueue.length,
    version: state.version,
  });

  return { state, calledToken: currentServingToken, event };
}

// ─── Undo Call ───

export function undoCallNext(backup: { currentToken: Token | null; queue: Token[]; history: ConsultationHistory[] }): QueueState {
  let state = getState();
  state = bumpVersion({
    ...state,
    currentToken: backup.currentToken,
    queue: backup.queue,
    history: backup.history,
  });
  db.saveFullState(state);

  logEvent('queue_action_undone', {
    tokenId: state.currentToken?.id,
    restoredQueueLength: backup.queue.length,
  });

  return state;
}

// ─── End Consultation ───

export function endConsultation(eventId?: string): { state: QueueState; event: TelemetryEvent } {
  if (eventId && idempotencyCache.has(eventId)) {
    const state = getState();
    return { state, event: logEvent('end_consultation_deduped', { eventId }) };
  }
  if (eventId) idempotencyCache.set(eventId, Date.now());

  let state = getState();
  if (!state.currentToken) {
    throw new Error('NO_ACTIVE_CONSULTATION: No patient currently being served.');
  }

  const secondsSpent = Math.round((Date.now() - new Date(state.currentToken.calledAt || '').getTime()) / 1000);
  const entry: ConsultationHistory = {
    tokenId: state.currentToken.id,
    ticketNumber: state.currentToken.ticketNumber,
    durationSeconds: Math.max(10, secondsSpent),
    startedAt: state.currentToken.calledAt || nowIso(),
    endedAt: nowIso(),
  };

  const updatedHistory = [...state.history, entry];

  state = bumpVersion({
    ...state,
    currentToken: null,
    history: updatedHistory,
  });

  db.saveFullState(state);

  const event = logEvent('consultation_ended', {
    tokenId: entry.tokenId,
    actualDurationSeconds: entry.durationSeconds,
  });

  return { state, event };
}

// ─── Reorder Queue ───

export function reorderQueue(index: number, direction: 'up' | 'down'): QueueState {
  let state = getState();
  const nextIdx = direction === 'up' ? index - 1 : index + 1;
  if (nextIdx < 0 || nextIdx >= state.queue.length) {
    throw new Error('INVALID_REORDER: Index out of bounds.');
  }

  const updatedQueue = [...state.queue];
  const temp = updatedQueue[index];
  updatedQueue[index] = updatedQueue[nextIdx];
  updatedQueue[nextIdx] = temp;

  state = bumpVersion({
    ...state,
    queue: updatedQueue,
  });

  db.saveFullState(state);

  logEvent('queue_reordered', {
    swappedIdx1: index,
    swappedIdx2: nextIdx,
    queueOrder: updatedQueue.map((p) => p.ticketNumber),
  });

  return state;
}

// ─── Remove / Cancel Patient ───

export function removePatient(tokenId: string): QueueState {
  let state = getState();
  const token = state.queue.find((t) => t.id === tokenId);
  if (!token) {
    throw new Error('NOT_FOUND: Patient not in queue.');
  }

  const updatedQueue = state.queue.filter((t) => t.id !== tokenId);

  // Mark as cancelled in DB but remove from active queue
  const cancelled: Token = { ...token, status: 'cancelled', endedAt: nowIso() };
  db.updateToken(cancelled);

  state = bumpVersion({
    ...state,
    queue: updatedQueue,
  });

  db.saveFullState(state);

  logEvent('patient_cancelled', { tokenId, ticketNumber: token.ticketNumber });

  return state;
}

// ─── Update Config ───

export function updateConfig(manualAvgMinutes: number): QueueState {
  let state = getState();
  state = bumpVersion({
    ...state,
    receptionistConfig: { manualAvgMinutes: Math.max(5, Math.min(60, manualAvgMinutes)) },
  });
  db.saveFullState(state);

  logEvent('avg_time_updated', { sliderValueMinutes: manualAvgMinutes });

  return state;
}

// ─── Reset ───

export function resetQueue(): QueueState {
  const emptyState: QueueState = {
    currentToken: null,
    queue: [],
    history: [],
    receptionistConfig: { manualAvgMinutes: 15 },
    lastUpdated: nowIso(),
    version: 0,
  };
  db.saveFullState(emptyState);
  logEvent('reset_to_empty', { queueCount: 0 });
  return emptyState;
}

export function resetStats(): QueueState {
  let state = getState();
  state = bumpVersion({
    ...state,
    currentToken: null,
    queue: [],
    history: [],
  });
  db.saveFullState(state);
  logEvent('stats_reset', { msg: 'Reset completed queue, token, seen today' });
  return state;
}

// ─── Ticket Number Generator ───

function generateNextTicketNumber(state: QueueState, isEmergency?: boolean): string {
  const allTokens = [
    ...(state.currentToken ? [state.currentToken] : []),
    ...state.queue,
    ...state.history.map((h) => ({ ticketNumber: h.ticketNumber })),
  ];

  if (isEmergency) {
    let maxNum = 100;
    allTokens.forEach((item) => {
      if (item.ticketNumber.startsWith('EMG')) {
        const parsed = parseInt(item.ticketNumber.replace(/^\D+/g, ''), 10);
        if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
      }
    });
    return `EMG${maxNum + 1}`;
  }

  const standardTokens = allTokens.filter((item) => !item.ticketNumber.startsWith('EMG'));
  if (standardTokens.length === 0) return 'A101';

  let prefix = 'A';
  let maxNum = 0;

  standardTokens.forEach((item) => {
    const parsed = parseInt(item.ticketNumber.replace(/^\D+/g, ''), 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
      const matchPrefix = item.ticketNumber.match(/^\D+/);
      if (matchPrefix) prefix = matchPrefix[0];
    }
  });

  return `${prefix}${maxNum + 1}`;
}
