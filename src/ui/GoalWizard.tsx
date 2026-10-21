import { useState } from 'react';
import type { Goal, GoalCategory, GoalMetric, Experience } from '../domain/types.ts';
import { CATALOG } from '../domain/catalog.ts';
import { formatDate } from '../domain/calendar.ts';
import { validateGoal } from '../domain/goals.ts';
import { generatePlan, supportsPlanGeneration } from '../domain/planner.ts';
import { newId } from '../domain/id.ts';
import { DateInput, Sheet, WeekdayChips, useApp } from './shared.tsx';

const TEMPLATES: { label: string; patch: Partial<Goal> }[] = [
  { label: '50 consecutive push-ups', patch: { title: '50 consecutive push-ups', category: 'performance', exerciseId: 'pushup', metric: 'max_consecutive', baseline: 10, target: 50 } },
  { label: '100 push-ups in one workout', patch: { title: '100 push-ups in one workout', category: 'performance', exerciseId: 'pushup', metric: 'total_per_session', baseline: 30, target: 100 } },
  { label: '3 workouts every week', patch: { title: 'Train 3 times a week', category: 'habit', exerciseId: null, metric: 'sessions_per_week', baseline: 0, target: 3, sessionsPerWeek: 3 } },
  { label: 'Plank for 2 minutes', patch: { title: 'Hold a plank for 2 minutes', category: 'performance', exerciseId: 'plank', metric: 'duration_seconds', baseline: 30, target: 120 } },
];
const blank = (): Goal => ({ id: newId('goal'), title: '', category: 'performance', exerciseId: 'pushup', metric: 'max_consecutive', baseline: 10, target: 30, deadline: null,
  sessionsPerWeek: 3, availableDays: [1, 3, 5], equipment: [], experience: 'beginner', limitations: '', status: 'active', createdAt: new Date().toISOString() });

export function GoalWizard() {
  const { svc, today, cal, setWizard, go, run, toast } = useApp();
  const [g, setG] = useState<Goal>(blank());
  const [preview, setPreview] = useState<string | null>(null);
  const upd = (p: Partial<Goal>) => { setG({ ...g, ...p }); setPreview(null); };
  const v = validateGoal(g, today);
  const perf = g.category !== 'habit'; const habit = g.category !== 'performance';
  const ex = CATALOG.find((e) => e.id === g.exerciseId);
  const plan = (() => { if (v.errors.length || !supportsPlanGeneration(g)) return null; try { return generatePlan(g, today, today); } catch { return null; } })();
  const save = async () => {
    const r = await run(() => svc.createGoal(g, today));
    if (r) { toast(r.plan ? 'Goal and plan saved.' : 'Goal saved.'); setWizard(false); go('home'); }
  };
  return <Sheet onClose={() => setWizard(false)}>
    <h1>New goal</h1>
    <div className="sub">Quick start, then adjust anything.</div>
    <div className="row wrap" style={{ margin: '10px 0' }}>{TEMPLATES.map((t) => <button key={t.label} className="chip" onClick={() => { setG({ ...blank(), ...t.patch }); setPreview(null); }}>{t.label}</button>)}</div>
    <label className="f">Goal name</label><input type="text" value={g.title} onChange={(e) => upd({ title: e.target.value })} />
    <label className="f">Type</label>
    <select value={g.category} onChange={(e) => upd({ category: e.target.value as GoalCategory, metric: e.target.value === 'habit' ? 'sessions_per_week' : g.metric === 'sessions_per_week' || g.metric === 'total_sessions' ? 'max_consecutive' : g.metric })}>
      <option value="performance">Performance (reach a number)</option><option value="habit">Habit (train regularly)</option><option value="combined">Both</option></select>
    {perf && <>
      <label className="f">Exercise</label>
      <select value={g.exerciseId ?? ''} onChange={(e) => { const x = CATALOG.find((c) => c.id === e.target.value); upd({ exerciseId: e.target.value, metric: x?.unit === 'seconds' ? 'duration_seconds' : g.metric === 'duration_seconds' ? 'max_consecutive' : g.metric }); }}>
        {CATALOG.map((c) => <option key={c.id} value={c.id}>{c.name}{c.progression ? '' : ' (no auto plan yet)'}</option>)}</select>
      {ex?.unit !== 'seconds' && <><label className="f">What are you measuring?</label>
        <select value={g.metric} onChange={(e) => upd({ metric: e.target.value as GoalMetric })}>
          <option value="max_consecutive">Consecutive reps in ONE set</option><option value="total_per_session">Total reps in a whole workout</option></select></>}
      <label className="f">Where are you now? ({ex?.unit === 'seconds' ? 'seconds' : 'reps'}{g.metric === 'total_per_session' ? ' per workout' : ' in one set'})</label>
      <input type="number" inputMode="numeric" min={0} value={g.baseline} onChange={(e) => upd({ baseline: Number(e.target.value) })} />
      <label className="f">Target</label>
      <input type="number" inputMode="numeric" min={1} value={g.target} onChange={(e) => upd({ target: Number(e.target.value) })} />
      <label className="f">Deadline (optional)</label>
      <DateInput value={g.deadline} onChange={(d) => upd({ deadline: d })} minIso={today} />
      {g.deadline && <button className="sm ghost" onClick={() => upd({ deadline: null })}>Remove deadline ({formatDate(g.deadline, cal)})</button>}</>}
    {habit && <><label className="f">Sessions per week</label>
      <select value={g.sessionsPerWeek} onChange={(e) => upd({ sessionsPerWeek: Number(e.target.value), target: g.category === 'habit' ? Number(e.target.value) : g.target })}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}</select></>}
    {!habit && <><label className="f">Sessions per week</label>
      <select value={g.sessionsPerWeek} onChange={(e) => upd({ sessionsPerWeek: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></>}
    <label className="f">Days you can train</label><WeekdayChips value={g.availableDays} onChange={(d) => upd({ availableDays: d })} />
    <label className="f">Experience</label>
    <select value={g.experience} onChange={(e) => upd({ experience: e.target.value as Experience })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>
    <label className="f">Limitations or injuries (optional)</label><input type="text" value={g.limitations} onChange={(e) => upd({ limitations: e.target.value })} />
    {v.errors.map((e) => <div key={e} className="note bad">{e}</div>)}
    {v.warnings.map((w) => <div key={w} className="note warn">{w}</div>)}
    {v.suggestedDeadline && <button className="sm" onClick={() => upd({ deadline: v.suggestedDeadline })}>Use suggested date: {formatDate(v.suggestedDeadline, cal)}</button>}
    {perf && !supportsPlanGeneration(g) && !v.errors.length && <div className="note">Automatic plans exist for push-up goals only so far. This goal is tracked from your workouts; schedule training with a routine.</div>}
    {plan && <><button className="ghost" onClick={() => setPreview(preview ? null : 'open')}>{preview ? 'Hide plan preview' : 'Preview plan'}</button>
      {preview && <div className="card">{plan.days.slice(0, 6).map((d) => <div key={d.id} className="row between"><span>{formatDate(d.date, cal, true)}</span><b>{d.current.sets} × {d.current.reps}</b></div>)}
        <div className="sub" style={{ marginTop: 8 }}>{plan.days.length} sessions planned. This is a recommendation, not a guarantee. It adapts to how you actually perform.</div></div>}</>}
    <div className="row" style={{ marginTop: 16 }}><button className="grow" onClick={() => setWizard(false)}>Cancel</button><button className="primary grow" disabled={v.errors.length > 0} onClick={save}>{plan ? 'Save goal & plan' : 'Save goal'}</button></div>
  </Sheet>;
}
