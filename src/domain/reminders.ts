import type { IsoDate, PlanDay, ReminderSettings, Routine, Session } from './types.ts';
import { addDays, weekday } from './calendar.ts';

export interface PlannedReminder { key: string; id: number; at: Date; title: string; body: string; kind: 'workout' | 'missed' }
export function stableId(key: string): number { let h = 0x811c9dc5; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0) & 0x7fffffff; }
function at(date: IsoDate, hhmm: string): Date { const [y, m, d] = date.split('-').map(Number); const [hh, mm] = hhmm.split(':').map(Number); return new Date(y, m - 1, d, hh, mm, 0, 0); }

/** Pure computation of what should be scheduled. Completed, skipped and moved sessions never produce reminders; a day with a completed
 *  session never gets a missed-workout reminder. Ids are stable hashes so rescheduling replaces rather than duplicates. */
export function computeReminders(a: { planDays: PlanDay[]; routines: Routine[]; sessions: Session[]; settings: ReminderSettings; now: Date; today: IsoDate; horizonDays?: number }): PlannedReminder[] {
  if (!a.settings.enabled) return [];
  const out: PlannedReminder[] = []; const horizon = a.horizonDays ?? 30;
  const push = (key: string, date: IsoDate, kind: 'workout' | 'missed', title: string, body: string) => {
    const when = at(date, kind === 'workout' ? a.settings.time : a.settings.missedTime);
    if (when.getTime() > a.now.getTime()) out.push({ key: `${kind}:${key}`, id: stableId(`${kind}:${key}`), at: when, title, body, kind });
  };
  for (const d of a.planDays) {
    if (d.status !== 'scheduled' || d.date < a.today || d.date > addDays(a.today, horizon)) continue;
    push(d.id, d.date, 'workout', 'Workout day', `${d.current.sets} sets of ${d.current.reps}. Rest well and start when you are ready.`);
    if (a.settings.missedEnabled) push(d.id, d.date, 'missed', 'Still planning to train?', 'You can do it later today, reschedule, or skip it. Rest is fine too.');
  }
  for (const r of a.routines) {
    if (r.paused) continue;
    for (let i = 0; i <= horizon; i++) {
      const date = addDays(a.today, i);
      if (!r.trainingDays.includes(weekday(date))) continue;
      if (a.sessions.some((s) => s.routineId === r.id && s.date === date && s.status === 'completed')) continue;
      push(`${r.id}:${date}`, date, 'workout', r.name, 'Your routine is scheduled for today.');
      if (a.settings.missedEnabled) push(`${r.id}:${date}`, date, 'missed', 'Still planning to train?', `${r.name} is still open today. No pressure.`);
    }
  }
  return out;
}
