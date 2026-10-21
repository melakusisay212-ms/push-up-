import type { Goal, IsoDate, PlanDay, Session } from './types.ts';
import { qualifies } from './habit.ts';
import { startOfWeek } from './calendar.ts';

const doneSets = (s: Session, exerciseId: string) => s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter((x) => x.status === 'done' && x.actual !== null);
const counted = (s: Session) => s.status === 'completed' || s.status === 'abandoned';
const inRange = (s: Session, from?: IsoDate, to?: IsoDate) => (!from || s.date >= from) && (!to || s.date <= to);

/** Total repetitions = sum of ACTUAL reps over completed sets of one exercise (reps-based exercises only; never mixed with seconds). */
export function totalReps(sessions: Session[], exerciseId: string, from?: IsoDate, to?: IsoDate): number {
  return sessions.filter((s) => counted(s) && inRange(s, from, to)).reduce((a, s) => a + doneSets(s, exerciseId).reduce((b, x) => b + (x.actual ?? 0), 0), 0);
}
export function totalSeconds(sessions: Session[], exerciseId: string, from?: IsoDate, to?: IsoDate): number { return totalReps(sessions, exerciseId, from, to); }
/** Best single set (consecutive reps, or longest hold) for an exercise. */
export function bestSet(sessions: Session[], exerciseId: string): number {
  return sessions.filter(counted).reduce((m, s) => Math.max(m, ...doneSets(s, exerciseId).map((x) => x.actual ?? 0), 0), 0);
}
/** Best total of one exercise within a single session. */
export function bestSessionTotal(sessions: Session[], exerciseId: string): number {
  return sessions.filter(counted).reduce((m, s) => Math.max(m, doneSets(s, exerciseId).reduce((b, x) => b + (x.actual ?? 0), 0)), 0);
}
export function trainingFrequency(sessions: Session[], from: IsoDate, to: IsoDate): number { return sessions.filter((s) => s.status === 'completed' && inRange(s, from, to)).length; }
export function weekSessionCount(sessions: Session[], today: IsoDate, weekStart: number): number {
  const w = startOfWeek(today, weekStart); return sessions.filter((s) => qualifies(s) && startOfWeek(s.date, weekStart) === w).length;
}
/** Completion rate = completed scheduled sessions / eligible scheduled sessions. Eligible = days before today, or completed today.
 *  Future and still-pending-today days are excluded. Skipped days stay in the denominator (honest), rest days are never scheduled sessions.
 *  Rescheduled sessions count once, on their new date. */
export function completionRate(days: PlanDay[], today: IsoDate): { completed: number; eligible: number; rate: number | null } {
  const eligible = days.filter((d) => d.date < today || d.status === 'completed');
  const completed = eligible.filter((d) => d.status === 'completed').length;
  return { completed, eligible: eligible.length, rate: eligible.length ? completed / eligible.length : null };
}
export interface Records { exerciseId: string; bestSet: number; bestSessionTotal: number }
export function personalRecords(sessions: Session[], exerciseIds: string[]): Records[] {
  return exerciseIds.map((id) => ({ exerciseId: id, bestSet: bestSet(sessions, id), bestSessionTotal: bestSessionTotal(sessions, id) })).filter((r) => r.bestSet > 0);
}
export interface GoalProgress { current: number; target: number; fraction: number; label: string }
export function goalProgress(g: Goal, sessions: Session[], today: IsoDate, weekStart: number): GoalProgress {
  const ex = g.exerciseId ?? '';
  let current = g.baseline; let label = '';
  switch (g.metric) {
    case 'max_consecutive': current = Math.max(g.baseline, bestSet(sessions, ex)); label = 'best consecutive reps in one set'; break;
    case 'total_per_session': current = Math.max(g.baseline, bestSessionTotal(sessions, ex)); label = 'best total reps in one session'; break;
    case 'duration_seconds': current = Math.max(g.baseline, bestSet(sessions, ex)); label = 'longest hold (seconds)'; break;
    case 'sessions_per_week': current = weekSessionCount(sessions, today, weekStart); label = 'qualifying sessions this week'; break;
    case 'total_sessions': current = sessions.filter(qualifies).length; label = 'qualifying sessions completed'; break;
  }
  const base = g.metric === 'sessions_per_week' || g.metric === 'total_sessions' ? 0 : g.baseline;
  const fraction = g.target > base ? Math.min(1, Math.max(0, (current - base) / (g.target - base))) : 0;
  return { current, target: g.target, fraction, label };
}
