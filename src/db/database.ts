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

    // Initialize schema
    this.initSchema();
  }

  private initSchema(): void {
    // Create all tables
    for (const createTableSQL of ALL_TABLES) {
      this.db.exec(createTableSQL);
    }
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
