import { Pool } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Document = Record<string, unknown>;
type Update<T> = { state: Document; result: T; archive?: Document };
const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
let pool: Pool | undefined;
let sqlite: DatabaseSync | undefined;
let initialized: Promise<void> | undefined;
function database() {
  if (connectionString)
    return (pool ??= new Pool({ connectionString, max: 3, connectionTimeoutMillis: 8000 }));
  if (process.env.VERCEL) throw Error('Falta configurar DATABASE_URL en Vercel.');
  if (!sqlite) {
    const path = process.env.TRUCO_DB || '.data/truco.sqlite';
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    sqlite = new DatabaseSync(path);
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  }
  return sqlite;
}
export async function ready() {
  return (initialized ??= (async () => {
    const db = database();
    const schema =
      'CREATE TABLE IF NOT EXISTS truco_rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS truco_matches(id TEXT PRIMARY KEY, state TEXT NOT NULL);';
    if (db instanceof DatabaseSync) db.exec(schema);
    else await db.query(schema);
  })());
}
export async function update<T>(
  code: string,
  change: (state: Document | null) => Update<T>,
): Promise<T> {
  await ready();
  const db = database();
  if (db instanceof DatabaseSync) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT state FROM truco_rooms WHERE code=?').get(code) as
        { state: string } | undefined;
      const value = change(row ? JSON.parse(row.state) : null);
      db.prepare(
        'INSERT INTO truco_rooms VALUES(?,?) ON CONFLICT(code) DO UPDATE SET state=excluded.state',
      ).run(code, JSON.stringify(value.state));
      if (value.archive)
        db.prepare('INSERT INTO truco_matches VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(
          String(value.archive.id),
          JSON.stringify(value.archive),
        );
      db.exec('COMMIT');
      return value.result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Locks also cover creation when the room row doesn't exist yet.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [code]);
    const rows = await client.query('SELECT state FROM truco_rooms WHERE code=$1', [code]);
    const value = change(rows.rows[0] ? JSON.parse(rows.rows[0].state) : null);
    await client.query(
      'INSERT INTO truco_rooms VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET state=excluded.state',
      [code, JSON.stringify(value.state)],
    );
    if (value.archive)
      await client.query('INSERT INTO truco_matches VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [
        value.archive.id,
        JSON.stringify(value.archive),
      ]);
    await client.query('COMMIT');
    return value.result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function documents(table: 'truco_rooms' | 'truco_matches'): Promise<Document[]> {
  await ready();
  const db = database();
  const rows =
    db instanceof DatabaseSync
      ? db.prepare(`SELECT state FROM ${table}`).all()
      : (await db.query(`SELECT state FROM ${table}`)).rows;
  return rows.map((row) => JSON.parse(String(row.state)));
}

// Solo trae las salas con actividad reciente: filtrar en la base evita descargar todas las salas viejas en cada sondeo.
export async function recentRooms(since: number): Promise<Document[]> {
  await ready();
  const db = database();
  const rows =
    db instanceof DatabaseSync
      ? db
          .prepare("SELECT state FROM truco_rooms WHERE json_extract(state, '$.updated') > ?")
          .all(since)
      : (
          await db.query(
            "SELECT state FROM truco_rooms WHERE (state::jsonb->>'updated')::bigint > $1",
            [since],
          )
        ).rows;
  return rows.map((row) => JSON.parse(String(row.state)));
}
