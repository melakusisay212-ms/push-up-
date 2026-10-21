import type { IsoDate, PlanDay, Session } from './types.ts';
import { addDays, startOfWeek, weekday } from './calendar.ts';

/** A session counts as "habit-qualifying" when it is finished and at least half its sets were completed. Partial sessions below that
 *  are shown on the calendar but do not extend streaks. Workout completion (a finished session) and habit completion are separate. */
export const QUALIFY_RATIO = 0.5;
export function sessionRatio(s: Session): number {
  const sets = s.exercises.flatMap((e) => e.sets);
  return sets.length ? sets.filter((x) => x.status === 'done').length / sets.length : 0;
}
export const qualifies = (s: Session): boolean => s.status === 'completed' && sessionRatio(s) >= QUALIFY_RATIO;

export interface Streak { current: number; longest: number }
/** Weekly rule: a week (starting on weekStart) is met when qualifying sessions >= target minus sessions the user deliberately skipped
 *  that week. Skips are excused (neutral) so recovery never breaks a streak. The in-progress current week never breaks a streak. */
export function weeklyStreak(a: { qualDates: IsoDate[]; excusedDates: IsoDate[]; target: number; today: IsoDate; weekStart: number }): Streak {
  const q = new Map<string, number>(); const ex = new Map<string, number>();
  for (const d of a.qualDates) q.set(startOfWeek(d, a.weekStart), (q.get(startOfWeek(d, a.weekStart)) ?? 0) + 1);
  for (const d of a.excusedDates) ex.set(startOfWeek(d, a.weekStart), (ex.get(startOfWeek(d, a.weekStart)) ?? 0) + 1);
  const keys = [...q.keys(), ...ex.keys()].sort();
  if (!keys.length) return { current: 0, longest: 0 };
  const thisWeek = startOfWeek(a.today, a.weekStart);
  let run = 0; let longest = 0;
  for (let w = keys[0]; w <= thisWeek; w = addDays(w, 7)) {
    const need = a.target - (ex.get(w) ?? 0);
    const count = q.get(w) ?? 0;
    if (need <= 0) continue; // fully excused week: neutral
    if (count >= need) { run++; longest = Math.max(longest, run); } else if (w !== thisWeek) run = 0;
  }
  return { current: run, longest };
}
/** Daily rule: only scheduled training days matter. Rest days are neutral, skipped days are neutral, unreviewed misses break the streak. */
export function dailyStreak(a: { scheduled: IsoDate[]; completed: Set<IsoDate>; excused: Set<IsoDate>; today: IsoDate }): Streak {
  let run = 0; let longest = 0;
  for (const d of [...a.scheduled].sort()) {
    if (d > a.today) break;
    if (a.completed.has(d)) { run++; longest = Math.max(longest, run); }
    else if (a.excused.has(d) || d === a.today) continue;
    else run = 0;
  }
  return { current: run, longest };
}
export type DayState = 'done' | 'partial' | 'missed' | 'skipped' | 'scheduled' | 'rest' | 'none';
export function dayState(date: IsoDate, today: IsoDate, sessions: Session[], planDays: PlanDay[], planRange: { start: IsoDate; end: IsoDate } | null, trainWeekdays: number[]): DayState {
  const ss = sessions.filter((s) => s.date === date && (s.status === 'completed' || s.status === 'abandoned'));
  if (ss.some(qualifies)) return 'done';
  if (ss.some((s) => sessionRatio(s) > 0)) return 'partial';
  const pd = planDays.find((p) => p.date === date);
  if (pd) {
    if (pd.status === 'skipped') return 'skipped';
    if (pd.status === 'missed' || (pd.status === 'scheduled' && date < today)) return 'missed';
    if (pd.status === 'scheduled') return 'scheduled';
  }
  if (planRange && date >= planRange.start && date <= planRange.end && !trainWeekdays.includes(weekday(date))) return 'rest';
  return 'none';
}
