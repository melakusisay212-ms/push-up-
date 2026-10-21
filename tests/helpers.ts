import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/data/db.ts';
import { migrate } from '../src/data/migrations.ts';
import { Store } from '../src/data/repo.ts';
import { WorkoutService } from '../src/services/workouts.ts';
import type { Goal } from '../src/domain/types.ts';

export function nodeDb(file = ':memory:'): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(file); raw.exec('PRAGMA foreign_keys = ON');
  let depth = 0;
  return {
    raw,
    async exec(sql) { raw.exec(sql); },
    async run(sql, p = []) { raw.prepare(sql).run(...(p as never[])); },
    async all(sql, p = []) { return raw.prepare(sql).all(...(p as never[])) as never; },
    async transaction(fn) {
      if (depth > 0) return fn();
      depth++; raw.exec('BEGIN');
      try { const r = await fn(); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; } finally { depth--; }
    },
  };
}
export async function freshService(file = ':memory:') {
  const db = nodeDb(file); await migrate(db); const store = new Store(db); await store.seedCatalog();
  return { db, store, svc: new WorkoutService(store) };
}
export const pushupGoal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g1', title: '50 push-ups', category: 'performance', exerciseId: 'pushup', metric: 'max_consecutive', baseline: 10, target: 50, deadline: null,
  sessionsPerWeek: 3, availableDays: [1, 3, 5], equipment: [], experience: 'beginner', limitations: '', status: 'active', createdAt: '2026-10-19T00:00:00Z', ...o,
});
