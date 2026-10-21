import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Db } from '../data/db.ts';

/** Real on-device SQLite (Android). Not usable in a plain browser: the app shows a notice there instead of faking persistence. */
export async function openCapacitorDb(name = 'tsinat'): Promise<Db> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const exists = (await sqlite.isConnection(name, false)).result;
  const conn = consistent && exists ? await sqlite.retrieveConnection(name, false) : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open();
  await conn.execute('PRAGMA foreign_keys = ON;', false);
  let depth = 0;
  return {
    async exec(sql: string) { await conn.execute(sql, false); },
    async run(sql: string, params: unknown[] = []) { await conn.run(sql, params as never[], false); },
    async all<T>(sql: string, params: unknown[] = []) { const r = await conn.query(sql, params as never[]); return (r.values ?? []) as T[]; },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (depth > 0) return fn();
      depth++; await conn.beginTransaction();
      try { const out = await fn(); await conn.commitTransaction(); return out; }
      catch (e) { try { await conn.rollbackTransaction(); } catch { /* already rolled back */ } throw e; }
      finally { depth--; }
    },
  };
}
