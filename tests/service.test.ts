import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshService, nodeDb, pushupGoal } from './helpers.ts';
import { migrate, MIGRATIONS } from '../src/data/migrations.ts';
import { Store } from '../src/data/repo.ts';
import { WorkoutService } from '../src/services/workouts.ts';
import { totalReps, bestSet } from '../src/domain/analytics.ts';
import type { Routine } from '../src/domain/types.ts';

const TODAY = '2026-10-19';
const fb = { effort: 5, pain: false, painNote: '', notes: '' };

async function planAndFirstDay(svc: WorkoutService) {
  await svc.createGoal(pushupGoal(), TODAY);
  const snap = await svc.snapshot();
  return { snap, day: snap.planDays.find((d) => d.date === TODAY)! };
}
test('Scenario A: goal + plan persist across app restart (file database)', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tsinat-')), 'a.db');
  const a = await freshService(file); await a.svc.createGoal(pushupGoal(), TODAY);
  const before = await a.svc.snapshot(); a.db.raw.close();
  const db2 = nodeDb(file); await migrate(db2); const svc2 = new WorkoutService(new Store(db2));
  const after = await svc2.snapshot();
  assert.equal(after.goals.length, 1); assert.equal(after.planDays.length, before.planDays.length);
  assert.deepEqual(after.planDays[0].original, before.planDays[0].original);
});
test('Scenario B: log sets, finish, analytics reflect ACTUAL reps (not prescribed)', async () => {
  const { svc } = await freshService(); const { day } = await planAndFirstDay(svc);
  const s = await svc.startPlanSession(day.id, TODAY);
  const ex = s.exercises[0]; assert.equal(ex.sets.length, day.current.sets);
  await svc.logSet(s.id, ex.sets[0].id, day.current.reps + 2); await svc.logSet(s.id, ex.sets[1].id, day.current.reps - 1); await svc.skipSet(s.id, ex.sets[2].id);
  const res = await svc.finish(s.id, fb, TODAY);
  assert.equal(res.alreadyCompleted, false);
  const snap = await svc.snapshot();
  assert.equal(totalReps(snap.sessions, 'pushup'), day.current.reps * 2 + 1);
  assert.equal(bestSet(snap.sessions, 'pushup'), day.current.reps + 2);
  assert.equal(snap.planDays.find((d) => d.id === day.id)!.status, 'completed');
  assert.equal(snap.sessions[0].exercises[0].sets[2].status, 'skipped');
});
test('duplicate prevention: repeated start and repeated finish', async () => {
  const { svc, store } = await freshService(); const { day } = await planAndFirstDay(svc);
  const a = await svc.startPlanSession(day.id, TODAY); const b = await svc.startPlanSession(day.id, TODAY);
  assert.equal(a.id, b.id); assert.equal((await store.listSessions()).length, 1);
  await svc.logSet(a.id, a.exercises[0].sets[0].id, 8);
  const f1 = await svc.finish(a.id, fb, TODAY); const f2 = await svc.finish(a.id, fb, TODAY);
  assert.equal(f2.alreadyCompleted, true); assert.equal((await store.listDecisions()).length, 1); assert.equal(f1.decision!.id, f2.decision!.id);
  await assert.rejects(() => svc.startPlanSession(day.id, TODAY).then(() => svc.startPlanSession('nope', TODAY)));
  await assert.rejects(() => store.db.run(`INSERT INTO sessions(id,plan_day_id,title,date,status,started_at) VALUES('x',?, 't', ?, 'in_progress', 'now')`, [day.id, TODAY]));
});
test('finish requires at least one logged set', async () => {
  const { svc } = await freshService(); const { day } = await planAndFirstDay(svc);
  const s = await svc.startPlanSession(day.id, TODAY);
  await assert.rejects(() => svc.finish(s.id, fb, TODAY), /Log at least one set/);
  await assert.rejects(() => svc.logSet(s.id, s.exercises[0].sets[0].id, -3), /whole number/);
  await assert.rejects(() => svc.logSet(s.id, s.exercises[0].sets[0].id, 2.5), /whole number/);
});
test('interrupted workout is recoverable after restart; pause/resume', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tsinat-')), 'b.db');
  const a = await freshService(file); const { day } = await planAndFirstDay(a.svc);
  const s = await a.svc.startPlanSession(day.id, TODAY); await a.svc.logSet(s.id, s.exercises[0].sets[0].id, 7); await a.svc.setStatus(s.id, 'paused'); a.db.raw.close();
  const db2 = nodeDb(file); await migrate(db2); const store2 = new Store(db2);
  const open = await store2.findOpen(); assert.ok(open); assert.equal(open!.status, 'paused'); assert.equal(open!.exercises[0].sets[0].actual, 7);
  await new WorkoutService(store2).setStatus(open!.id, 'in_progress'); assert.equal((await store2.findOpen())!.status, 'in_progress');
});
test('Scenario C: progression decisions recorded with reasons; not every session progresses; originals preserved', async () => {
  const { svc } = await freshService(); const { snap } = await planAndFirstDay(svc);
  const days = snap.planDays; const originals = days.map((d) => JSON.stringify(d.original));
  const run = async (day: typeof days[0], reps: number, f: typeof fb, date: string) => {
    const s = await svc.startPlanSession(day.id, date); for (const x of s.exercises[0].sets) await svc.logSet(s.id, x.id, reps); return svc.finish(s.id, f, date);
  };
  const lvl = () => svc.snapshot().then((x) => x.plans[0].meta.state.level);
  const r1 = await run(days[0], days[0].current.reps, fb, days[0].date);
  assert.equal(r1.decision!.outcome, 'progress'); assert.equal(await lvl(), 11); assert.ok(r1.decision!.reason.length > 10);
  const mid = (await svc.snapshot()).planDays; assert.equal(mid[1].reason, r1.decision!.reason);
  const r2 = await run(mid[1], mid[1].current.reps, { ...fb, effort: 8 }, mid[1].date); assert.equal(r2.decision!.outcome, 'maintain'); assert.equal(await lvl(), 11);
  const mid2 = (await svc.snapshot()).planDays;
  const r3 = await run(mid2[2], 1, { ...fb, effort: 10 }, mid2[2].date); assert.equal(r3.decision!.outcome, 'reduce'); assert.equal(await lvl(), 9);
  const mid3 = (await svc.snapshot()).planDays;
  const r4 = await run(mid3[3], mid3[3].current.reps, { ...fb, pain: true, painNote: 'wrist' }, mid3[3].date);
  assert.equal(r4.decision!.outcome, 'review_pain'); assert.equal(await lvl(), 9); assert.equal(r4.decision!.requiresReview, true);
  const end = await svc.snapshot(); assert.deepEqual(end.planDays.map((d) => JSON.stringify(d.original)), originals);
  assert.equal((await svc.snapshot()).decisions.length, 4);
});
test('editing a completed workout recalculates analytics without touching other history', async () => {
  const { svc } = await freshService(); const { day } = await planAndFirstDay(svc);
  const s = await svc.startPlanSession(day.id, TODAY); for (const x of s.exercises[0].sets) await svc.logSet(s.id, x.id, 6);
  await svc.finish(s.id, fb, TODAY);
  const decisionBefore = (await svc.snapshot()).decisions[0];
  await svc.logSet(s.id, s.exercises[0].sets[0].id, 30);
  const snap = await svc.snapshot(); assert.equal(bestSet(snap.sessions, 'pushup'), 30); assert.equal(snap.sessions.length, 1);
  assert.deepEqual(snap.decisions[0], decisionBefore); // history of the decision is never silently rewritten
});
test('Scenario D: routine with two exercises; sets logged against the right exercise; editing routine keeps history', async () => {
  const { svc, store } = await freshService();
  const r: Routine = { id: 'r1', name: 'Upper + core', description: '', trainingDays: [2, 4], goalId: null, paused: false, restBetweenExercisesSec: 60, updatedAt: '2026-10-19T00:00:00Z',
    exercises: [{ exerciseId: 'pushup_knee', sets: 3, target: 8, restSec: 45, notes: '' }, { exerciseId: 'plank', sets: 2, target: 30, restSec: 30, notes: 'slow' }] };
  await store.saveRoutine(r);
  const s = await svc.startRoutineSession('r1', TODAY);
  assert.deepEqual(s.exercises.map((e) => [e.exerciseId, e.sets.length, e.unit]), [['pushup_knee', 3, 'reps'], ['plank', 2, 'seconds']]);
  assert.equal((await svc.startRoutineSession('r1', TODAY)).id, s.id); // resumes instead of duplicating
  await svc.logQuick(s.id, s.exercises[0].id, [9, 8, 8, 7]); // quick mode, 4th value adds an extra set
  await svc.logSet(s.id, s.exercises[1].sets[0].id, 35); await svc.logSet(s.id, s.exercises[1].sets[1].id, 31);
  await svc.finish(s.id, fb, TODAY);
  const done = (await svc.snapshot()).sessions[0];
  assert.equal(done.exercises[0].sets.length, 4); assert.equal(done.exercises[0].sets[3].actual, 7); assert.equal(done.exercises[1].sets[0].actual, 35);
  const snapshotBefore = JSON.stringify(done);
  await store.saveRoutine({ ...r, name: 'Renamed', exercises: [{ exerciseId: 'squat', sets: 5, target: 20, restSec: 60, notes: '' }], updatedAt: '2026-10-20T00:00:00Z' });
  assert.equal(JSON.stringify((await svc.snapshot()).sessions[0]), snapshotBefore);
  await store.deleteRoutine('r1'); assert.equal((await svc.snapshot()).routines.length, 0); assert.equal((await svc.snapshot()).sessions.length, 1);
  assert.equal(totalReps((await svc.snapshot()).sessions, 'plank'), 66); // seconds tracked separately, never summed with reps
  assert.equal(totalReps((await svc.snapshot()).sessions, 'pushup_knee'), 32);
});
test('substitution changes the exercise for the session only', async () => {
  const { svc } = await freshService(); const { day } = await planAndFirstDay(svc);
  const s = await svc.startPlanSession(day.id, TODAY); const after = await svc.substitute(s.id, s.exercises[0].id, 'pushup_knee');
  assert.equal(after.exercises[0].exerciseId, 'pushup_knee'); assert.equal((await svc.snapshot()).planDays.find((d) => d.id === day.id)!.current.exerciseId, 'pushup');
});
test('missed sessions: flagged, rescheduled without doubling, skip is neutral; history kept', async () => {
  const { svc, store } = await freshService(); const { snap } = await planAndFirstDay(svc);
  assert.equal(await svc.refreshMissed('2026-10-20'), 1);
  const missed = (await store.listPlanDays()).find((d) => d.status === 'missed')!; assert.equal(missed.date, '2026-10-19');
  const to = await svc.reschedule(missed.id, [1, 3, 5], '2026-10-20'); assert.ok(to && to > '2026-10-20');
  const moved = await store.getPlanDay(missed.id); assert.equal(moved!.status, 'scheduled'); assert.equal(moved!.originalDate, '2026-10-19'); assert.match(moved!.reason, /Rescheduled from/);
  const days = await store.listPlanDays(); assert.equal(new Set(days.map((d) => d.date)).size, days.length);
  await svc.skipDay(snap.planDays[1].id); assert.equal((await store.getPlanDay(snap.planDays[1].id))!.status, 'skipped');
});
test('migrations: idempotent, preserve data, newer-db guard, failed migration rolls back', async () => {
  const db = nodeDb(); assert.equal(await migrate(db), 1); assert.equal(await migrate(db), 1);
  const store = new Store(db); await store.saveGoalOnly(pushupGoal({ category: 'performance' }));
  const v2 = { version: 2, name: 'add column', sql: [`ALTER TABLE sessions ADD COLUMN mood TEXT`] };
  assert.equal(await migrate(db, [...MIGRATIONS, v2]), 2); assert.equal((await store.listGoals()).length, 1);
  await assert.rejects(() => migrate(db, MIGRATIONS), /newer/);
  const bad = { version: 3, name: 'broken', sql: [`ALTER TABLE sessions ADD COLUMN ok_col TEXT`, `THIS IS NOT SQL`] };
  await assert.rejects(() => migrate(db, [...MIGRATIONS, v2, bad]));
  const cols = (await db.all<{ name: string }>(`PRAGMA table_info(sessions)`)).map((c) => c.name);
  assert.ok(!cols.includes('ok_col')); assert.equal(await migrate(db, [...MIGRATIONS, v2]), 2);
});
test('interrupted write: a failing transaction leaves no partial goal/plan', async () => {
  const { svc, store } = await freshService();
  const g = pushupGoal(); const { plan, days } = await svc.createGoal(g, TODAY); assert.ok(plan && days.length);
  await assert.rejects(() => store.saveGoalPlan({ ...g, id: 'g2' }, { ...plan!, id: 'p2' }, [days[0], days[0]]));
  assert.equal((await store.listGoals()).length, 1); assert.equal((await store.listPlans()).length, 1);
});
test('multiple goals; non-push-up goals saved without a fake plan; settings persist', async () => {
  const { svc, store } = await freshService(); await svc.createGoal(pushupGoal(), TODAY);
  const habit = pushupGoal({ id: 'g3', title: '3 a week', category: 'habit', exerciseId: null, metric: 'sessions_per_week', baseline: 0, target: 3 });
  const r = await svc.createGoal(habit, TODAY); assert.equal(r.plan, null); assert.ok(r.warnings.some((w) => /No automatic plan/.test(w)));
  const plank = pushupGoal({ id: 'g4', title: 'Plank', exerciseId: 'plank', metric: 'duration_seconds', baseline: 30, target: 120 });
  assert.equal((await svc.createGoal(plank, TODAY)).plan, null); assert.equal((await store.listGoals()).length, 3);
  await assert.rejects(() => svc.createGoal(pushupGoal({ id: 'g5', target: 3 }), TODAY));
  const s = await store.getSettings(); await store.saveSettings({ ...s, calendar: 'gregorian', habitRule: 'daily' });
  const s2 = await store.getSettings(); assert.equal(s2.calendar, 'gregorian'); assert.equal(s2.habitRule, 'daily'); assert.equal(s2.reminders.time, '18:00');
  assert.equal((await new Store(nodeDb()).db.all(`SELECT 1`)).length, 1);
});
