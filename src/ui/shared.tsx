import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { CalendarPrefs, IsoDate } from '../domain/calendar.ts';
import { addDays, ethMonthLength, ethiopianToIso, formatDate, isoToEthiopian, monthGrid, monthName, shiftMonth, currentMonth, weekdayName } from '../domain/calendar.ts';
import type { SetLog, Session } from '../domain/types.ts';
import { dayState } from '../domain/habit.ts';
import type { DayState } from '../domain/habit.ts';
import type { Snapshot, WorkoutService } from '../services/workouts.ts';
import { sessionRatio } from '../domain/habit.ts';

export type Tab = 'home' | 'plan' | 'workout' | 'progress' | 'routines' | 'settings';
export interface AppCtx {
  snap: Snapshot; svc: WorkoutService; today: IsoDate; cal: CalendarPrefs;
  refresh: () => Promise<void>; go: (t: Tab) => void; toast: (m: string) => void;
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  wizard: boolean; setWizard: (v: boolean) => void;
}
export const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx { const c = useContext(Ctx); if (!c) throw new Error('App context missing'); return c; }

export const Bar = ({ value }: { value: number }) => <div className="bar"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} /></div>;
export const Stat = ({ value, label }: { value: ReactNode; label: string }) => <div className="stat card"><b>{value}</b><span>{label}</span></div>;
export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="sheet" onClick={onClose}><div onClick={(e) => e.stopPropagation()}>{children}</div></div>;
}
export function WeekdayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { cal } = useApp();
  return <div className="row wrap">{[1, 2, 3, 4, 5, 6, 7].map((d) =>
    <button key={d} type="button" className={`chip ${value.includes(d) ? 'on' : ''}`} aria-pressed={value.includes(d)}
      onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}>{weekdayName(d, cal)}</button>)}</div>;
}
/** Date input in the user's calendar. Stores and returns a Gregorian ISO string; shows Ethiopian selects by default. */
export function DateInput({ value, onChange, minIso }: { value: IsoDate | null; onChange: (v: IsoDate | null) => void; minIso: IsoDate }) {
  const { cal } = useApp();
  const base = value ?? addDays(minIso, 84);
  if (cal.system === 'gregorian') return <input type="date" value={value ?? ''} min={minIso} onChange={(e) => onChange(e.target.value || null)} />;
  const [y, m, d] = isoToEthiopian(base);
  const set = (yy: number, mm: number, dd: number) => onChange(ethiopianToIso(yy, mm, Math.min(dd, ethMonthLength(yy, mm))));
  const [y0] = isoToEthiopian(minIso);
  return <div className="row">
    <select aria-label="Day" value={value ? d : ''} onChange={(e) => set(y, m, Number(e.target.value))}>{!value && <option value="">Day</option>}{Array.from({ length: ethMonthLength(y, m) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
    <select aria-label="Month" value={value ? m : ''} onChange={(e) => set(y, Number(e.target.value), d)}>{!value && <option value="">Month</option>}{Array.from({ length: 13 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1, cal)}</option>)}</select>
    <select aria-label="Year" value={value ? y : ''} onChange={(e) => set(Number(e.target.value), m, d)}>{!value && <option value="">Year</option>}{[y0, y0 + 1, y0 + 2, y0 + 3].map((yy) => <option key={yy} value={yy}>{yy}</option>)}</select>
  </div>;
}
export function SetRow({ set, unit, current, onLog, onSkip, onClear }: { set: SetLog; unit: string; current?: boolean; onLog: (n: number) => void; onSkip: () => void; onClear: () => void }) {
  const [val, setVal] = useState(set.actual !== null ? String(set.actual) : '');
  const n = Number(val); const valid = val.trim() !== '' && Number.isInteger(n) && n >= 0;
  return <div className={`setrow ${current ? 'cur' : ''}`}>
    <span className="n">{set.index + 1}</span>
    <input type="number" inputMode="numeric" min={0} value={val} placeholder={`${set.prescribed}`} aria-label={`Set ${set.index + 1} actual ${unit}`} style={{ width: 92 }} onChange={(e) => setVal(e.target.value)} />
    <button className="primary sm" disabled={!valid} onClick={() => onLog(n)} aria-label="Save set">{set.status === 'done' ? 'Update' : 'Save'}</button>
    {set.status === 'pending' && <button className="sm" onClick={onSkip}>Skip</button>}
    {set.status === 'skipped' && <span className="sub">skipped</span>}
    {set.status !== 'pending' && <button className="sm ghost" onClick={() => { setVal(''); onClear(); }} aria-label="Clear set">Undo</button>}
  </div>;
}
export function SessionDetail({ s }: { s: Session }) {
  const { svc, run, cal } = useApp();
  return <div className="card">
    <div className="row between"><h3>{s.title}</h3><span className="sub">{Math.round(sessionRatio(s) * 100)}% of sets</span></div>
    <div className="sub">{formatDate(s.date, cal)} · {s.status === 'completed' ? 'completed' : s.status.replace('_', ' ')}{s.effort ? ` · effort ${s.effort}/10` : ''}</div>
    {s.pain && <div className="note warn">Pain reported{s.painNote ? `: ${s.painNote}` : ''}</div>}
    {s.exercises.map((e) => <div key={e.id}><h3 style={{ marginTop: 10 }}>{e.name} <span className="sub">({e.unit})</span></h3>
      {e.sets.map((x) => <SetRow key={x.id + x.status + x.actual} set={x} unit={e.unit}
        onLog={(n) => run(() => svc.logSet(s.id, x.id, n))} onSkip={() => run(() => svc.skipSet(s.id, x.id))} onClear={() => run(() => svc.clearSet(s.id, x.id))} />)}</div>)}
    {s.notes && <div className="sub">Notes: {s.notes}</div>}
  </div>;
}
const LABEL: Record<DayState, string> = { done: 'Completed', partial: 'Partial', missed: 'Missed (review)', skipped: 'Skipped', scheduled: 'Planned', rest: 'Rest day', none: 'No activity' };
export function MonthHeat({ selected, onPick }: { selected: IsoDate | null; onPick: (iso: IsoDate) => void }) {
  const { snap, today, cal } = useApp();
  const [[y, m], setYm] = useState<[number, number]>(currentMonth(today, cal));
  const grid = monthGrid(y, m, cal, snap.settings.weekStart);
  const dates = snap.planDays.map((d) => d.date).sort();
  const range = dates.length ? { start: snap.plans[0]?.meta.startDate ?? dates[0], end: dates[dates.length - 1] } : null;
  const trainDays = [...new Set(snap.plans.flatMap((p) => p.meta.trainDays))];
  const order = snap.settings.weekStart === 7 ? [7, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7];
  return <div className="card">
    <div className="row between"><button className="sm" aria-label="Previous month" onClick={() => setYm(shiftMonth(y, m, -1, cal))}>‹</button><b>{grid.title}</b><button className="sm" aria-label="Next month" onClick={() => setYm(shiftMonth(y, m, 1, cal))}>›</button></div>
    <div className="grid7" style={{ marginTop: 10 }}>{order.map((d) => <div className="dow" key={d}>{weekdayName(d, cal)}</div>)}
      {grid.cells.map((c, i) => {
        if (!c) return <div key={i} className="cell empty" />;
        const st = dayState(c.iso, today, snap.sessions, snap.planDays, range, trainDays);
        return <button key={i} className={`cell ${st} ${c.iso === today ? 'today' : ''}`} style={selected === c.iso ? { outline: '2px solid var(--ink)' } : undefined} aria-label={`${formatDate(c.iso, cal)}: ${LABEL[st]}`} onClick={() => onPick(c.iso)}>{c.day}</button>;
      })}</div>
    <div className="legend">{(['done', 'partial', 'rest', 'scheduled', 'missed', 'skipped'] as DayState[]).map((k) => <span key={k}><i className={`cell ${k}`} style={{ aspectRatio: 'auto' }} />{LABEL[k]}</span>)}</div>
  </div>;
}
export function DayDetail({ iso }: { iso: IsoDate }) {
  const { snap, cal } = useApp();
  const sessions = snap.sessions.filter((s) => s.date === iso); const pd = snap.planDays.find((d) => d.date === iso);
  return <div><h2>{formatDate(iso, cal, true)}</h2>
    {pd && <div className="card"><b>Planned: {pd.current.sets} × {pd.current.reps} {pd.current.exerciseId.replace('_', ' ')}</b> <span className="sub">({pd.status})</span>
      {pd.reason && <div className="sub">{pd.reason}</div>}
      {JSON.stringify(pd.original) !== JSON.stringify(pd.current) && <div className="sub">Originally {pd.original.sets} × {pd.original.reps}</div>}</div>}
    {sessions.map((s) => <SessionDetail key={s.id} s={s} />)}
    {!pd && !sessions.length && <div className="sub">Nothing planned or logged on this day.</div>}</div>;
}
