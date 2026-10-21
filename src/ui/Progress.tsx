import { useState } from 'react';
import { addDays, currentMonth, ethiopianToIso, startOfWeek } from '../domain/calendar.ts';
import { bestSet, completionRate, goalProgress, totalReps, trainingFrequency } from '../domain/analytics.ts';
import { exerciseById } from '../domain/catalog.ts';
import { qualifies } from '../domain/habit.ts';
import { computeStreak } from '../services/derive.ts';
import { Bar, DayDetail, MonthHeat, SessionDetail, Stat, useApp } from './shared.tsx';

type Period = 'week' | 'month' | 'all';
export function Progress() {
  const { snap, today, cal } = useApp();
  const [period, setPeriod] = useState<Period>('month'); const [picked, setPicked] = useState<string | null>(null);
  const ws = snap.settings.weekStart;
  const from = period === 'week' ? startOfWeek(today, ws) : period === 'month' ? (() => { const [y, m] = currentMonth(today, cal); return cal.system === 'ethiopian' ? ethiopianToIso(y, m, 1) : `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`; })() : undefined;
  const done = snap.sessions.filter((s) => s.status === 'completed');
  const streak = computeStreak(snap, today);
  const rate = completionRate(from ? snap.planDays.filter((d) => d.date >= from) : snap.planDays, today);
  const exIds = [...new Set(snap.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  const weeks = Array.from({ length: 8 }, (_, i) => { const w = addDays(startOfWeek(today, ws), -7 * (7 - i)); return { w, n: done.filter((s) => qualifies(s) && s.date >= w && s.date < addDays(w, 7)).length }; });
  const maxN = Math.max(1, ...weeks.map((x) => x.n));
  if (!snap.sessions.length) return <div className="scroll"><h1>Progress</h1><div className="card"><h3>No workouts logged yet</h3><div className="sub">Finish your first workout and your stats, records and calendar will appear here. They're always calculated from what you actually did.</div></div><MonthHeat selected={null} onPick={() => undefined} /></div>;
  return <div className="scroll"><h1>Progress</h1>
    <div className="row" style={{ marginBottom: 10 }}>{(['week', 'month', 'all'] as Period[]).map((p) => <button key={p} className={`chip ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'All time'}</button>)}</div>
    <div className="row wrap">
      <Stat value={trainingFrequency(snap.sessions, from ?? '0000-01-01', today)} label="workouts completed" />
      <Stat value={rate.rate === null ? '–' : `${Math.round(rate.rate * 100)}%`} label={`planned sessions done (${rate.completed}/${rate.eligible})`} />
      <Stat value={streak.current} label={`current streak (${snap.settings.habitRule === 'daily' ? 'planned days' : 'weeks'})`} />
      <Stat value={streak.longest} label="longest streak" /></div>
    <div className="sub">Planned sessions done counts days before today (and today once finished). Rest days and future sessions are excluded. Skipped sessions stay in the total; they never break streaks.</div>
    <h2>Goals</h2>
    {snap.goals.map((g) => { const p = goalProgress(g, snap.sessions, today, ws); return <div className="card" key={g.id}><div className="row between"><b>{g.title}</b><span className="sub">{g.status === 'achieved' ? 'Achieved 🎉' : `${p.current} / ${p.target}`}</span></div><Bar value={p.fraction} /><div className="sub">{p.label}</div></div>; })}
    <h2>By exercise</h2>
    {exIds.map((id) => { const ex = exerciseById(id); const reps = ex?.unit !== 'seconds';
      return <div className="card" key={id}><b>{ex?.name ?? id}</b>
        <div className="row wrap"><span className="stat"><b>{totalReps(snap.sessions, id, from, today)}</b><span>total {reps ? 'reps' : 'seconds'} {period === 'all' ? '' : 'this period'}</span></span>
          <span className="stat"><b>{bestSet(snap.sessions, id)}</b><span>{reps ? 'best set (consecutive reps)' : 'longest hold (s)'}</span></span></div></div>; })}
    <div className="sub">Reps and seconds are never added together. Total reps adds every completed set; best set is the most in a single set.</div>
    <h2>Weekly consistency</h2>
    <div className="card"><div className="bars">{weeks.map((x) => <div key={x.w}><i style={{ height: `${(x.n / maxN) * 80}px` }} />{x.n}</div>)}</div><div className="sub">Qualifying sessions per week, last 8 weeks</div></div>
    <h2>Calendar</h2>
    <MonthHeat selected={picked} onPick={setPicked} />{picked && <DayDetail iso={picked} />}
    <h2>History</h2>
    {[...done].reverse().slice(0, 15).map((s) => <SessionDetail key={s.id} s={s} />)}
  </div>;
}
