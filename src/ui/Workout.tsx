import { useEffect, useState } from 'react';
import type { Routine, Session, SessionExercise } from '../domain/types.ts';
import { CATALOG } from '../domain/catalog.ts';
import { todayPlanDay } from '../services/derive.ts';
import type { FinishResult } from '../services/workouts.ts';
import { Bar, Sheet, SetRow, useApp } from './shared.tsx';

export function Workout() {
  const { snap, svc, today, go, run } = useApp();
  const open = snap.sessions.find((s) => s.status === 'in_progress' || s.status === 'paused');
  const [result, setResult] = useState<FinishResult | null>(null);
  if (result) return <Summary r={result} done={() => { setResult(null); go('home'); }} />;
  if (open) return <Runner key={open.id} s={open} onFinished={setResult} />;
  const day = todayPlanDay(snap, today);
  const startable = day && day.status === 'scheduled';
  return <div className="scroll"><h1>Workout</h1>
    {startable && <div className="card hero"><h3>Today: {day!.current.sets} × {day!.current.reps}</h3><button className="primary big" onClick={() => run(async () => { await svc.startPlanSession(day!.id, today); })}>Start today's workout</button></div>}
    {!startable && <div className="card"><h3>No workout scheduled right now</h3><div className="sub">{day?.status === 'completed' ? "You've already completed today's workout." : 'Rest day, or no plan yet. You can still start a routine.'}</div></div>}
    <h2>Start a routine</h2>
    {snap.routines.filter((r) => !r.paused).map((r: Routine) => <div key={r.id} className="card row between"><div><b>{r.name}</b><div className="sub">{r.exercises.length} exercises</div></div>
      <button className="primary" onClick={() => run(() => svc.startRoutineSession(r.id, today))}>Start</button></div>)}
    {!snap.routines.length && <div className="sub">No routines yet. Create one in Routines.</div>}
  </div>;
}
function Summary({ r, done }: { r: FinishResult; done: () => void }) {
  const sets = r.session.exercises.flatMap((e) => e.sets);
  return <div className="scroll"><h1>Workout saved ✓</h1>
    <div className="card"><b>{sets.filter((x) => x.status === 'done').length} of {sets.length} sets completed</b>
      {r.session.exercises.map((e) => <div key={e.id} className="sub">{e.name}: {e.sets.map((x) => (x.status === 'done' ? x.actual : '–')).join(' · ')} {e.unit}</div>)}</div>
    {r.decision && <div className={`note ${r.decision.requiresReview ? 'warn' : ''}`}><b>What happens next</b><div>{r.decision.reason}</div></div>}
    <button className="primary big" onClick={done}>Done</button></div>;
}
function Runner({ s, onFinished }: { s: Session; onFinished: (r: FinishResult) => void }) {
  const { svc, today, run } = useApp();
  const [quick, setQuick] = useState(false);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restLen, setRestLen] = useState<number>(s.exercises[0]?.restSec ?? 60);
  const [, tick] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [effort, setEffort] = useState<string>(''); const [pain, setPain] = useState(false); const [painNote, setPainNote] = useState(''); const [notes, setNotes] = useState('');
  useEffect(() => { if (restEnd === null) return; const t = setInterval(() => { tick((n) => n + 1); if (Date.now() >= restEnd) setRestEnd(null); }, 500); return () => clearInterval(t); }, [restEnd]);
  const all = s.exercises.flatMap((e) => e.sets); const handled = all.filter((x) => x.status !== 'pending').length;
  const firstPending = all.find((x) => x.status === 'pending');
  const remaining = restEnd ? Math.max(0, Math.ceil((restEnd - Date.now()) / 1000)) : 0;
  const paused = s.status === 'paused';
  const afterLog = (e: SessionExercise) => { if (all.filter((x) => x.status === 'pending').length > 1) { setRestLen(e.restSec); setRestEnd(Date.now() + e.restSec * 1000); } };
  const finish = () => run(async () => { const r = await svc.finish(s.id, { effort: effort ? Number(effort) : null, pain, painNote, notes }, today); setSheet(false); onFinished(r); });
  return <div className="scroll">
    <div className="row between"><h1>{s.title}</h1><button className="sm" onClick={() => run(() => svc.setStatus(s.id, paused ? 'in_progress' : 'paused'))}>{paused ? 'Resume' : 'Pause'}</button></div>
    <Bar value={all.length ? handled / all.length : 0} /><div className="sub" style={{ margin: '6px 0 12px' }}>{handled} of {all.length} sets handled. Saved as you go.</div>
    {paused && <div className="note">Paused. Your progress is saved. Resume whenever you're ready.</div>}
    {remaining > 0 && !paused && <div className="rest" role="timer"><div><div>Rest</div><b>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</b></div>
      <div className="row"><button className="sm" onClick={() => setRestEnd((restEnd ?? Date.now()) + 15000)}>+15s</button><button className="sm" onClick={() => setRestEnd(null)}>Skip</button></div></div>}
    <div className="row" style={{ marginBottom: 8 }}><button className={`chip ${!quick ? 'on' : ''}`} onClick={() => setQuick(false)}>Guided</button><button className={`chip ${quick ? 'on' : ''}`} onClick={() => setQuick(true)}>Quick entry</button>
      <span className="sub">Rest {restLen}s</span><button className="sm ghost" onClick={() => setRestLen(Math.max(15, restLen - 15))}>−</button><button className="sm ghost" onClick={() => setRestLen(restLen + 15)}>+</button></div>
    {s.exercises.map((e) => <div className="card" key={e.id}>
      <div className="row between"><h3>{e.name}</h3><span className="sub">{e.sets.length} sets · target {e.sets[0]?.prescribed} {e.unit}</span></div>
      {!quick && e.sets.map((x) => <SetRow key={x.id + x.status + x.actual} set={x} unit={e.unit} current={x.id === firstPending?.id}
        onLog={(n) => run(async () => { await svc.logSet(s.id, x.id, n); afterLog(e); })} onSkip={() => run(() => svc.skipSet(s.id, x.id))} onClear={() => run(() => svc.clearSet(s.id, x.id))} />)}
      {quick && <QuickEntry e={e} onSave={(vals) => run(() => svc.logQuick(s.id, e.id, vals))} />}
      <select aria-label="Substitute exercise" value="" onChange={(ev) => ev.target.value && run(() => svc.substitute(s.id, e.id, ev.target.value))} style={{ marginTop: 10 }}>
        <option value="">Substitute this exercise…</option>{CATALOG.filter((c) => c.unit === e.unit && c.id !== e.exerciseId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    </div>)}
    <button className="primary big" disabled={handled === 0} onClick={() => setSheet(true)}>Finish workout</button>
    <button className="ghost danger" style={{ marginTop: 10, width: '100%' }} onClick={() => { if (confirm('Discard this workout? Logged sets will not count.')) run(() => svc.discard(s.id)); }}>Discard workout</button>
    {sheet && <Sheet onClose={() => setSheet(false)}><h1>How did it go?</h1>
      <label className="f">Effort (optional)</label><select value={effort} onChange={(e) => setEffort(e.target.value)}><option value="">Skip</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}{n <= 3 ? ' · easy' : n <= 7 ? ' · manageable' : n <= 8 ? ' · hard' : ' · maximal'}</option>)}</select>
      <label className="f"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> I felt pain or discomfort (not just muscle effort)</label>
      {pain && <><div className="note warn">Stop any movement that hurts. We won't increase your workload. We can't diagnose injuries; see a health professional if pain continues.</div><input type="text" placeholder="Where? (optional)" value={painNote} onChange={(e) => setPainNote(e.target.value)} /></>}
      <label className="f">Notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="row" style={{ marginTop: 14 }}><button className="grow" onClick={() => setSheet(false)}>Back</button><button className="primary grow" onClick={finish}>Save workout</button></div></Sheet>}
  </div>;
}
function QuickEntry({ e, onSave }: { e: SessionExercise; onSave: (v: number[]) => void }) {
  const [txt, setTxt] = useState(e.sets.some((x) => x.status === 'done') ? e.sets.filter((x) => x.status === 'done').map((x) => x.actual).join(', ') : '');
  const vals = txt.split(/[,\s]+/).filter(Boolean).map(Number); const ok = vals.length > 0 && vals.every((n) => Number.isInteger(n) && n >= 0);
  return <div><label className="f">Actual {e.unit} per set, separated by commas (e.g. {e.sets.map((x) => x.prescribed).join(', ')})</label>
    <input type="text" inputMode="numeric" value={txt} onChange={(ev) => setTxt(ev.target.value)} /><button className="primary" style={{ marginTop: 8 }} disabled={!ok} onClick={() => onSave(vals)}>Save sets</button></div>;
}
