import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { WorkoutService, Snapshot } from '../services/workouts.ts';
import { localTodayIso } from '../domain/calendar.ts';
import type { CalendarPrefs } from '../domain/calendar.ts';
import { computeReminders } from '../domain/reminders.ts';
import { syncReminders } from '../platform/notifications.ts';
import { Ctx } from './shared.tsx';
import type { Tab } from './shared.tsx';
import { Home } from './Home.tsx';
import { Plan } from './Plan.tsx';
import { Workout } from './Workout.tsx';
import { Progress } from './Progress.tsx';
import { Routines } from './Routines.tsx';
import { SettingsScreen } from './Settings.tsx';
import { GoalWizard } from './GoalWizard.tsx';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' }, { id: 'plan', label: 'Plan', icon: '▦' }, { id: 'workout', label: 'Workout', icon: '●' },
  { id: 'progress', label: 'Progress', icon: '↗' }, { id: 'routines', label: 'Routines', icon: '☰' },
];
export function App({ svc }: { svc: WorkoutService }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [today, setToday] = useState(localTodayIso());
  const [tab, setTab] = useState<Tab>('home');
  const [wizard, setWizard] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const busy = useRef(false);
  const toast = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); }, []);
  const refresh = useCallback(async () => {
    const t = localTodayIso(); // re-read each time: handles midnight and time-zone changes without rewriting stored history
    await svc.refreshMissed(t);
    const s = await svc.snapshot(); setSnap(s); setToday(t);
    try { await syncReminders(computeReminders({ planDays: s.planDays, routines: s.routines, sessions: s.sessions, settings: s.settings.reminders, now: new Date(), today: t })); } catch { /* reminders are best-effort */ }
  }, [svc]);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined; busy.current = true; // swallows repeated taps while a write is in flight
    try { const r = await fn(); await refresh(); return r; } catch (e) { toast(e instanceof Error ? e.message : 'Something went wrong.'); await refresh().catch(() => undefined); return undefined; } finally { busy.current = false; }
  }, [refresh, toast]);
  useEffect(() => { refresh().catch((e) => toast(String(e))); const f = () => { if (document.visibilityState === 'visible') refresh().catch(() => undefined); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, [refresh, toast]);
  if (!snap) return <div className="scroll">Loading…</div>;
  const cal: CalendarPrefs = { system: snap.settings.calendar, script: snap.settings.script };
  const screens: Record<Tab, ReactNode> = { home: <Home />, plan: <Plan />, workout: <Workout />, progress: <Progress />, routines: <Routines />, settings: <SettingsScreen /> };
  return <Ctx.Provider value={{ snap, svc, today, cal, refresh, go: setTab, toast, run, wizard, setWizard }}>
    <div className="app">
      <header className="top"><b>Tsinat · ጽናት</b><button className="sm ghost" aria-label="Settings" onClick={() => setTab('settings')}>⚙</button></header>
      {screens[tab]}
      <nav className="tabs" aria-label="Main">{TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}><span className="ic">{t.icon}</span>{t.label}</button>)}</nav>
      {wizard && <GoalWizard />}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  </Ctx.Provider>;
}
