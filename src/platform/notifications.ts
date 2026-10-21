import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PlannedReminder } from '../domain/reminders.ts';

export type Permission = 'granted' | 'denied' | 'prompt' | 'unsupported';
export const supported = (): boolean => Capacitor.isNativePlatform();
export async function permissionState(): Promise<Permission> {
  if (!supported()) return 'unsupported';
  const r = await LocalNotifications.checkPermissions(); return r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'prompt';
}
export async function requestPermission(): Promise<Permission> {
  if (!supported()) return 'unsupported';
  const r = await LocalNotifications.requestPermissions(); return r.display === 'granted' ? 'granted' : 'denied';
}
/** Replaces every pending reminder with the freshly computed list. Stable ids + cancel-then-schedule means no duplicates.
 *  Delivery is inexact: Android may defer notifications while the device is dozing. */
export async function syncReminders(list: PlannedReminder[]): Promise<void> {
  if (!supported()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!list.length) return;
  if ((await permissionState()) !== 'granted') return;
  await LocalNotifications.createChannel({ id: 'workouts', name: 'Workout reminders', description: 'Reminders for planned workouts', importance: 3 });
  await LocalNotifications.schedule({ notifications: list.map((r) => ({ id: r.id, title: r.title, body: r.body, channelId: 'workouts', schedule: { at: r.at, allowWhileIdle: true } })) });
}
