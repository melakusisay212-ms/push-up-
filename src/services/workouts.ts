import type { Decision, Goal, Plan, PlanDay, Routine, Session, SessionExercise, SetLog, Settings, ProgressionConfig } from '../domain/types.ts';
import type { Store } from '../data/repo.ts';
import type { IsoDate } from '../domain/calendar.ts';
import { exerciseById } from '../domain/catalog.ts';
import { STRATEGIES, makeDecisionRecord } from '../domain/progression.ts';
import { findRescheduleDate, generatePlan, missedToFlag, rebuildFuture, supportsPlanGeneration } from '../domain/planner.ts';
import { goalProgress } from '../domain/analytics.ts';
import { validateGoal } from '../domain/goals.ts';
import { newId } from '../domain/id.ts';
import { DEFAULT_PROGRESSION } from '../domain/types.ts';

export interface FinishFeedback { effort: number | null; pain: boolean; painNote: string; notes: string }
export interface FinishResult { session: Session; decision: Decision | null; alreadyCompleted: boolean }
export interface Snapshot { goals: Goal[]; plans: Plan[]; planDays: PlanDay[]; sessions: Session[]; routines: Routine[]; decisions: Decision[]; settings: Settings }

function validReps(n: number, unit: string): boolean { return Number.isInteger(n) && n >= 0 && n <= (unit === 'seconds' ? 7200 : 1000); }

export class WorkoutService {
  store: Store;
  constructor(store: Store) { this.store = store; }

