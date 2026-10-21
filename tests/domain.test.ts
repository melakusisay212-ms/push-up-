import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, ethMonthLength, isoToEthiopian, ethiopianToIso, weekday, formatDate, monthGrid, DEFAULT_CALENDAR, shiftMonth, localTodayIso } from '../src/domain/calendar.ts';
import { validateGoal } from '../src/domain/goals.ts';
import { chooseTrainDays, generatePlan, findRescheduleDate, missedAdvice } from '../src/domain/planner.ts';
import { pushUpStrategy } from '../src/domain/progression.ts';
import { DEFAULT_PROGRESSION } from '../src/domain/types.ts';
import type { ProgressionState, Session, PlanDay } from '../src/domain/types.ts';
import { weeklyStreak, dailyStreak } from '../src/domain/habit.ts';
import { totalReps, bestSet, completionRate, goalProgress } from '../src/domain/analytics.ts';
import { computeReminders, stableId } from '../src/domain/reminders.ts';
import { pushupGoal } from './helpers.ts';

const TODAY = '2026-10-19';
test('Ethiopian calendar conversion', () => {
  assert.deepEqual(isoToEthiopian('2026-09-11'), [2019, 1, 1]);
  assert.deepEqual(isoToEthiopian('2026-10-19'), [2019, 2, 9]);
  assert.deepEqual(isoToEthiopian('2027-09-11'), [2019, 13, 6]); // leap year Pagume 6
  assert.deepEqual(isoToEthiopian('2027-09-12'), [2020, 1, 1]);
  assert.equal(ethiopianToIso(2019, 13, 6), '2027-09-11');
  assert.equal(weekday('2026-10-19'), 1);
  assert.equal(formatDate('2026-10-19'), 'Tikimt 9, 2019');
  assert.equal(formatDate('2026-10-19', { system: 'gregorian', script: 'latin' }), 'Oct 19, 2026');
  assert.equal(monthGrid(2019, 13, DEFAULT_CALENDAR).cells.filter(Boolean).length, 6);
  assert.equal(monthGrid(2018, 13, DEFAULT_CALENDAR).cells.filter(Boolean).length, 5);
  assert.deepEqual(shiftMonth(2019, 13, 1, DEFAULT_CALENDAR), [2020, 1]);
  assert.equal(localTodayIso(new Date(2026, 9, 19, 23, 59)), '2026-10-19');
});
test('Ethiopian conversion round-trips for every day 1900-2100 and month boundaries are exact', () => {
  let prev: [number, number, number] | null = null;
  for (let d = '1900-01-01'; d <= '2100-12-31'; d = addDays(d, 1)) {
    const [y, m, dd] = isoToEthiopian(d);
    assert.equal(ethiopianToIso(y, m, dd), d);
    assert.ok(m >= 1 && m <= 13 && dd >= 1 && dd <= ethMonthLength(y, m), d);
    if (prev) { const next = prev[2] === ethMonthLength(prev[0], prev[1]) ? (prev[1] === 13 ? [prev[0] + 1, 1, 1] : [prev[0], prev[1] + 1, 1]) : [prev[0], prev[1], prev[2] + 1]; assert.deepEqual([y, m, dd], next, d); }
    prev = [y, m, dd];
  }
  assert.equal(ethiopianToIso(2019, 1, 1), '2026-09-11'); assert.equal(ethiopianToIso(2020, 1, 1), '2027-09-12');
  assert.equal(monthGrid(2019, 2, DEFAULT_CALENDAR).cells.find(Boolean)!.iso, '2026-10-11');
});
test('goal validation separates consecutive from total and rejects contradictions', () => {
  assert.deepEqual(validateGoal(pushupGoal(), TODAY).errors, []);
  assert.ok(validateGoal(pushupGoal({ target: 5 }), TODAY).errors.length);
  assert.ok(validateGoal(pushupGoal({ metric: 'duration_seconds' }), TODAY).errors.length);
  assert.ok(validateGoal(pushupGoal({ availableDays: [1, 3] , sessionsPerWeek: 3, category: 'combined'}), TODAY).errors.length);
  assert.ok(validateGoal(pushupGoal({ deadline: '2026-10-01' }), TODAY).errors.length);
  const unrealistic = validateGoal(pushupGoal({ baseline: 5, target: 100, deadline: '2026-11-19' }), TODAY);
  assert.ok(unrealistic.warnings.some((w) => /weeks/.test(w)) && unrealistic.suggestedDeadline);
  assert.ok(validateGoal(pushupGoal(), TODAY).warnings.some((w) => /No deadline/.test(w)));
  const total = validateGoal(pushupGoal({ metric: 'total_per_session', target: 100, baseline: 30 }), TODAY);
  assert.deepEqual(total.errors, []);
});
test('plan with a deadline ends at the deadline and warns when the target is out of reach', () => {
  const p = generatePlan(pushupGoal({ baseline: 10, target: 50, deadline: '2026-12-19' }), '2026-10-19', TODAY);
  assert.ok(p.days.length > 10 && p.days[p.days.length - 1].date <= '2026-12-19');
  assert.ok(p.meta.warnings.some((w) => /target is 50/.test(w)));
  const far = generatePlan(pushupGoal({ deadline: '2028-10-19' }), '2026-10-19', TODAY); assert.ok(far.days[far.days.length - 1].date <= '2027-10-18');
});
test('plan generation: spacing, deload, originals preserved', () => {
  assert.deepEqual(chooseTrainDays([1, 2, 3, 4, 5, 6, 7], 3).length, 3);
  const spaced = chooseTrainDays([1, 2, 3, 4, 5], 2); assert.ok(spaced[1] - spaced[0] >= 2);
  const p = generatePlan(pushupGoal(), '2026-10-19', TODAY);
  assert.ok(p.days.length >= 30);
  assert.ok(p.days.every((d) => [1, 3, 5].includes(weekday(d.date))));
  assert.ok(p.days.every((d) => JSON.stringify(d.original) === JSON.stringify(d.current)));
  const w3 = p.days.filter((d) => d.date >= '2026-11-09' && d.date < '2026-11-16'); assert.ok(w3.every((d) => d.current.deload));
  assert.ok(p.days[0].current.reps < p.meta.state.level); // not a max-effort prescription
  assert.throws(() => generatePlan(pushupGoal({ exerciseId: 'plank', metric: 'duration_seconds' }), '2026-10-19', TODAY));
  assert.equal(generatePlan(pushupGoal({ baseline: 1, target: 20 }), '2026-10-19', TODAY).meta.state.variation, 'incline');
});
const st = (o: Partial<ProgressionState> = {}): ProgressionState => ({ level: 10, variation: 'standard', successStreak: 0, struggleStreak: 0, ...o });
const presc = pushUpStrategy.prescribe(10, 'standard', false);
const sets = (n: number, actual: number, status: 'done' | 'skipped' = 'done') => Array.from({ length: n }, () => ({ status, prescribed: presc.reps, actual: status === 'done' ? actual : null }));
test('progression: progress, maintain, reduce, pain, repeated difficulty', () => {
  const ok = pushUpStrategy.evaluate(st(), presc, sets(presc.sets, presc.reps), { effort: 6, pain: false }, DEFAULT_PROGRESSION);
  assert.equal(ok.outcome, 'progress'); assert.equal(ok.state.level, 11);
  const hard = pushUpStrategy.evaluate(st(), presc, sets(presc.sets, presc.reps), { effort: 8, pain: false }, DEFAULT_PROGRESSION);
  assert.equal(hard.outcome, 'maintain'); assert.equal(hard.state.level, 10);
  const part = pushUpStrategy.evaluate(st(), presc, [...sets(presc.sets - 1, presc.reps), ...sets(1, 0, 'skipped')], { effort: null, pain: false }, DEFAULT_PROGRESSION);
  assert.equal(part.outcome, 'maintain'); assert.equal(part.state.level, 10);
  const pain = pushUpStrategy.evaluate(st(), presc, sets(presc.sets, presc.reps), { effort: 3, pain: true }, DEFAULT_PROGRESSION);
  assert.equal(pain.outcome, 'review_pain'); assert.equal(pain.requiresReview, true); assert.equal(pain.state.level, 10);
  const r1 = pushUpStrategy.evaluate(st(), presc, sets(presc.sets, 1), { effort: 10, pain: false }, DEFAULT_PROGRESSION);
  assert.equal(r1.outcome, 'reduce'); assert.ok(r1.state.level < 10);
  const r2 = pushUpStrategy.evaluate(r1.state, presc, sets(presc.sets, 1), { effort: 10, pain: false }, DEFAULT_PROGRESSION);
  assert.equal(r2.outcome, 'modify_exercise'); assert.equal(r2.state.variation, 'incline');
  const r3 = pushUpStrategy.evaluate(st({ variation: 'incline', struggleStreak: 1 }), presc, sets(presc.sets, 1), { effort: 10, pain: false }, DEFAULT_PROGRESSION);
  assert.equal(r3.outcome, 'reassess');
  const twoNeeded = pushUpStrategy.evaluate(st(), presc, sets(presc.sets, presc.reps), { effort: 5, pain: false }, { ...DEFAULT_PROGRESSION, successesRequired: 2 });
  assert.equal(twoNeeded.outcome, 'maintain'); assert.equal(twoNeeded.state.successStreak, 1);
});
test('progression: volume never jumps sharply between levels', () => {
  for (let l = 4; l < 80; l++) {
    const a = pushUpStrategy.prescribe(l, 'standard', false); const b = pushUpStrategy.prescribe(l + 1, 'standard', false);
    assert.ok(b.sets * b.reps <= Math.ceil(a.sets * a.reps * 1.25) + 1, `level ${l}->${l + 1}`);
  }
});
test('missed sessions: reschedule never doubles or breaks recovery; advice escalates', () => {
  const p = generatePlan(pushupGoal(), '2026-10-19', TODAY); const missed = p.days[0];
  const to = findRescheduleDate(missed, p.days, [1, 3, 5], '2026-10-21'); assert.ok(to);
  const busy = p.days.filter((d) => d.id !== missed.id).map((d) => d.date);
  assert.ok(!busy.includes(to!)); assert.ok(!busy.includes(String(to)));
  assert.equal(missedAdvice(p.days, '2026-10-19').advice, 'none');
  assert.equal(missedAdvice(p.days, '2026-10-22').advice, 'reschedule');
  assert.equal(missedAdvice(p.days, '2026-11-02').advice, 'reassess');
});
const mk = (date: string, done: number, total: number, status: Session['status'] = 'completed', routineId: string | null = null): Session => ({
  id: date + done, planDayId: null, routineId, title: 't', date, status, startedAt: date, endedAt: date, effort: null, pain: false, painNote: '', notes: '', prescription: null,
  exercises: [{ id: 'x' + date, sessionId: date, position: 0, exerciseId: 'pushup', name: 'Push-up', unit: 'reps', restSec: 60,
    sets: Array.from({ length: total }, (_, i) => ({ id: `${date}-${i}`, sessionExerciseId: 'x' + date, index: i, status: i < done ? 'done' as const : 'skipped' as const, prescribed: 8, actual: i < done ? 10 + i : null })) }],
});
test('habit: weekly streak, excused skips, in-progress week, daily rule with rest days', () => {
  const base = { target: 3, today: '2026-10-19', weekStart: 1 };
  const wk = (mon: string, n: number) => Array.from({ length: n }, (_, i) => `${mon.slice(0, 8)}${String(Number(mon.slice(8)) + i).padStart(2, '0')}`);
  assert.deepEqual(weeklyStreak({ ...base, qualDates: [...wk('2026-10-05', 3), ...wk('2026-10-12', 3)], excusedDates: [] }), { current: 2, longest: 2 });
  assert.deepEqual(weeklyStreak({ ...base, qualDates: [...wk('2026-10-05', 3), ...wk('2026-10-12', 3)], excusedDates: [] }).current, 2); // current week empty does not break
  assert.equal(weeklyStreak({ ...base, qualDates: [...wk('2026-10-05', 3), ...wk('2026-10-12', 1)], excusedDates: [] }).current, 0);
  assert.equal(weeklyStreak({ ...base, qualDates: [...wk('2026-10-05', 3), ...wk('2026-10-12', 2)], excusedDates: ['2026-10-16'] }).current, 2);
  assert.deepEqual(weeklyStreak({ ...base, qualDates: [], excusedDates: [] }), { current: 0, longest: 0 });
  const d = dailyStreak({ scheduled: ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19'], completed: new Set(['2026-10-12', '2026-10-14', '2026-10-16']), excused: new Set(), today: '2026-10-19' });
  assert.deepEqual(d, { current: 3, longest: 3 });
  const broken = dailyStreak({ scheduled: ['2026-10-12', '2026-10-14', '2026-10-16'], completed: new Set(['2026-10-12', '2026-10-16']), excused: new Set(), today: '2026-10-19' });
  assert.equal(broken.current, 1); assert.equal(broken.longest, 1);
  const excused = dailyStreak({ scheduled: ['2026-10-12', '2026-10-14', '2026-10-16'], completed: new Set(['2026-10-12', '2026-10-16']), excused: new Set(['2026-10-14']), today: '2026-10-19' });
  assert.equal(excused.current, 2);
  const yr = weeklyStreak({ qualDates: ['2026-12-28', '2027-01-04'], excusedDates: [], target: 1, today: '2027-01-05', weekStart: 1 }); assert.equal(yr.current, 2);
});
test('analytics: total vs best set are separate; edits recalc; completion rate excludes future', () => {
  const s = [mk('2026-10-12', 3, 3), mk('2026-10-14', 2, 3)];
  assert.equal(totalReps(s, 'pushup'), 10 + 11 + 12 + 10 + 11); assert.equal(bestSet(s, 'pushup'), 12);
  assert.equal(totalReps(s, 'pushup', '2026-10-13'), 21); assert.equal(totalReps(s, 'plank'), 0);
  s[0].exercises[0].sets[2].actual = 20; assert.equal(bestSet(s, 'pushup'), 20);
  const days = [{ date: '2026-10-12', status: 'completed' }, { date: '2026-10-14', status: 'missed' }, { date: '2026-10-19', status: 'scheduled' }, { date: '2026-10-21', status: 'scheduled' }] as PlanDay[];
  assert.deepEqual(completionRate(days, '2026-10-19'), { completed: 1, eligible: 2, rate: 0.5 });
  assert.equal(completionRate([], TODAY).rate, null);
  const g = pushupGoal(); assert.equal(goalProgress(g, s, TODAY, 1).current, 20);
  const tot = pushupGoal({ metric: 'total_per_session', baseline: 20, target: 100 }); assert.equal(goalProgress(tot, s, TODAY, 1).current, 41);
});
test('reminders: scheduled only, suppress completed/skipped/rescheduled, stable ids, no past, missed optional', () => {
  const p = generatePlan(pushupGoal(), '2026-10-19', TODAY);
  const now = new Date(2026, 9, 19, 9, 0); const settings = { enabled: true, time: '18:00', missedEnabled: false, missedTime: '20:30' };
  const base = { planDays: p.days, routines: [], sessions: [], settings, now, today: TODAY };
  const r1 = computeReminders(base); assert.ok(r1.length > 0 && r1.length <= 14);
  assert.deepEqual(r1.map((x) => x.id), computeReminders(base).map((x) => x.id));
  assert.equal(new Set(r1.map((x) => x.id)).size, r1.length);
  const first = p.days[0];
  const done = computeReminders({ ...base, planDays: p.days.map((d) => d.id === first.id ? { ...d, status: 'completed' as const } : d) });
  assert.ok(!done.some((x) => x.key.includes(first.id)));
  const skipped = computeReminders({ ...base, planDays: p.days.map((d) => d.id === first.id ? { ...d, status: 'skipped' as const } : d) });
  assert.ok(!skipped.some((x) => x.key.includes(first.id)));
  const withMissed = computeReminders({ ...base, settings: { ...settings, missedEnabled: true } });
  assert.equal(withMissed.length, r1.length * 2);
  assert.equal(computeReminders({ ...base, settings: { ...settings, enabled: false } }).length, 0);
  const late = computeReminders({ ...base, now: new Date(2026, 9, 19, 19, 0) }); assert.ok(!late.some((x) => x.key.includes(first.id)));
  const moved = computeReminders({ ...base, planDays: p.days.map((d) => d.id === first.id ? { ...d, date: '2026-10-26' } : d) });
  assert.ok(moved.find((x) => x.key.includes(first.id))!.at.getDate() === 26);
  assert.equal(stableId('a'), stableId('a'));
  const rt = { id: 'r1', name: 'Core', description: '', exercises: [], trainingDays: [1, 3], goalId: null, paused: false, restBetweenExercisesSec: 60, updatedAt: '' };
  const rr = computeReminders({ ...base, planDays: [], routines: [rt], sessions: [] }); assert.ok(rr.length > 0);
  assert.equal(computeReminders({ ...base, planDays: [], routines: [{ ...rt, paused: true }] }).length, 0);
  const rrDone = computeReminders({ ...base, planDays: [], routines: [rt], sessions: [mk('2026-10-19', 1, 1, 'completed', 'r1')], now: new Date(2026, 9, 19, 5, 0) });
  assert.ok(!rrDone.some((x) => x.at.getDate() === 19));
});
