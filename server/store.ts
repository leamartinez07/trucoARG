import { Pool } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Document = Record<string, unknown>;
type Update<T> = { state: Document; result: T; archive?: Document };
const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const onSupabase = Boolean(process.env.SUPABASE_DB_URL);
const schema = onSupabase ? 'truco_private' : 'public';
const roomTable = `${schema}.truco_rooms`;
const matchTable = `${schema}.truco_matches`;
let pool: Pool | undefined;
let sqlite: DatabaseSync | undefined;
let initialized: Promise<void> | undefined;
function database() {
  if (connectionString) {
    if (!pool) {
      const url = onSupabase ? new URL(connectionString) : undefined;
      if (url && (!url.hostname.endsWith('.pooler.supabase.com') || url.port !== '6543'))
        throw Error('SUPABASE_DB_URL debe usar el pooler de Supabase (puerto 6543).');
      // node-postgres lets sslmode in the URL override the explicit CA options.
      url?.searchParams.delete('sslmode');
      pool = new Pool({
        connectionString: url?.toString() || connectionString,
        max: 3,
        connectionTimeoutMillis: 8000,
        ...(onSupabase ? { ssl: {
          rejectUnauthorized: true,
          ...(process.env.SUPABASE_CA_CERT ? { ca: process.env.SUPABASE_CA_CERT.replace(/\\n/g, '\n') } : {}),
        } } : {}),
      });
    }
    return pool;
  }
  if (process.env.VERCEL) throw Error('Falta configurar SUPABASE_DB_URL en Vercel.');
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
    if (db instanceof DatabaseSync) {
      db.exec('CREATE TABLE IF NOT EXISTS truco_rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS truco_matches(id TEXT PRIMARY KEY, state TEXT NOT NULL);');
      return;
    }
    if (onSupabase) {
      await prepareSupabase(db);
      return;
    }
    await db.query(`CREATE TABLE IF NOT EXISTS ${roomTable}(code TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ${matchTable}(id TEXT PRIMARY KEY, state TEXT NOT NULL);`);
  })().catch((error) => {
    initialized = undefined;
    throw error;
  }));
}

// Supabase's public schema may be exposed through its Data API. Game state and
// private player keys must live in a schema that the API does not expose.
async function prepareSupabase(db: Pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('truco:supabase:migration'))");
    await client.query('CREATE SCHEMA IF NOT EXISTS truco_private');
    await client.query('REVOKE ALL ON SCHEMA truco_private FROM PUBLIC');
    await client.query(`CREATE TABLE IF NOT EXISTS ${roomTable}(code TEXT PRIMARY KEY, state TEXT NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${matchTable}(id TEXT PRIMARY KEY, state TEXT NOT NULL)`);
    await client.query('CREATE TABLE IF NOT EXISTS truco_private.migrations(name TEXT PRIMARY KEY, next_retry TIMESTAMPTZ)');
    const migrated = await client.query("SELECT name, next_retry FROM truco_private.migrations WHERE name IN ('neon-to-supabase', 'neon-retry-after')");
    if (!migrated.rows.some((row) => row.name === 'neon-to-supabase')) {
      // Preserve any data written to public by an earlier Supabase deploy.
      for (const table of ['truco_rooms', 'truco_matches'] as const) {
        const exists = await client.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
        if (exists.rows[0]?.name) {
          const key = table === 'truco_rooms' ? 'code' : 'id';
          await client.query(`INSERT INTO truco_private.${table} SELECT ${key}, state FROM public.${table} ON CONFLICT (${key}) DO NOTHING`);
          await client.query(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`);
        }
      }
      const oldUrl = [process.env.DATABASE_URL, process.env.POSTGRES_URL].find((value) => {
        if (!value) return false;
        try { return new URL(value).hostname.endsWith('.neon.tech'); }
        catch { return false; }
      });
      const retryAfter = migrated.rows.find((row) => row.name === 'neon-retry-after')?.next_retry;
      if (oldUrl && (!retryAfter || new Date(retryAfter).getTime() <= Date.now())) {
        const old = new Pool({ connectionString: oldUrl, max: 1, connectionTimeoutMillis: 8000 });
        try {
          for (const table of ['truco_rooms', 'truco_matches'] as const) {
            const key = table === 'truco_rooms' ? 'code' : 'id';
            const rows = await old.query(`SELECT ${key}, state FROM public.${table}`);
            for (let i = 0; i < rows.rows.length; i += 100) {
              await client.query(
                `INSERT INTO truco_private.${table}(${key},state) SELECT ${key},state FROM json_to_recordset($1::json) AS data(${key} text,state text) ON CONFLICT (${key}) DO NOTHING`,
                [JSON.stringify(rows.rows.slice(i, i + 100))],
              );
            }
          }
          await client.query("INSERT INTO truco_private.migrations(name) VALUES('neon-to-supabase') ON CONFLICT DO NOTHING");
          await client.query("DELETE FROM truco_private.migrations WHERE name='neon-retry-after'");
        } catch (error) {
          // The old free database may be over quota. Keep Supabase playable and
          // retry the history copy at a later cold start without stalling every request.
          console.warn('Neon history migration pending:', error instanceof Error ? error.message : error);
          await client.query("INSERT INTO truco_private.migrations(name,next_retry) VALUES('neon-retry-after',now() + interval '1 hour') ON CONFLICT (name) DO UPDATE SET next_retry=excluded.next_retry");
        } finally {
          await old.end();
        }
      } else if (!oldUrl) {
        await client.query("INSERT INTO truco_private.migrations(name) VALUES('neon-to-supabase') ON CONFLICT DO NOTHING");
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
    const rows = await client.query(`SELECT state FROM ${roomTable} WHERE code=$1`, [code]);
    const value = change(rows.rows[0] ? JSON.parse(rows.rows[0].state) : null);
    await client.query(
      `INSERT INTO ${roomTable} VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET state=excluded.state`,
      [code, JSON.stringify(value.state)],
    );
    if (value.archive)
      await client.query(`INSERT INTO ${matchTable} VALUES($1,$2) ON CONFLICT(id) DO NOTHING`, [
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
      : (await db.query(`SELECT state FROM ${schema}.${table}`)).rows;
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
            `SELECT state FROM ${roomTable} WHERE (state::jsonb->>'updated')::bigint > $1`,
            [since],
          )
        ).rows;
  return rows.map((row) => JSON.parse(String(row.state)));
}
