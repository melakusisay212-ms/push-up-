import { formatDate } from '../domain/calendar.ts';
import { goalProgress, personalRecords, weekSessionCount } from '../domain/analytics.ts';
import { exerciseById } from '../domain/catalog.ts';
import { computeStreak, habitTarget, nextPlanDay, primaryGoal, reviewDays, sessionFor, todayPlanDay } from '../services/derive.ts';
import { Bar, Stat, useApp } from './shared.tsx';

export function Home() {
  const { snap, svc, today, cal, go, run, setWizard } = useApp();
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const goal = primaryGoal(snap);
  const day = todayPlanDay(snap, today);
  const sess = day ? sessionFor(snap, day) : null;
  const open = snap.sessions.find((s) => s.status === 'in_progress' || s.status === 'paused');
  const streak = computeStreak(snap, today);
  const week = weekSessionCount(snap.sessions, today, snap.settings.weekStart);
  const next = nextPlanDay(snap, today);
  const review = reviewDays(snap, today);
  const prog = goal ? goalProgress(goal, snap.sessions, today, snap.settings.weekStart) : null;
  const pr = goal?.exerciseId ? personalRecords(snap.sessions, [goal.exerciseId])[0] : undefined;
  const lastDecision = snap.decisions[snap.decisions.length - 1];

  const start = () => run(async () => { if (day) { await svc.startPlanSession(day.id, today); go('workout'); } });
  return <div className="scroll">
    <div className="sub">{formatDate(today, cal, true)}</div>
    <h1>{hello}</h1>
    {!goal && <div className="card hero"><h3>Set your first goal</h3><p className="sub">Tell us where you are and where you want to be. We'll build a gradual plan; everything stays on your phone.</p>
      <button className="primary big" onClick={() => setWizard(true)}>Create a goal</button></div>}
    {goal && prog && <div className="card"><div className="row between"><h3>{goal.title}</h3><span className="sub">{prog.current} / {prog.target}</span></div>
      <Bar value={prog.fraction} /><div className="sub" style={{ marginTop: 6 }}>{prog.label}{goal.deadline ? ` · by ${formatDate(goal.deadline, cal)}` : ''}</div></div>}
    {review.length > 0 && <div className="note warn"><b>{review.length} session{review.length > 1 ? 's' : ''} need a decision.</b> Reschedule or skip them in Plan. Nothing is doubled up.</div>}
    {open && <div className="card hero"><h3>Workout in progress</h3><div className="sub">{open.title}. Your logged sets are saved.</div><button className="primary big" style={{ marginTop: 10 }} onClick={() => go('workout')}>Resume workout</button></div>}
    {!open && day && day.status !== 'completed' && day.status !== 'skipped' && <div className="card hero"><div className="sub">Today's workout</div>
      <h3>{day.current.sets} sets × {day.current.reps} {exerciseById(day.current.exerciseId)?.name ?? ''}</h3>
      <div className="sub">Rest {day.current.restSec}s between sets{day.current.deload ? ' · lighter recovery week' : ''}</div>
      {day.reason && <div className="note">{day.reason}</div>}
      <button className="primary big" style={{ marginTop: 10 }} onClick={start}>{sess ? 'Resume workout' : 'Start workout'}</button></div>}
    {day?.status === 'completed' && sess && <div className="card hero"><h3>Today's workout is done ✓</h3>
      <div className="sub">{sess.exercises[0].sets.filter((x) => x.status === 'done').map((x) => x.actual).join(' · ')} reps. Nothing more to do. Recovery is part of the plan.</div></div>}
    {!open && !day && goal && <div className="card"><h3>Rest day</h3><div className="sub">Rest is planned. It's when your body adapts.{next ? ` Next workout: ${formatDate(next.date, cal, true)}.` : ''}</div></div>}
    {lastDecision && <div className="note"><b>Last adjustment:</b> {lastDecision.reason}</div>}
    <h2>This week</h2>
    <div className="row wrap"><Stat value={`${week}/${habitTarget(snap)}`} label="sessions this week" /><Stat value={streak.current} label={snap.settings.habitRule === 'daily' ? 'planned-day streak' : 'week streak'} /></div>
    {next && <div className="card"><div className="sub">Upcoming</div><b>{formatDate(next.date, cal, true)}</b> · {next.current.sets} × {next.current.reps}</div>}
    {pr && <div className="card"><div className="sub">Personal record</div><b>{pr.bestSet}</b> in one set · {pr.bestSessionTotal} total in a session</div>}
    {goal && <button className="ghost" onClick={() => setWizard(true)}>+ Add another goal</button>}
  </div>;
}
