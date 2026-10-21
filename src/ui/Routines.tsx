import { useState } from 'react';
import type { Routine, RoutineExercise } from '../domain/types.ts';
import { CATALOG, exerciseById } from '../domain/catalog.ts';
import { formatDate, weekdayName } from '../domain/calendar.ts';
import { newId } from '../domain/id.ts';
import { Sheet, WeekdayChips, useApp } from './shared.tsx';

const empty = (): Routine => ({ id: newId('rt'), name: '', description: '', exercises: [], trainingDays: [], goalId: null, paused: false, restBetweenExercisesSec: 60, updatedAt: new Date().toISOString() });
export function Routines() {
  const { snap, svc, today, go, run, toast, cal } = useApp();
  const [edit, setEdit] = useState<Routine | null>(null);
  const save = (r: Routine) => run(async () => { await svc.store.saveRoutine({ ...r, updatedAt: new Date().toISOString() }); setEdit(null); toast('Routine saved. Past workouts are unchanged.'); });
  return <div className="scroll"><h1>Routines</h1>
    <button className="primary big" onClick={() => setEdit(empty())}>+ New routine</button>
    {!snap.routines.length && <div className="card" style={{ marginTop: 12 }}><h3>No routines yet</h3><div className="sub">Build a reusable workout from the exercise catalog: choose exercises, sets, reps or seconds, rest, and training days.</div></div>}
    {snap.routines.map((r) => <div className="card" key={r.id} style={{ marginTop: 12 }}>
      <div className="row between"><h3>{r.name}</h3>{r.paused && <span className="sub">paused</span>}</div>
      {r.description && <div className="sub">{r.description}</div>}
      {r.exercises.map((e, i) => <div key={i} className="sub">{exerciseById(e.exerciseId)?.name}: {e.sets} × {e.target}{exerciseById(e.exerciseId)?.unit === 'seconds' ? 's' : ''}, rest {e.restSec}s</div>)}
      {r.trainingDays.length > 0 && <div className="sub">Days: {r.trainingDays.map((d) => weekdayName(d, cal)).join(', ')}</div>}
      {r.goalId && <div className="sub">Goal: {snap.goals.find((g) => g.id === r.goalId)?.title ?? 'removed'}</div>}
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button className="primary sm" disabled={r.paused} onClick={() => run(async () => { await svc.startRoutineSession(r.id, today); go('workout'); })}>Start</button>
        <button className="sm" onClick={() => setEdit({ ...r })}>Edit</button>
        <button className="sm" onClick={() => save({ ...r, id: newId('rt'), name: `${r.name} (copy)` })}>Duplicate</button>
        <button className="sm" onClick={() => save({ ...r, paused: !r.paused })}>{r.paused ? 'Resume' : 'Pause'}</button>
        <button className="sm danger" onClick={() => { if (confirm(`Delete "${r.name}"? Your completed workouts stay in your history.`)) run(() => svc.store.deleteRoutine(r.id)); }}>Delete</button></div></div>)}
    {edit && <Editor r={edit} onSave={save} onClose={() => setEdit(null)} />}
    <div className="sub" style={{ marginTop: 8 }}>Today is {formatDate(today, cal, true)}. Routines with training days send reminders if enabled in Settings.</div>
  </div>;
}
function Editor({ r, onSave, onClose }: { r: Routine; onSave: (r: Routine) => void; onClose: () => void }) {
  const { snap } = useApp();
  const [d, setD] = useState<Routine>(r);
  const setEx = (i: number, p: Partial<RoutineExercise>) => setD({ ...d, exercises: d.exercises.map((e, k) => (k === i ? { ...e, ...p } : e)) });
  const move = (i: number, by: number) => { const a = [...d.exercises]; const j = i + by; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setD({ ...d, exercises: a }); };
  const errors: string[] = [];
  if (!d.name.trim()) errors.push('Give the routine a name.');
  if (!d.exercises.length) errors.push('Add at least one exercise.');
  if (d.exercises.some((e) => !Number.isInteger(e.sets) || e.sets < 1 || !Number.isInteger(e.target) || e.target < 1)) errors.push('Sets and targets must be whole numbers of at least 1.');
  return <Sheet onClose={onClose}><h1>{snap.routines.some((x) => x.id === r.id) ? 'Edit routine' : 'New routine'}</h1>
    <label className="f">Name</label><input type="text" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
    <label className="f">Description (optional)</label><input type="text" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
    <h2>Exercises</h2>
    {d.exercises.map((e, i) => { const ex = exerciseById(e.exerciseId); return <div className="card" key={i}>
      <div className="row between"><b>{i + 1}. {ex?.name}</b><div className="row"><button className="sm" aria-label="Move up" onClick={() => move(i, -1)}>↑</button><button className="sm" aria-label="Move down" onClick={() => move(i, 1)}>↓</button><button className="sm danger" aria-label="Remove" onClick={() => setD({ ...d, exercises: d.exercises.filter((_, k) => k !== i) })}>✕</button></div></div>
      {ex && <div className="sub">{ex.equipment.length ? `Needs: ${ex.equipment.join(', ')}` : 'No equipment'} · {ex.instructions}</div>}
      <div className="row"><div className="grow"><label className="f">Sets</label><input type="number" inputMode="numeric" min={1} value={e.sets} onChange={(ev) => setEx(i, { sets: Number(ev.target.value) })} /></div>
        <div className="grow"><label className="f">{ex?.unit === 'seconds' ? 'Seconds' : 'Reps'}</label><input type="number" inputMode="numeric" min={1} value={e.target} onChange={(ev) => setEx(i, { target: Number(ev.target.value) })} /></div>
        <div className="grow"><label className="f">Rest (s)</label><input type="number" inputMode="numeric" min={0} value={e.restSec} onChange={(ev) => setEx(i, { restSec: Number(ev.target.value) })} /></div></div>
      <label className="f">Note (optional)</label><input type="text" value={e.notes} onChange={(ev) => setEx(i, { notes: ev.target.value })} /></div>; })}
    <select value="" aria-label="Add exercise" onChange={(e) => { const x = exerciseById(e.target.value); if (x) setD({ ...d, exercises: [...d.exercises, { exerciseId: x.id, sets: 3, target: x.unit === 'seconds' ? 30 : 8, restSec: 60, notes: '' }] }); }}>
      <option value="">+ Add exercise…</option>{CATALOG.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}</select>
    <label className="f">Rest between exercises (s)</label><input type="number" inputMode="numeric" min={0} value={d.restBetweenExercisesSec} onChange={(e) => setD({ ...d, restBetweenExercisesSec: Number(e.target.value) })} />
    <label className="f">Training days (optional, used for reminders)</label><WeekdayChips value={d.trainingDays} onChange={(v) => setD({ ...d, trainingDays: v })} />
    <label className="f">Linked goal (optional)</label>
    <select value={d.goalId ?? ''} onChange={(e) => setD({ ...d, goalId: e.target.value || null })}><option value="">None</option>{snap.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
    {errors.map((e) => <div key={e} className="note bad">{e}</div>)}
    <div className="row" style={{ marginTop: 16 }}><button className="grow" onClick={onClose}>Cancel</button><button className="primary grow" disabled={errors.length > 0} onClick={() => onSave(d)}>Save routine</button></div></Sheet>;
}
