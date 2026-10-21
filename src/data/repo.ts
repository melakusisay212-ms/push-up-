import type { Db } from './db.ts';
import type { Decision, Goal, Plan, PlanDay, PlanMeta, Routine, Session, SessionExercise, SetLog, Settings, SetStatus, DayStatus } from '../domain/types.ts';
import { DEFAULT_SETTINGS } from '../domain/types.ts';
import { CATALOG } from '../domain/catalog.ts';

type R = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v);

export class Store {
  db: Db; clock: () => string;
  constructor(db: Db, clock: () => string = () => new Date().toISOString()) { this.db = db; this.clock = clock; }

  async seedCatalog(): Promise<void> {
    for (const e of CATALOG) await this.db.run(`INSERT INTO exercises(id,name,unit,family,json) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, json=excluded.json`, [e.id, e.name, e.unit, e.family, j(e)]);
  }
  // ---- goals & plans
  async saveGoalPlan(goal: Goal, plan: Plan, days: PlanDay[]): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run(`INSERT INTO goals(id,status,created_at,json) VALUES(?,?,?,?)`, [goal.id, goal.status, goal.createdAt, j(goal)]);
      await this.db.run(`INSERT INTO plans(id,goal_id,version,active,created_at,json) VALUES(?,?,?,?,?,?)`, [plan.id, goal.id, plan.version, 1, plan.createdAt, j(plan.meta)]);
      for (const d of days) await this.insertDay(d);
    });
  }
  async saveGoalOnly(goal: Goal): Promise<void> { await this.db.run(`INSERT INTO goals(id,status,created_at,json) VALUES(?,?,?,?)`, [goal.id, goal.status, goal.createdAt, j(goal)]); }
  private async insertDay(d: PlanDay): Promise<void> {
    await this.db.run(`INSERT INTO plan_days(id,plan_id,date,original_date,status,original_json,current_json,reason) VALUES(?,?,?,?,?,?,?,?)`, [d.id, d.planId, d.date, d.originalDate, d.status, j(d.original), j(d.current), d.reason]);
  }
  async listGoals(): Promise<Goal[]> { return (await this.db.all<R>(`SELECT json FROM goals ORDER BY created_at`)).map((r) => JSON.parse(r.json as string)); }
  async setGoalStatus(id: string, status: Goal['status']): Promise<void> {
    const g = (await this.listGoals()).find((x) => x.id === id); if (!g) return;
    await this.db.run(`UPDATE goals SET status=?, json=? WHERE id=?`, [status, j({ ...g, status }), id]);
  }
  async listPlans(): Promise<Plan[]> {
    return (await this.db.all<R>(`SELECT id,goal_id,version,active,created_at,json FROM plans WHERE active=1 ORDER BY created_at`)).map((r) => ({ id: r.id as string, goalId: r.goal_id as string, version: r.version as number, active: !!r.active, createdAt: r.created_at as string, meta: JSON.parse(r.json as string) as PlanMeta }));
  }
  async updatePlanMeta(planId: string, meta: PlanMeta): Promise<void> { await this.db.run(`UPDATE plans SET json=? WHERE id=?`, [j(meta), planId]); }
  private toDay(r: R): PlanDay {
    return { id: r.id as string, planId: r.plan_id as string, date: r.date as string, originalDate: r.original_date as string, status: r.status as DayStatus, original: JSON.parse(r.original_json as string), current: JSON.parse(r.current_json as string), reason: r.reason as string };
  }
  async listPlanDays(planId?: string): Promise<PlanDay[]> {
    const rows = planId ? await this.db.all<R>(`SELECT * FROM plan_days WHERE plan_id=? ORDER BY date`, [planId]) : await this.db.all<R>(`SELECT d.* FROM plan_days d JOIN plans p ON p.id=d.plan_id WHERE p.active=1 ORDER BY d.date`);
    return rows.map((r) => this.toDay(r));
  }
  async getPlanDay(id: string): Promise<PlanDay | null> { const r = await this.db.all<R>(`SELECT * FROM plan_days WHERE id=?`, [id]); return r.length ? this.toDay(r[0]) : null; }
  async updatePlanDay(d: PlanDay): Promise<void> {
    await this.db.run(`UPDATE plan_days SET date=?, status=?, current_json=?, reason=? WHERE id=?`, [d.date, d.status, j(d.current), d.reason, d.id]);
  }
  // ---- sessions
  async createSession(s: Session): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run(`INSERT INTO sessions(id,plan_day_id,routine_id,title,date,status,started_at,ended_at,effort,pain,pain_note,notes,prescription_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.id, s.planDayId, s.routineId, s.title, s.date, s.status, s.startedAt, s.endedAt, s.effort, s.pain ? 1 : 0, s.painNote, s.notes, s.prescription ? j(s.prescription) : null]);
      for (const e of s.exercises) {
        await this.db.run(`INSERT INTO session_exercises(id,session_id,position,exercise_id,name,unit,rest_sec) VALUES(?,?,?,?,?,?,?)`, [e.id, s.id, e.position, e.exerciseId, e.name, e.unit, e.restSec]);
        for (const x of e.sets) await this.db.run(`INSERT INTO set_logs(id,session_exercise_id,set_index,status,prescribed,actual,updated_at) VALUES(?,?,?,?,?,?,?)`, [x.id, e.id, x.index, x.status, x.prescribed, x.actual, this.clock()]);
      }
    });
  }
  private async hydrate(where: string, params: unknown[]): Promise<Session[]> {
    const ss = await this.db.all<R>(`SELECT * FROM sessions ${where} ORDER BY date, started_at`, params);
    if (!ss.length) return [];
    const ids = ss.map((s) => s.id as string); const q = ids.map(() => '?').join(',');
    const es = await this.db.all<R>(`SELECT * FROM session_exercises WHERE session_id IN (${q}) ORDER BY position`, ids);
    const eIds = es.map((e) => e.id as string);
    const sets = eIds.length ? await this.db.all<R>(`SELECT * FROM set_logs WHERE session_exercise_id IN (${eIds.map(() => '?').join(',')}) ORDER BY set_index`, eIds) : [];
    return ss.map((s) => ({
      id: s.id as string, planDayId: (s.plan_day_id as string) ?? null, routineId: (s.routine_id as string) ?? null, title: s.title as string, date: s.date as string,
      status: s.status as Session['status'], startedAt: s.started_at as string, endedAt: (s.ended_at as string) ?? null, effort: (s.effort as number) ?? null,
      pain: !!s.pain, painNote: s.pain_note as string, notes: s.notes as string, prescription: s.prescription_json ? JSON.parse(s.prescription_json as string) : null,
      exercises: es.filter((e) => e.session_id === s.id).map((e): SessionExercise => ({
        id: e.id as string, sessionId: s.id as string, position: e.position as number, exerciseId: e.exercise_id as string, name: e.name as string, unit: e.unit as 'reps' | 'seconds', restSec: e.rest_sec as number,
        sets: sets.filter((x) => x.session_exercise_id === e.id).map((x): SetLog => ({ id: x.id as string, sessionExerciseId: e.id as string, index: x.set_index as number, status: x.status as SetStatus, prescribed: x.prescribed as number, actual: (x.actual as number) ?? null })),
      })),
    }));
  }
  async getSession(id: string): Promise<Session | null> { return (await this.hydrate(`WHERE id=?`, [id]))[0] ?? null; }
  async findByPlanDay(planDayId: string): Promise<Session | null> { return (await this.hydrate(`WHERE plan_day_id=?`, [planDayId]))[0] ?? null; }
  async findOpen(): Promise<Session | null> { const l = await this.hydrate(`WHERE status IN ('in_progress','paused')`, []); return l[l.length - 1] ?? null; }
  async listSessions(): Promise<Session[]> { return this.hydrate(``, []); }
  async updateSet(setId: string, status: SetStatus, actual: number | null): Promise<void> { await this.db.run(`UPDATE set_logs SET status=?, actual=?, updated_at=? WHERE id=?`, [status, actual, this.clock(), setId]); }
  async updateSessionFields(id: string, f: Partial<Pick<Session, 'status' | 'endedAt' | 'effort' | 'pain' | 'painNote' | 'notes'>>): Promise<void> {
    const cols: string[] = []; const vals: unknown[] = [];
    const map: Record<string, string> = { status: 'status', endedAt: 'ended_at', effort: 'effort', pain: 'pain', painNote: 'pain_note', notes: 'notes' };
    for (const [k, v] of Object.entries(f)) { cols.push(`${map[k]}=?`); vals.push(k === 'pain' ? (v ? 1 : 0) : v); }
    if (cols.length) await this.db.run(`UPDATE sessions SET ${cols.join(',')} WHERE id=?`, [...vals, id]);
  }
  // ---- decisions
  async saveDecision(d: Decision): Promise<void> {
    await this.db.run(`INSERT INTO decisions(id,session_id,plan_id,outcome,reason,requires_review,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, [d.id, d.sessionId, d.planId, d.outcome, d.reason, d.requiresReview ? 1 : 0, j(d.before), j(d.after), d.createdAt]);
  }
  async listDecisions(): Promise<Decision[]> {
    return (await this.db.all<R>(`SELECT * FROM decisions ORDER BY created_at`)).map((r) => ({ id: r.id as string, sessionId: r.session_id as string, planId: r.plan_id as string, outcome: r.outcome as Decision['outcome'], reason: r.reason as string, requiresReview: !!r.requires_review, before: JSON.parse(r.before_json as string), after: JSON.parse(r.after_json as string), createdAt: r.created_at as string }));
  }
  // ---- routines
  async saveRoutine(r: Routine): Promise<void> {
    await this.db.run(`INSERT INTO routines(id,deleted,updated_at,json) VALUES(?,0,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, json=excluded.json`, [r.id, r.updatedAt, j(r)]);
  }
  async listRoutines(): Promise<Routine[]> { return (await this.db.all<R>(`SELECT json FROM routines WHERE deleted=0 ORDER BY updated_at DESC`)).map((r) => JSON.parse(r.json as string)); }
  /** Soft delete: completed sessions keep their own name/exercise snapshots. */
  async deleteRoutine(id: string): Promise<void> { await this.db.run(`UPDATE routines SET deleted=1 WHERE id=?`, [id]); }
  async insertSet(x: SetLog): Promise<void> {
    await this.db.run(`INSERT INTO set_logs(id,session_exercise_id,set_index,status,prescribed,actual,updated_at) VALUES(?,?,?,?,?,?,?)`, [x.id, x.sessionExerciseId, x.index, x.status, x.prescribed, x.actual, this.clock()]);
  }
  async substituteExercise(sessionExerciseId: string, exerciseId: string, name: string, unit: string): Promise<void> {
    await this.db.run(`UPDATE session_exercises SET exercise_id=?, name=?, unit=? WHERE id=?`, [exerciseId, name, unit, sessionExerciseId]);
  }
  // ---- settings
  async getSettings(): Promise<Settings> {
    const r = await this.db.all<R>(`SELECT value FROM settings WHERE key='app'`);
    const s = r.length ? JSON.parse(r[0].value as string) : {};
    return { ...DEFAULT_SETTINGS, ...s, reminders: { ...DEFAULT_SETTINGS.reminders, ...(s.reminders ?? {}) } };
  }
  async saveSettings(s: Settings): Promise<void> { await this.db.run(`INSERT INTO settings(key,value) VALUES('app',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [j(s)]); }
}
