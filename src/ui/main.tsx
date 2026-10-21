import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './styles.css';
import { migrate } from '../data/migrations.ts';
import { Store } from '../data/repo.ts';
import { WorkoutService } from '../services/workouts.ts';
import { openCapacitorDb } from '../platform/capacitorDb.ts';
import { App } from './App.tsx';

const root = createRoot(document.getElementById('root')!);
async function boot() {
  if (!Capacitor.isNativePlatform()) {
    root.render(<div className="scroll"><h1>Tsinat</h1><div className="card"><h3>Android app only</h3><p className="sub">Tsinat stores your workouts in a real on-device database and uses Android notifications. Install the APK built by GitHub Actions to use it. A plain browser can't keep your data safely, so it is intentionally not supported.</p></div></div>);
    return;
  }
  try {
    const db = await openCapacitorDb(); await migrate(db);
    const store = new Store(db); await store.seedCatalog();
    root.render(<App svc={new WorkoutService(store)} />);
  } catch (e) {
    root.render(<div className="scroll"><h1>Couldn't open your data</h1><div className="note bad">{String(e instanceof Error ? e.message : e)}</div><p className="sub">Your data has not been changed. Restart the app; if this persists, reinstall only after exporting is available.</p></div>);
  }
}
boot();