  async snapshot(): Promise<Snapshot> {
    const [goals, plans, planDays, sessions, routines, decisions, settings] = await Promise.all([
      this.store.listGoals(), this.store.listPlans(), this.store.listPlanDays(), this.store.listSessions(), this.store.listRoutines(), this.store.listDecisions(), this.store.getSettings(),
    ]);
    return { goals, plans, planDays, sessions, routines, decisions, settings };
  }
  /** Creates the goal, and (for push-up performance goals) a generated plan, atomically. */
  async createGoal(goal: Goal, today: IsoDate, startDate: IsoDate = today, config: ProgressionConfig = DEFAULT_PROGRESSION): Promise<{ plan: Plan | null; days: PlanDay[]; warnings: string[] }> {
    const v = validateGoal(goal, today);
    if (v.errors.length) throw new Error(v.errors.join(' '));
    if (!supportsPlanGeneration(goal)) { await this.store.saveGoalOnly(goal); return { plan: null, days: [], warnings: [...v.warnings, 'No automatic plan for this goal yet. Progress is tracked from your logged workouts; use Routines to schedule training.'] }; }
    const g = generatePlan(goal, startDate, today, config);
    const plan: Plan = { id: g.planId, goalId: goal.id, version: 1, active: true, createdAt: new Date().toISOString(), meta: g.meta };
    await this.store.saveGoalPlan(goal, plan, g.days);
    return { plan, days: g.days, warnings: g.meta.warnings };
  }
  private mkSession(parts: { planDayId: string | null; routineId: string | null; title: string; date: IsoDate; prescription: Session['prescription']; exercises: { exerciseId: string; name: string; unit: 'reps' | 'seconds'; restSec: number; sets: number; target: number }[] }): Session {
    const id = newId('ses');
    const exercises: SessionExercise[] = parts.exercises.map((e, i) => {
      const eid = newId('sx');
      const sets: SetLog[] = Array.from({ length: e.sets }, (_, k) => ({ id: newId('set'), sessionExerciseId: eid, index: k, status: 'pending', prescribed: e.target, actual: null }));
      return { id: eid, sessionId: id, position: i, exerciseId: e.exerciseId, name: e.name, unit: e.unit, restSec: e.restSec, sets };
    });
    return { id, planDayId: parts.planDayId, routineId: parts.routineId, title: parts.title, date: parts.date, status: 'in_progress', startedAt: new Date().toISOString(), endedAt: null, effort: null, pain: false, painNote: '', notes: '', prescription: parts.prescription, exercises };
  }
  /** Idempotent: repeated taps return the same session (UNIQUE plan_day_id guards the database too). */
  async startPlanSession(planDayId: string, today: IsoDate): Promise<Session> {
    const existing = await this.store.findByPlanDay(planDayId); if (existing) return existing;
    const day = await this.store.getPlanDay(planDayId); if (!day) throw new Error('Workout not found.');
    if (day.status === 'completed') throw new Error('This workout is already completed.');
    const ex = exerciseById(day.current.exerciseId);
    const s = this.mkSession({ planDayId, routineId: null, title: ex?.name ?? 'Workout', date: today, prescription: day.current,
      exercises: [{ exerciseId: day.current.exerciseId, name: ex?.name ?? day.current.exerciseId, unit: day.current.unit, restSec: day.current.restSec, sets: day.current.sets, target: day.current.reps }] });
    await this.store.createSession(s); return s;
  }
  async startRoutineSession(routineId: string, today: IsoDate): Promise<Session> {
    const open = await this.store.findOpen(); if (open) return open;
    const r = (await this.store.listRoutines()).find((x) => x.id === routineId); if (!r) throw new Error('Routine not found.');
    if (!r.exercises.length) throw new Error('This routine has no exercises.');
    const s = this.mkSession({ planDayId: null, routineId, title: r.name, date: today, prescription: null,
      exercises: r.exercises.map((e) => { const d = exerciseById(e.exerciseId); return { exerciseId: e.exerciseId, name: d?.name ?? e.exerciseId, unit: d?.unit ?? 'reps', restSec: e.restSec, sets: e.sets, target: e.target }; }) });
    await this.store.createSession(s); return s;
  }
  /** Saved immediately so a killed app loses nothing. Works on in-progress and completed sessions (corrections). */
  async logSet(sessionId: string, setId: string, actual: number): Promise<Session> {
    const s = await this.must(sessionId); const set = s.exercises.flatMap((e) => e.sets).find((x) => x.id === setId); if (!set) throw new Error('Set not found.');
    const unit = s.exercises.find((e) => e.id === set.sessionExerciseId)?.unit ?? 'reps';
    if (!validReps(actual, unit)) throw new Error('Enter a whole number in a sensible range.');
    await this.store.updateSet(setId, 'done', actual); return this.must(sessionId);
  }
  async skipSet(sessionId: string, setId: string): Promise<Session> { await this.store.updateSet(setId, 'skipped', null); return this.must(sessionId); }
  async clearSet(sessionId: string, setId: string): Promise<Session> { await this.store.updateSet(setId, 'pending', null); return this.must(sessionId); }
  /** Quick mode: "8, 8, 7" fills sets in order using the same SetLog model; extra values add extra sets. */
  async logQuick(sessionId: string, sessionExerciseId: string, values: number[]): Promise<Session> {
    const s = await this.must(sessionId); const ex = s.exercises.find((e) => e.id === sessionExerciseId); if (!ex) throw new Error('Exercise not found.');
    if (values.some((v) => !validReps(v, ex.unit))) throw new Error('Enter whole numbers in a sensible range.');
    await this.store.db.transaction(async () => {
      for (let i = 0; i < values.length; i++) {
        const set = ex.sets[i];
        if (set) await this.store.updateSet(set.id, 'done', values[i]);
        else await this.store.insertSet({ id: newId('set'), sessionExerciseId, index: i, status: 'done', prescribed: ex.sets[ex.sets.length - 1]?.prescribed ?? 0, actual: values[i] });
      }
    });
    return this.must(sessionId);
  }
  async substitute(sessionId: string, sessionExerciseId: string, exerciseId: string): Promise<Session> {
    const d = exerciseById(exerciseId); if (!d) throw new Error('Unknown exercise.');
    await this.store.substituteExercise(sessionExerciseId, d.id, d.name, d.unit); return this.must(sessionId);
  }
  async setStatus(sessionId: string, status: 'paused' | 'in_progress'): Promise<Session> { await this.store.updateSessionFields(sessionId, { status }); return this.must(sessionId); }
  async discard(sessionId: string): Promise<void> { await this.store.updateSessionFields(sessionId, { status: 'abandoned', endedAt: new Date().toISOString() }); }
  async editFeedback(sessionId: string, fb: Partial<FinishFeedback>): Promise<Session> { await this.store.updateSessionFields(sessionId, fb); return this.must(sessionId); }

