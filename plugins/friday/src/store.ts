import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { statePath } from './paths.js';
import type { Mode } from './spec.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process TEXT NOT NULL,
  item TEXT,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  outcome TEXT,
  cost_usd REAL,
  session_id TEXT,
  cwd TEXT,
  summary TEXT
);
CREATE TABLE IF NOT EXISTS handled (
  process TEXT NOT NULL,
  key TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (process, key)
);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process TEXT NOT NULL,
  action TEXT NOT NULL,
  project TEXT,
  mr INTEGER,
  subject TEXT,
  mode TEXT NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process TEXT NOT NULL,
  project TEXT,
  mr INTEGER,
  mr_url TEXT,
  subject TEXT,
  summary TEXT NOT NULL,
  session_id TEXT,
  cwd TEXT,
  mode TEXT NOT NULL,
  raised_at TEXT NOT NULL,
  settled_at TEXT,
  settled_reason TEXT
);
CREATE TABLE IF NOT EXISTS modes (
  process TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  process TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS steps (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  at TEXT NOT NULL
);
`;

export interface Escalation {
  id: number;
  process: string;
  project: string | null;
  mr: number | null;
  mr_url: string | null;
  subject: string | null;
  summary: string;
  session_id: string | null;
  cwd: string | null;
  mode: Mode;
  raised_at: string;
  settled_at: string | null;
  settled_reason: string | null;
  /** 1 when the needs-mike label was applied to the MR. */
  labeled?: number;
}

export interface RunRow {
  id: number;
  process: string;
  item: string | null;
  mode: string;
  started_at: string;
  ended_at: string | null;
  outcome: string | null;
  cost_usd: number | null;
  session_id: string | null;
  cwd: string | null;
  summary: string | null;
}

const now = () => new Date().toISOString();

export class Store {
  readonly db: Database.Database;

  constructor(file = statePath()) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);
    const cols = (this.db.prepare('PRAGMA table_info(escalations)').all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes('labeled')) this.db.exec('ALTER TABLE escalations ADD COLUMN labeled INTEGER NOT NULL DEFAULT 0');
  }

  close() {
    this.db.close();
  }

  // --- modes -------------------------------------------------------------
  mode(process: string, fallback: Mode): Mode {
    const r = this.db.prepare('SELECT mode FROM modes WHERE process = ?').get(process) as { mode: Mode } | undefined;
    return r?.mode ?? fallback;
  }
  setMode(process: string, mode: Mode) {
    this.db.prepare('INSERT OR REPLACE INTO modes (process, mode, at) VALUES (?, ?, ?)').run(process, mode, now());
  }

  // --- schedules ---------------------------------------------------------
  scheduleState(process: string): string | null {
    const r = this.db.prepare('SELECT state FROM schedules WHERE process = ?').get(process) as { state: string } | undefined;
    return r?.state ?? null;
  }
  setScheduleState(process: string, state: 'active' | 'paused' | null) {
    if (state === null) this.db.prepare('DELETE FROM schedules WHERE process = ?').run(process);
    else this.db.prepare('INSERT OR REPLACE INTO schedules (process, state, at) VALUES (?, ?, ?)').run(process, state, now());
  }

  // --- runs --------------------------------------------------------------
  startRun(process: string, item: string | null, mode: Mode): number {
    return Number(
      this.db
        .prepare('INSERT INTO runs (process, item, mode, started_at) VALUES (?, ?, ?, ?)')
        .run(process, item, mode, now()).lastInsertRowid
    );
  }
  endRun(id: number, r: { outcome: string; cost?: number; sessionId?: string; cwd?: string; summary?: string }) {
    this.db
      .prepare('UPDATE runs SET ended_at = ?, outcome = ?, cost_usd = ?, session_id = ?, cwd = ?, summary = ? WHERE id = ?')
      .run(now(), r.outcome, r.cost ?? null, r.sessionId ?? null, r.cwd ?? null, r.summary ?? null, id);
  }
  recentRuns(process: string, limit = 5): RunRow[] {
    return this.db
      .prepare('SELECT * FROM runs WHERE process = ? ORDER BY id DESC LIMIT ?')
      .all(process, limit) as RunRow[];
  }
  costSince(process: string, sinceIso: string): number {
    const r = this.db
      .prepare('SELECT COALESCE(SUM(cost_usd), 0) AS c FROM runs WHERE process = ? AND started_at >= ?')
      .get(process, sinceIso) as { c: number };
    return r.c;
  }

  // --- handled -----------------------------------------------------------
  isHandled(process: string, key: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM handled WHERE process = ? AND key = ?').get(process, key);
  }
  markHandled(process: string, key: string) {
    this.db.prepare('INSERT OR REPLACE INTO handled (process, key, at) VALUES (?, ?, ?)').run(process, key, now());
  }

  // --- actions -----------------------------------------------------------
  recordAction(a: {
    process: string; action: string; project?: string; mr?: number; subject?: string;
    mode: Mode; ok: boolean; detail?: string;
  }) {
    this.db
      .prepare('INSERT INTO actions (process, action, project, mr, subject, mode, ok, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.process, a.action, a.project ?? null, a.mr ?? null, a.subject ?? null, a.mode, a.ok ? 1 : 0, a.detail ?? null, now());
  }
  /** Counts successful actions. Pass `mode` so dry-run records never use up live limits. */
  countActions(f: { process: string; action: string; subjectLike?: string; project?: string; mr?: number; sinceIso?: string; mode?: Mode; ok?: boolean }): number {
    let sql = 'SELECT COUNT(*) AS n FROM actions WHERE process = ? AND action = ? AND ok = ?';
    const args: unknown[] = [f.process, f.action, f.ok === false ? 0 : 1];
    if (f.mode !== undefined) { sql += ' AND mode = ?'; args.push(f.mode); }
    if (f.subjectLike !== undefined) { sql += ' AND subject LIKE ?'; args.push(f.subjectLike); }
    if (f.project !== undefined) { sql += ' AND project = ?'; args.push(f.project); }
    if (f.mr !== undefined) { sql += ' AND mr = ?'; args.push(f.mr); }
    if (f.sinceIso !== undefined) { sql += ' AND at >= ?'; args.push(f.sinceIso); }
    return (this.db.prepare(sql).get(...args) as { n: number }).n;
  }
  actionsSince(process: string, sinceIso: string): { action: string; mode: string; n: number }[] {
    return this.db
      .prepare('SELECT action, mode, COUNT(*) AS n FROM actions WHERE process = ? AND at >= ? AND ok = 1 GROUP BY action, mode ORDER BY action')
      .all(process, sinceIso) as { action: string; mode: string; n: number }[];
  }
  recentActions(process: string, limit = 20) {
    return this.db
      .prepare('SELECT * FROM actions WHERE process = ? ORDER BY id DESC LIMIT ?')
      .all(process, limit) as { action: string; project: string | null; mr: number | null; subject: string | null; mode: string; ok: number; detail: string | null; at: string }[];
  }

  // --- escalations -------------------------------------------------------
  markLabeled(id: number) {
    this.db.prepare('UPDATE escalations SET labeled = 1 WHERE id = ?').run(id);
  }
  raise(e: Omit<Escalation, 'id' | 'raised_at' | 'settled_at' | 'settled_reason' | 'labeled'>): number {
    return Number(
      this.db
        .prepare('INSERT INTO escalations (process, project, mr, mr_url, subject, summary, session_id, cwd, mode, raised_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(e.process, e.project, e.mr, e.mr_url, e.subject, e.summary, e.session_id, e.cwd, e.mode, now()).lastInsertRowid
    );
  }
  openEscalations(): Escalation[] {
    return this.db.prepare('SELECT * FROM escalations WHERE settled_at IS NULL ORDER BY raised_at').all() as Escalation[];
  }
  escalation(id: number): Escalation | undefined {
    return this.db.prepare('SELECT * FROM escalations WHERE id = ?').get(id) as Escalation | undefined;
  }
  openFor(f: { process?: string; project?: string; mr?: number; subject?: string; cwd?: string }): Escalation[] {
    let sql = 'SELECT * FROM escalations WHERE settled_at IS NULL';
    const args: unknown[] = [];
    for (const [col, v] of Object.entries(f)) {
      if (v === undefined) continue;
      sql += ` AND ${col} = ?`;
      args.push(v);
    }
    return this.db.prepare(sql).all(...args) as Escalation[];
  }
  settle(id: number, reason: string) {
    this.db.prepare('UPDATE escalations SET settled_at = ?, settled_reason = ? WHERE id = ? AND settled_at IS NULL').run(now(), reason, id);
  }

  // --- steps (resumable multi-step actions) ------------------------------
  step(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM steps WHERE key = ?').get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }
  setStep(key: string, value: string | null) {
    if (value === null) this.db.prepare('DELETE FROM steps WHERE key = ?').run(key);
    else this.db.prepare('INSERT OR REPLACE INTO steps (key, value, at) VALUES (?, ?, ?)').run(key, value, now());
  }
}
