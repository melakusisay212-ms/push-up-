import type { Db } from './db.ts';
export interface Migration { version: number; name: string; sql: string[] }

/** Append-only. Never edit a shipped migration; add a new one. Progress is tracked in schema_meta (not PRAGMA user_version) so the same
 *  runner works with every SQLite binding. */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'initial schema', sql: [
    `CREATE TABLE exercises (id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL, family TEXT NOT NULL, json TEXT NOT NULL)`,
    `CREATE TABLE goals (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL)`,
    `CREATE TABLE plans (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), version INTEGER NOT NULL, active INTEGER NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL)`,
    `CREATE TABLE plan_days (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id), date TEXT NOT NULL, original_date TEXT NOT NULL, status TEXT NOT NULL,
       original_json TEXT NOT NULL, current_json TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', UNIQUE(plan_id, date))`,
    `CREATE INDEX idx_plan_days_date ON plan_days(date, status)`,
    `CREATE TABLE routines (id TEXT PRIMARY KEY, deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, json TEXT NOT NULL)`,
    `CREATE TABLE sessions (id TEXT PRIMARY KEY, plan_day_id TEXT UNIQUE REFERENCES plan_days(id), routine_id TEXT, title TEXT NOT NULL, date TEXT NOT NULL,
       status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, effort INTEGER, pain INTEGER NOT NULL DEFAULT 0, pain_note TEXT NOT NULL DEFAULT '',
       notes TEXT NOT NULL DEFAULT '', prescription_json TEXT)`,
    `CREATE INDEX idx_sessions_date ON sessions(date)`,
    `CREATE INDEX idx_sessions_status ON sessions(status)`,
    `CREATE TABLE session_exercises (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, position INTEGER NOT NULL,
       exercise_id TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL, rest_sec INTEGER NOT NULL)`,
    `CREATE TABLE set_logs (id TEXT PRIMARY KEY, session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE, set_index INTEGER NOT NULL,
       status TEXT NOT NULL, prescribed INTEGER NOT NULL, actual INTEGER, updated_at TEXT NOT NULL, UNIQUE(session_exercise_id, set_index))`,
    `CREATE TABLE decisions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id), plan_id TEXT NOT NULL, outcome TEXT NOT NULL,
       reason TEXT NOT NULL, requires_review INTEGER NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  ] },
];

export async function migrate(db: Db, migrations: Migration[] = MIGRATIONS): Promise<number> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const rows = await db.all<{ value: string }>(`SELECT value FROM schema_meta WHERE key = 'version'`);
  let current = rows.length ? Number(rows[0].value) : 0;
  const latest = migrations.reduce((m, x) => Math.max(m, x.version), 0);
  if (current > latest) throw new Error(`Database is newer (v${current}) than this app (v${latest}). Update the app.`);
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    await db.transaction(async () => {
      for (const stmt of m.sql) await db.run(stmt);
      await db.run(`INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(m.version)]);
    });
    current = m.version;
  }
  return current;
}
