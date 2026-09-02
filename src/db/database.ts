/**
 * Database connection and initialization
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { ALL_TABLES } from './schema.js';

export class MapsDatabase {
  private db: Database.Database;

  constructor(projectPath: string) {
    const mapsDir = path.join(projectPath, '.maps');
    const dbPath = path.join(mapsDir, 'maps.db');

    // Ensure .maps directory exists
    if (!fs.existsSync(mapsDir)) {
      fs.mkdirSync(mapsDir, { recursive: true });
    }

    // Open/create database
    this.db = new Database(dbPath);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Enable WAL mode for concurrent access safety
    this.db.pragma('journal_mode = WAL');

    // Initialize schema
    this.initSchema();
    this.runMigrations();
  }

  private initSchema(): void {
    // Create all tables
    for (const createTableSQL of ALL_TABLES) {
      this.db.exec(createTableSQL);
    }
  }

  // Idempotent, additive migrations for databases created before a column existed.
  // CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
  private runMigrations(): void {
    const columns = this.db
      .prepare('PRAGMA table_info(tasks)')
      .all() as { name: string }[];

    // mr-maps: nullable Shortcut story link on plan tasks. NULL in stock /maps.
    if (!columns.some((c) => c.name === 'shortcut_story_id')) {
      this.db.exec('ALTER TABLE tasks ADD COLUMN shortcut_story_id INTEGER');
    }
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
