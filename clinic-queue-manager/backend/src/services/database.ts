/**
 * SQLite Database Service
 * Handles persistence of queue state, patients, history, and telemetry.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { QueueState, Token, ConsultationHistory, TelemetryEvent } from '../types/index.js';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'clinic_queue.db');

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Tokens / Queue table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL UNIQUE,
      patient_name TEXT NOT NULL,
      patient_phone TEXT,
      added_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      called_at TEXT,
      started_at TEXT,
      ended_at TEXT,
      is_emergency INTEGER DEFAULT 0
    );
  `);

  // History table
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      token_id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL
    );
  `);

  // Config table (single row)
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Telemetry events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);

  // Seed default config if missing
  const configStmt = db.prepare("SELECT value FROM config WHERE key = 'manualAvgMinutes'");
  const existing = configStmt.get() as { value: string } | undefined;
  if (!existing) {
    const defaultMinutes = process.env.DEFAULT_AVG_MINUTES || '15';
    db.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run('manualAvgMinutes', defaultMinutes);
    db.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run('version', '0');
    db.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run('lastUpdated', new Date().toISOString());
  }

  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Token CRUD ───

export function getAllTokens(): Token[] {
  const rows = getDb().prepare('SELECT * FROM tokens ORDER BY added_at ASC').all() as any[];
  return rows.map(rowToToken);
}

export function getTokenById(id: string): Token | undefined {
  const row = getDb().prepare('SELECT * FROM tokens WHERE id = ?').get(id) as any | undefined;
  return row ? rowToToken(row) : undefined;
}

export function getTokenByTicketNumber(ticketNumber: string): Token | undefined {
  const row = getDb().prepare('SELECT * FROM tokens WHERE ticket_number = ?').get(ticketNumber) as any | undefined;
  return row ? rowToToken(row) : undefined;
}

export function insertToken(token: Token): void {
  getDb().prepare(`
    INSERT INTO tokens (id, ticket_number, patient_name, patient_phone, added_at, status, called_at, started_at, ended_at, is_emergency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token.id,
    token.ticketNumber,
    token.patientName,
    token.patientPhone ?? null,
    token.addedAt,
    token.status,
    token.calledAt ?? null,
    token.startedAt ?? null,
    token.endedAt ?? null,
    token.isEmergency ? 1 : 0
  );
}

export function updateToken(token: Token): void {
  getDb().prepare(`
    UPDATE tokens SET
      ticket_number = ?,
      patient_name = ?,
      patient_phone = ?,
      added_at = ?,
      status = ?,
      called_at = ?,
      started_at = ?,
      ended_at = ?,
      is_emergency = ?
    WHERE id = ?
  `).run(
    token.ticketNumber,
    token.patientName,
    token.patientPhone ?? null,
    token.addedAt,
    token.status,
    token.calledAt ?? null,
    token.startedAt ?? null,
    token.endedAt ?? null,
    token.isEmergency ? 1 : 0,
    token.id
  );
}

export function deleteToken(id: string): void {
  getDb().prepare('DELETE FROM tokens WHERE id = ?').run(id);
}

export function clearAllTokens(): void {
  getDb().prepare('DELETE FROM tokens').run();
}

// ─── History CRUD ───

export function getAllHistory(): ConsultationHistory[] {
  const rows = getDb().prepare('SELECT * FROM history ORDER BY ended_at DESC').all() as any[];
  return rows.map(rowToHistory);
}

export function insertHistory(entry: ConsultationHistory): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO history (token_id, ticket_number, duration_seconds, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.tokenId, entry.ticketNumber, entry.durationSeconds, entry.startedAt, entry.endedAt);
}

export function clearAllHistory(): void {
  getDb().prepare('DELETE FROM history').run();
}

// ─── Config ───

export function getConfig(): { manualAvgMinutes: number; version: number; lastUpdated: string } {
  const db = getDb();
  const getVal = (key: string, fallback: string) => {
    const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? fallback;
  };

  return {
    manualAvgMinutes: parseInt(getVal('manualAvgMinutes', '15'), 10),
    version: parseInt(getVal('version', '0'), 10),
    lastUpdated: getVal('lastUpdated', new Date().toISOString()),
  };
}

export function setConfig(updates: Partial<{ manualAvgMinutes: number; version: number; lastUpdated: string }>): void {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  if (updates.manualAvgMinutes !== undefined) stmt.run('manualAvgMinutes', String(updates.manualAvgMinutes));
  if (updates.version !== undefined) stmt.run('version', String(updates.version));
  if (updates.lastUpdated !== undefined) stmt.run('lastUpdated', updates.lastUpdated);
}

// ─── Telemetry ───

export function insertTelemetry(event: TelemetryEvent): void {
  getDb().prepare(`
    INSERT INTO telemetry (id, event_name, timestamp, payload)
    VALUES (?, ?, ?, ?)
  `).run(event.id, event.eventName, event.timestamp, JSON.stringify(event.payload));
}

export function getTelemetry(limit = 100): TelemetryEvent[] {
  const rows = getDb()
    .prepare('SELECT * FROM telemetry ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    eventName: r.event_name,
    timestamp: r.timestamp,
    payload: JSON.parse(r.payload),
  }));
}

// ─── Full State ───

export function loadFullState(): QueueState {
  const tokens = getAllTokens();
  const currentToken = tokens.find((t) => t.status === 'serving') ?? null;
  const queue = tokens.filter((t) => t.status === 'waiting' || t.status === 'called');
  const history = getAllHistory();
  const cfg = getConfig();

  return {
    currentToken,
    queue,
    history,
    receptionistConfig: { manualAvgMinutes: cfg.manualAvgMinutes },
    lastUpdated: cfg.lastUpdated,
    version: cfg.version,
  };
}

export function saveFullState(state: QueueState): void {
  const db = getDb();
  db.transaction(() => {
    // Clear and re-insert tokens
    db.prepare('DELETE FROM tokens').run();
    const insert = db.prepare(`
      INSERT INTO tokens (id, ticket_number, patient_name, patient_phone, added_at, status, called_at, started_at, ended_at, is_emergency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const allTokens: Token[] = [
      ...(state.currentToken ? [state.currentToken] : []),
      ...state.queue,
    ];
    for (const t of allTokens) {
      insert.run(t.id, t.ticketNumber, t.patientName, t.patientPhone ?? null, t.addedAt, t.status, t.calledAt ?? null, t.startedAt ?? null, t.endedAt ?? null, t.isEmergency ? 1 : 0);
    }

    // Clear and re-insert history
    db.prepare('DELETE FROM history').run();
    const insertHist = db.prepare(`
      INSERT INTO history (token_id, ticket_number, duration_seconds, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const h of state.history) {
      insertHist.run(h.tokenId, h.ticketNumber, h.durationSeconds, h.startedAt, h.endedAt);
    }

    // Update config
    setConfig({
      manualAvgMinutes: state.receptionistConfig.manualAvgMinutes,
      version: state.version,
      lastUpdated: state.lastUpdated,
    });
  })();
}

// ─── Helpers ───

function rowToToken(row: any): Token {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    patientName: row.patient_name,
    patientPhone: row.patient_phone ?? undefined,
    addedAt: row.added_at,
    status: row.status,
    calledAt: row.called_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    isEmergency: !!row.is_emergency,
  };
}

function rowToHistory(row: any): ConsultationHistory {
  return {
    tokenId: row.token_id,
    ticketNumber: row.ticket_number,
    durationSeconds: row.duration_seconds,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}
