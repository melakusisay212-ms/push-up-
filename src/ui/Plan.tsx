import { useState } from 'react';
import { addDays, formatDate, startOfWeek, weekday } from '../domain/calendar.ts';
import { dayState } from '../domain/habit.ts';
import { exerciseById } from '../domain/catalog.ts';
import { missedAdvice } from '../domain/planner.ts';
import { DayDetail, MonthHeat, useApp } from './shared.tsx';

export function Plan() {
  const { snap, svc, today, cal, run, toast } = useApp();
  const [picked, setPicked] = useState<string | null>(null);
  const advice = missedAdvice(snap.planDays, today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today, snap.settings.weekStart), i));
  const trainDays = [...new Set(snap.plans.flatMap((p) => p.meta.trainDays))];
  const upcoming = snap.planDays.filter((d) => d.status === 'scheduled' || d.status === 'missed').slice(0, 12);
  const availFor = (planId: string): number[] => { const p = snap.plans.find((x) => x.id === planId); return snap.goals.find((g) => g.id === p?.goalId)?.availableDays ?? [1, 3, 5]; };
  if (!snap.plans.length) return <div className="scroll"><h1>Plan</h1><div className="card"><h3>No plan yet</h3><div className="sub">Create a push-up goal on Home to generate a plan. Routines can be scheduled in Routines.</div></div></div>;
  return <div className="scroll"><h1>Plan</h1>
    {advice.advice === 'reassess' && <div className="note warn"><b>{advice.missedRecent} sessions missed recently.</b> Life happens. Reschedule only what fits; we won't stack missed sessions together. If this keeps up, consider lowering your weekly sessions.</div>}
    {advice.advice === 'reschedule' && <div className="note warn">A session was missed. Reschedule it or skip it. Both are fine.</div>}
    <h2>This week</h2>
    <div className="card">{week.map((iso) => {
      const st = dayState(iso, today, snap.sessions, snap.planDays, null, trainDays); const pd = snap.planDays.find((d) => d.date === iso);
      return <div key={iso} className="row between" style={{ padding: '6px 0' }}><span>{formatDate(iso, cal, true)}{iso === today ? ' · today' : ''}</span>
        <span className="sub">{pd ? `${pd.current.sets} × ${pd.current.reps} · ${st === 'none' ? pd.status : st}` : trainDays.includes(weekday(iso)) ? '' : 'Rest day (planned)'}</span></div>; })}</div>
    <h2>Upcoming sessions</h2>
    {upcoming.map((d) => {
      const changed = JSON.stringify(d.original) !== JSON.stringify(d.current) || d.originalDate !== d.date;
      return <div key={d.id} className="card"><div className="row between"><b>{formatDate(d.date, cal, true)}</b><span className="sub">{d.status === 'missed' ? 'needs a decision' : d.status}</span></div>
        <div>{d.current.sets} × {d.current.reps} {exerciseById(d.current.exerciseId)?.name}{d.current.deload ? ' · lighter week' : ''}</div>
        {changed && <div className="sub">Original plan: {d.original.sets} × {d.original.reps}{d.originalDate !== d.date ? ` on ${formatDate(d.originalDate, cal)}` : ''}</div>}
        {d.reason && <div className="sub">Why: {d.reason}</div>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="sm" onClick={async () => { const to = await run(() => svc.reschedule(d.id, availFor(d.planId), today)); if (to) toast(`Moved to ${formatDate(to, cal, true)}`); else if (to === null) toast('No free day that keeps your recovery gaps. Try skipping instead.'); }}>Reschedule</button>
          <button className="sm" onClick={() => run(() => svc.skipDay(d.id))}>Skip</button></div></div>; })}
    <h2>Calendar</h2>
    <MonthHeat selected={picked} onPick={setPicked} />
    {picked && <DayDetail iso={picked} />}
  </div>;
}
