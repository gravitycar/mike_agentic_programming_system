/**
 * Connection and initialization for the shared, cross-project telemetry database.
 * Separate physical file from each project's MapsDatabase — see telemetry-schema.ts.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ALL_TELEMETRY_TABLES } from './telemetry-schema.js';

export class TelemetryDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(os.homedir(), '.maps', 'telemetry.db');
    const dir = path.dirname(resolvedPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');

    this.initSchema();
    this.runMigrations();
  }

  private initSchema(): void {
    for (const sql of ALL_TELEMETRY_TABLES) {
      this.db.exec(sql);
    }
  }

  // No additive columns yet. Follow MapsDatabase's PRAGMA table_info pattern
  // here if/when one is needed.
  private runMigrations(): void {}

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