  /** Finishing is idempotent: a second call returns the stored result and never records a second decision. */
  async finish(sessionId: string, fb: FinishFeedback, today: IsoDate): Promise<FinishResult> {
    const s0 = await this.must(sessionId);
    if (s0.status === 'completed') return { session: s0, decision: (await this.store.listDecisions()).find((d) => d.sessionId === sessionId) ?? null, alreadyCompleted: true };
    const sets = s0.exercises.flatMap((e) => e.sets);
    if (!sets.some((x) => x.status === 'done' || x.status === 'skipped')) throw new Error('Log at least one set, or discard this workout.');
    let decision: Decision | null = null;
    await this.store.db.transaction(async () => {
      await this.store.updateSessionFields(sessionId, { status: 'completed', endedAt: new Date().toISOString(), effort: fb.effort, pain: fb.pain, painNote: fb.painNote, notes: fb.notes });
      for (const x of sets.filter((x) => x.status === 'pending')) await this.store.updateSet(x.id, 'skipped', null);
      if (!s0.planDayId) return;
      const day = await this.store.getPlanDay(s0.planDayId); if (!day) return;
      await this.store.updatePlanDay({ ...day, status: 'completed' });
      const plan = (await this.store.listPlans()).find((p) => p.id === day.planId); const goal = plan && (await this.store.listGoals()).find((g) => g.id === plan.goalId);
      const strat = STRATEGIES.pushup;
      if (!plan || !goal || !s0.prescription) return;
      const fresh = await this.must(sessionId);
      const results = fresh.exercises[0].sets.map((x) => ({ status: x.status, prescribed: x.prescribed, actual: x.actual }));
      const r = strat.evaluate(plan.meta.state, s0.prescription, results, { effort: fb.effort, pain: fb.pain }, plan.meta.config);
      decision = makeDecisionRecord(newId('dec'), sessionId, plan.id, plan.meta.state, r, new Date().toISOString());
      await this.store.saveDecision(decision);
      const meta = { ...plan.meta, state: r.state };
      await this.store.updatePlanMeta(plan.id, meta);
      const future = (await this.store.listPlanDays(plan.id)).filter((d) => d.status === 'scheduled' && d.date > day.date);
      for (const d of rebuildFuture(meta, future, goal, r.reason)) await this.store.updatePlanDay(d);
      const all = await this.store.listSessions();
      if (goal.category === 'performance' && goalProgress(goal, all, today, 1).fraction >= 1) await this.store.setGoalStatus(goal.id, 'achieved');
    });
    return { session: await this.must(sessionId), decision, alreadyCompleted: false };
  }
  async refreshMissed(today: IsoDate): Promise<number> {
    const days = await this.store.listPlanDays(); const ids = missedToFlag(days, today);
    for (const d of days.filter((x) => ids.includes(x.id))) await this.store.updatePlanDay({ ...d, status: 'missed', reason: d.reason || 'Not completed on the planned day. Reschedule, skip or revise.' });
    return ids.length;
  }
  async skipDay(dayId: string, reason = 'Skipped by you'): Promise<void> { const d = await this.store.getPlanDay(dayId); if (d && d.status !== 'completed') await this.store.updatePlanDay({ ...d, status: 'skipped', reason }); }
  /** Moves a scheduled/missed session to the next free eligible date. Never doubles up, never erases originalDate. */
  async reschedule(dayId: string, availableDays: number[], today: IsoDate): Promise<IsoDate | null> {
    const d = await this.store.getPlanDay(dayId); if (!d || d.status === 'completed') return null;
    const to = findRescheduleDate(d, await this.store.listPlanDays(d.planId), availableDays, today); if (!to) return null;
    await this.store.updatePlanDay({ ...d, date: to, status: 'scheduled', reason: `Rescheduled from ${d.originalDate}` }); return to;
  }
  private async must(id: string): Promise<Session> { const s = await this.store.getSession(id); if (!s) throw new Error('Workout not found.'); return s; }
}
