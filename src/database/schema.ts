/**
 * SQLite database schema for PlexDownloader
 * Implements the persistent local database as described in Section 3.3
 * This database is the absolute source of truth for downloaded content
 */

import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
const CURRENT_DB_VERSION = 3; // Bump version for resume_data column

/**
 * Initialize the database, create tables, and run migrations.
 */
export async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) {
    return db;
  }

  db = await SQLite.openDatabaseAsync('plexdownloader.db');

  await db.execAsync('PRAGMA foreign_keys = ON;');
  await runMigrations(db);
  await createTables(db);
  
  console.log('Database initialized successfully');
  return db;
}

/**
 * Creates all tables if they don't already exist.
 */
async function createTables(db: SQLite.SQLiteDatabase) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_rating_key TEXT NOT NULL,
        server_identifier TEXT NOT NULL,
        local_file_path TEXT NOT NULL,
        cached_metadata_json TEXT NOT NULL,
        local_thumbnail_path TEXT,
        download_status TEXT NOT NULL CHECK(download_status IN ('pending', 'downloading', 'paused', 'completed', 'failed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        file_size INTEGER,
        downloaded_bytes INTEGER DEFAULT 0,
        error_message TEXT,
        quality_profile TEXT,
        resume_data TEXT,
        UNIQUE(media_rating_key, server_identifier)
      );
    `);
    
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(download_status);`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS servers (
      server_identifier TEXT PRIMARY KEY, name TEXT NOT NULL, access_token TEXT NOT NULL,
      base_url TEXT NOT NULL, owned INTEGER NOT NULL DEFAULT 0, last_connected INTEGER,
      cached_metadata_json TEXT
    );`);
    await db.execAsync(`CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT);`);
}

/**
 * Manages database schema migrations.
 */
async function runMigrations(db: SQLite.SQLiteDatabase) {
  await db.execAsync('CREATE TABLE IF NOT EXISTS db_version (version INTEGER NOT NULL);');
  
  let currentVersionResult = await db.getFirstAsync<{ version: number }>('SELECT version FROM db_version;');
  let currentVersion = currentVersionResult ? currentVersionResult.version : 0;
  
  console.log(`Current DB version: ${currentVersion}, Target version: ${CURRENT_DB_VERSION}`);

  if (currentVersion < 1) {
    await db.runAsync('INSERT OR REPLACE INTO db_version (version) VALUES (?)', 1);
    currentVersion = 1;
  }

  if (currentVersion < 2) {
    try {
      await db.execAsync('ALTER TABLE downloads ADD COLUMN local_thumbnail_path TEXT;');
    } catch (e) {
      if (e instanceof Error && e.message.includes('duplicate column name')) {
        console.warn("Column 'local_thumbnail_path' already exists. Skipping migration step.");
      } else { throw e; }
    }
    await db.runAsync('UPDATE db_version SET version = ?', 2);
    currentVersion = 2;
  }
  
  if (currentVersion < 3) {
    try {
        await db.execAsync('ALTER TABLE downloads ADD COLUMN resume_data TEXT;');
    } catch (e) {
        if (e instanceof Error && e.message.includes('duplicate column name')) {
            console.warn("Column 'resume_data' already exists. Skipping migration step.");
        } else { throw e; }
    }
    await db.runAsync('UPDATE db_version SET version = ?', 3);
    currentVersion = 3;
  }
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export enum DownloadStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface DownloadRecord {
  id: number;
  media_rating_key: string;
  server_identifier: string;
  local_file_path: string;
  cached_metadata_json: string;
  local_thumbnail_path: string | null;
  download_status: DownloadStatus;
  created_at: number;
  updated_at: number;
  file_size: number | null;
  downloaded_bytes: number;
  error_message: string | null;
  quality_profile: string | null;
  resume_data: string | null;
}

export interface ServerRecord {
  server_identifier: string;
  name: string;
  access_token: string;
  base_url: string;
  owned: number;
  last_connected: number | null;
  cached_metadata_json: string | null;
}

