import type { Goal, Experience, IsoDate } from './types.ts';
import { exerciseById } from './catalog.ts';
import { daysBetween, addDays } from './calendar.ts';

export interface GoalValidation { errors: string[]; warnings: string[]; suggestedDeadline: IsoDate | null }
const WEEKLY_RATE: Record<Experience, number> = { beginner: 0.12, intermediate: 0.08, advanced: 0.05 };

/** Conservative estimate of weeks to move a max-reps ability from baseline to target. */
export function estimateWeeksToTarget(baseline: number, target: number, experience: Experience, sessionsPerWeek: number): number {
  let cur = Math.max(baseline, 1); let weeks = 0;
  const freq = Math.min(1, sessionsPerWeek / 3);
  while (cur < target && weeks < 520) { cur += Math.max(1, Math.round(cur * WEEKLY_RATE[experience] * freq)); weeks++; }
  return weeks;
}
/** Heuristic: a session total of T reps corresponds to roughly a max-set of T/3 (e.g. 4-5 sets at ~60% of max). Used only for planning. */
export function equivalentLevelForTotal(totalTarget: number): number { return Math.ceil(totalTarget / 3); }

export function validateGoal(g: Goal, today: IsoDate): GoalValidation {
  const errors: string[] = []; const warnings: string[] = []; let suggestedDeadline: IsoDate | null = null;
  const ex = g.exerciseId ? exerciseById(g.exerciseId) : undefined;
  const perf = g.category !== 'habit';
  const habit = g.category !== 'performance';
  if (!g.title.trim()) errors.push('Give the goal a name.');
  if (g.exerciseId && !ex) errors.push('Unknown exercise.');
  if (perf) {
    if (!ex) errors.push('Choose an exercise for a performance goal.');
    if (!['max_consecutive', 'total_per_session', 'duration_seconds'].includes(g.metric)) errors.push('Choose a performance measurement: consecutive reps, total reps in a session, or duration.');
    if (ex && g.metric === 'duration_seconds' && ex.unit !== 'seconds') errors.push(`${ex.name} is counted in reps, not seconds.`);
    if (ex && g.metric !== 'duration_seconds' && ex.unit === 'seconds') errors.push(`${ex.name} is timed; use a duration target.`);
    if (!Number.isInteger(g.baseline) || g.baseline < 0) errors.push('Current ability must be a whole number, 0 or more.');
    if (!Number.isInteger(g.target) || g.target <= 0) errors.push('Target must be a whole number above 0.');
    else if (g.target <= g.baseline) errors.push('Target must be higher than your current ability.');
    if (g.metric === 'max_consecutive' && g.target > 150) warnings.push('A target above 150 consecutive reps is far beyond typical training outcomes; double-check it.');
  }
  if (habit) {
    if (!Number.isInteger(g.sessionsPerWeek) || g.sessionsPerWeek < 1 || g.sessionsPerWeek > 7) errors.push('Sessions per week must be between 1 and 7.');
    if (g.category === 'habit' && g.metric === 'total_sessions' && (!Number.isInteger(g.target) || g.target < 1)) errors.push('Total sessions target must be at least 1.');
  }
  if (g.availableDays.length === 0 || g.availableDays.some((d) => d < 1 || d > 7)) errors.push('Pick at least one available training day.');
  if (habit && g.availableDays.length < g.sessionsPerWeek) errors.push('You chose more sessions per week than available days.');
  if (g.deadline) {
    if (g.deadline <= today) errors.push('Deadline must be in the future.');
    else if (perf && ex && !errors.length && g.metric !== 'duration_seconds') {
      const need = g.metric === 'total_per_session' ? equivalentLevelForTotal(g.target) : g.target;
      const weeksNeeded = estimateWeeksToTarget(g.baseline, need, g.experience, g.sessionsPerWeek);
      const weeksHave = daysBetween(today, g.deadline) / 7;
      if (weeksNeeded > weeksHave) {
        suggestedDeadline = addDays(today, weeksNeeded * 7);
        warnings.push(`At a safe pace this target typically needs about ${weeksNeeded} weeks; your deadline allows ${Math.floor(weeksHave)}. The plan will aim for steady progress, but it may not reach the target by then.`);
      }
    }
  } else if (perf) warnings.push('No deadline set: the plan will cover 12 weeks and extend as you progress.');
  if (g.limitations.trim()) warnings.push('You listed limitations. Check with a health professional if an exercise causes pain.');
  return { errors, warnings, suggestedDeadline };
}
