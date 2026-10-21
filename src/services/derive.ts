import type { Goal, PlanDay, Session } from '../domain/types.ts';
import type { IsoDate } from '../domain/calendar.ts';
import type { Snapshot } from './workouts.ts';
import { dailyStreak, qualifies, weeklyStreak } from '../domain/habit.ts';
import type { Streak } from '../domain/habit.ts';

export const primaryGoal = (s: Snapshot): Goal | null => s.goals.find((g) => g.status === 'active') ?? null;
export function habitTarget(s: Snapshot): number { const g = primaryGoal(s); return g ? g.sessionsPerWeek : 3; }
export function computeStreak(s: Snapshot, today: IsoDate): Streak {
  const qual = s.sessions.filter(qualifies);
  const excused = s.planDays.filter((d) => d.status === 'skipped').map((d) => d.date);
  if (s.settings.habitRule === 'daily') {
    return dailyStreak({ scheduled: s.planDays.map((d) => d.date), completed: new Set(qual.map((x) => x.date)), excused: new Set(excused), today });
  }
  return weeklyStreak({ qualDates: qual.map((x) => x.date), excusedDates: excused, target: habitTarget(s), today, weekStart: s.settings.weekStart });
}
export function todayPlanDay(s: Snapshot, today: IsoDate): PlanDay | null {
  return s.planDays.find((d) => d.date === today && d.status !== 'skipped') ?? null;
}
export function nextPlanDay(s: Snapshot, today: IsoDate): PlanDay | null {
  return s.planDays.filter((d) => d.status === 'scheduled' && d.date > today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}
export function reviewDays(s: Snapshot, today: IsoDate): PlanDay[] {
  return s.planDays.filter((d) => d.status === 'missed' || (d.status === 'scheduled' && d.date < today));
}
export const sessionFor = (s: Snapshot, d: PlanDay): Session | null => s.sessions.find((x) => x.planDayId === d.id) ?? null;
