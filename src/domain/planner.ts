import type { Goal, PlanDay, PlanMeta, Prescription, ProgressionConfig, ProgressionState, IsoDate } from './types.ts';
import { DEFAULT_PROGRESSION } from './types.ts';
import { addDays, daysBetween, weekday } from './calendar.ts';
import { STRATEGIES } from './progression.ts';
import { equivalentLevelForTotal, validateGoal } from './goals.ts';
import { newId } from './id.ts';

export function supportsPlanGeneration(goal: Goal): boolean {
  return goal.category !== 'habit' && goal.exerciseId === 'pushup' && (goal.metric === 'max_consecutive' || goal.metric === 'total_per_session');
}
/** Pick `k` of the available weekdays maximising the smallest gap between sessions (recovery spacing). */
export function chooseTrainDays(available: number[], k: number): number[] {
  const days = [...new Set(available)].sort((a, b) => a - b);
  if (k >= days.length) return days;
  let best: number[] = []; let bestScore = -1;
  const rec = (start: number, cur: number[]) => {
    if (cur.length === k) {
      let min = 7;
      for (let i = 0; i < k; i++) min = Math.min(min, (cur[(i + 1) % k] - cur[i] + 7) % 7 || 7);
      if (min > bestScore) { bestScore = min; best = [...cur]; }
      return;
    }
    for (let i = start; i < days.length; i++) rec(i + 1, [...cur, days[i]]);
  };
  rec(0, []);
  return best;
}
export const goalTargetLevel = (g: Goal): number => (g.metric === 'total_per_session' ? equivalentLevelForTotal(g.target) : g.target);
export function startingState(g: Goal): ProgressionState {
  const level0 = g.metric === 'total_per_session' ? equivalentLevelForTotal(g.baseline) : g.baseline;
  return level0 < 3 ? { level: 6, variation: 'incline', successStreak: 0, struggleStreak: 0 } : { level: level0, variation: 'standard', successStreak: 0, struggleStreak: 0 };
}
const isDeloadWeek = (startDate: IsoDate, date: IsoDate): boolean => { const w = Math.floor(daysBetween(startDate, date) / 7); return w > 0 && w % 4 === 3; };

/** Project prescriptions for a list of dates from a state: level rises one step every `progressEvery` non-deload sessions, never above the goal level. */
export function projectPrescriptions(state: ProgressionState, dates: IsoDate[], startDate: IsoDate, cfg: ProgressionConfig, cap: number): Prescription[] {
  const strat = STRATEGIES.pushup; let level = state.level; let n = 0;
  return dates.map((d) => {
    const deload = isDeloadWeek(startDate, d);
    const p = strat.prescribe(Math.min(level, Math.max(cap, state.level)), state.variation, deload);
    if (!deload) { n++; if (n % cfg.progressEvery === 0) level += strat.stepFor(level); }
    return p;
  });
}
export interface GeneratedPlan { planId: string; meta: PlanMeta; days: PlanDay[] }
export function generatePlan(goal: Goal, startDate: IsoDate, today: IsoDate, config: ProgressionConfig = DEFAULT_PROGRESSION): GeneratedPlan {
  if (!supportsPlanGeneration(goal)) throw new Error('Automatic plans are only available for push-up goals so far. Create a routine instead.');
  const v = validateGoal(goal, today);
  if (v.errors.length) throw new Error(v.errors.join(' '));
  const warnings = [...v.warnings];
  const trainDays = chooseTrainDays(goal.availableDays, goal.sessionsPerWeek);
  const cap = addDays(startDate, 364);
  const horizon = goal.deadline ? (goal.deadline < cap ? goal.deadline : cap) : addDays(startDate, 83);
  const dates: IsoDate[] = [];
  for (let d = startDate; d <= horizon; d = addDays(d, 1)) if (trainDays.includes(weekday(d))) dates.push(d);
  if (!dates.length) throw new Error('No training dates fit before the deadline.');
  if (goal.sessionsPerWeek > 3) warnings.push('More than 3 push-up sessions a week leaves little recovery time. The plan includes a lighter week every 4th week.');
  const state = startingState(goal);
  if (state.variation === 'incline') warnings.push('Starting with incline push-ups, which are easier to build a base with.');
  const targetLevel = goalTargetLevel(goal);
  const presc = projectPrescriptions(state, dates, startDate, config, targetLevel);
  const planId = newId('plan');
  const days: PlanDay[] = dates.map((date, i) => ({ id: newId('day'), planId, date, originalDate: date, status: 'scheduled', original: presc[i], current: presc[i], reason: '' }));
  const milestones = days.filter((_, i) => i % Math.max(1, goal.sessionsPerWeek * 4) === 0 && i > 0).map((d) => ({ date: d.date, level: d.original.level }));
  const last = days[days.length - 1].original.level;
  if (last < targetLevel) warnings.push(`At the planned pace you would reach about ${last} by the end of this plan; the target is ${targetLevel}. The plan will be extended or revised as you progress; it is a recommendation, not a guarantee.`);
  return { planId, days, meta: { startDate, trainDays, state, config, milestones, warnings } };
}
/** Re-project every future day from the current progression state. Originals stay untouched. */
export function rebuildFuture(meta: PlanMeta, future: PlanDay[], goal: Goal, reason: string): PlanDay[] {
  const sorted = [...future].sort((a, b) => a.date.localeCompare(b.date));
  const presc = projectPrescriptions(meta.state, sorted.map((d) => d.date), meta.startDate, meta.config, goalTargetLevel(goal));
  return sorted.map((d, i) => ({ ...d, current: presc[i], reason: i === 0 ? reason : d.reason }));
}
/** Next free eligible date for a missed/rescheduled session: an available weekday, no neighbouring session, never doubled up. */
export function findRescheduleDate(day: PlanDay, all: PlanDay[], availableDays: number[], today: IsoDate, extraDays = 14): IsoDate | null {
  const others = all.filter((d) => d.id !== day.id && d.status !== 'skipped');
  const busy = new Set(others.map((d) => d.date));
  // If the whole schedule is full, the session lands after the last planned day (the plan extends; nothing is doubled up).
  const last = others.reduce((m, d) => (d.date > m ? d.date : m), today);
  const lookahead = Math.max(0, daysBetween(today, last)) + extraDays;
  for (let i = 0; i <= lookahead; i++) {
    const c = addDays(today, i);
    if (!availableDays.includes(weekday(c))) continue;
    if (busy.has(c) || busy.has(addDays(c, -1)) || busy.has(addDays(c, 1))) continue;
    return c;
  }
  return null;
}
export function missedToFlag(days: PlanDay[], today: IsoDate): string[] { return days.filter((d) => d.status === 'scheduled' && d.date < today).map((d) => d.id); }
export type MissedAdvice = 'none' | 'reschedule' | 'reassess';
export function missedAdvice(days: PlanDay[], today: IsoDate): { missedRecent: number; advice: MissedAdvice } {
  const since = addDays(today, -14);
  const n = days.filter((d) => (d.status === 'missed' || (d.status === 'scheduled' && d.date < today)) && d.date >= since).length;
  return { missedRecent: n, advice: n >= 3 ? 'reassess' : n >= 1 ? 'reschedule' : 'none' };
}
