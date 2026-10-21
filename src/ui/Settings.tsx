import { useEffect, useState } from 'react';
import type { Settings as S } from '../domain/types.ts';
import { permissionState, requestPermission, supported } from '../platform/notifications.ts';
import type { Permission } from '../platform/notifications.ts';
import { useApp } from './shared.tsx';

export function SettingsScreen() {
  const { snap, svc, run, refresh, toast } = useApp();
  const s = snap.settings;
  const [perm, setPerm] = useState<Permission>('prompt');
  useEffect(() => { permissionState().then(setPerm).catch(() => undefined); }, []);
  const save = (p: Partial<S>) => run(async () => { await svc.store.saveSettings({ ...s, ...p }); });
  const saveRem = (p: Partial<S['reminders']>) => save({ reminders: { ...s.reminders, ...p } });
  const toggleReminders = async (on: boolean) => {
    if (!on) return saveRem({ enabled: false });
    const p = supported() ? await requestPermission() : 'unsupported';
    setPerm(p);
    if (p === 'granted') await saveRem({ enabled: true });
    else toast('Notifications are off for this app. Reminders stay disabled; Home still shows today\'s workout.');
  };
  return <div className="scroll"><h1>Settings</h1>
    <h2>Calendar</h2>
    <div className="card"><label className="f">Calendar system</label>
      <select value={s.calendar} onChange={(e) => save({ calendar: e.target.value as S['calendar'] })}><option value="ethiopian">Ethiopian (Habesha)</option><option value="gregorian">Gregorian (G.C)</option></select>
      <label className="f">Month and day names</label>
      <select value={s.script} onChange={(e) => save({ script: e.target.value as S['script'] })}><option value="latin">English letters (Meskerem…)</option><option value="amharic">አማርኛ (መስከረም…)</option></select>
      <label className="f">Week starts on</label>
      <select value={s.weekStart} onChange={(e) => save({ weekStart: Number(e.target.value) })}><option value={1}>Monday</option><option value={7}>Sunday</option></select></div>
    <h2>Habit streak</h2>
    <div className="card"><select value={s.habitRule} onChange={(e) => save({ habitRule: e.target.value as S['habitRule'] })}><option value="weekly">Weekly: hit your sessions-per-week target</option><option value="daily">Daily: finish each planned training day</option></select>
      <div className="sub" style={{ marginTop: 8 }}>Rest days never break a streak. Sessions you skip on purpose are excused. A session counts when it's finished with at least half its sets done.</div></div>
    <h2>Reminders</h2>
    <div className="card">
      <label className="row"><input type="checkbox" checked={s.reminders.enabled} onChange={(e) => toggleReminders(e.target.checked)} /> <span>Remind me on workout days</span></label>
      {perm === 'denied' && <div className="note warn">Notification permission is denied. Turn it on in Android Settings → Apps → Tsinat → Notifications. Until then, open the app to see today's workout.</div>}
      {perm === 'unsupported' && <div className="note">Reminders work only in the Android app.</div>}
      <label className="f">Reminder time</label><input type="time" value={s.reminders.time} onChange={(e) => saveRem({ time: e.target.value })} />
      <label className="row" style={{ marginTop: 12 }}><input type="checkbox" checked={s.reminders.missedEnabled} onChange={(e) => saveRem({ missedEnabled: e.target.checked })} /> <span>Gentle nudge if a workout is still open</span></label>
      {s.reminders.missedEnabled && <><label className="f">Nudge time</label><input type="time" value={s.reminders.missedTime} onChange={(e) => saveRem({ missedTime: e.target.value })} /></>}
      <div className="sub" style={{ marginTop: 8 }}>Reminders are scheduled for the next 30 days and refreshed whenever you open the app or change your plan. Android may delay notifications by a few minutes to save battery, so delivery is not exact. Nudges are never sent for sessions that are finished, skipped, or moved.</div>
      <button className="sm" style={{ marginTop: 8 }} onClick={() => refresh()}>Re-schedule now</button></div>
    <h2>About</h2><div className="card sub">Tsinat keeps everything on this phone: no account, no internet needed. Backup/export is not available yet.</div>
  </div>;
}
