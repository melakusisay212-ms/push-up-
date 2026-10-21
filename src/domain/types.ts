import type { IsoDate } from './calendar.ts';
export type { IsoDate };

export type Unit = 'reps' | 'seconds';
export type Variation = 'standard' | 'incline' | 'knee';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export interface ExerciseDefinition {
  id: string; name: string; unit: Unit; equipment: string[]; family: string;
  difficulty: number; instructions: string; muscles: string[];
  /** id of an implemented ProgressionStrategy, or null = no automated progression yet */
  progression: string | null;
}

/** What the app asks the user to do in one exercise. Snapshotted into sessions, never mutated afterwards. */
export interface Prescription {
  exerciseId: string; variation: Variation; unit: Unit;
  sets: number; reps: number; restSec: number; level: number; deload: boolean;
}

export type GoalCategory = 'performance' | 'habit' | 'combined';
/** Distinct metrics: consecutive reps in ONE set is NOT the same as total reps in a session. */
export type GoalMetric = 'max_consecutive' | 'total_per_session' | 'duration_seconds' | 'sessions_per_week' | 'total_sessions';
export type HabitRule = 'daily' | 'weekly';

export interface Goal {
  id: string; title: string; category: GoalCategory;
  exerciseId: string | null; metric: GoalMetric;
  baseline: number; target: number; deadline: IsoDate | null;
  sessionsPerWeek: number; availableDays: number[]; // ISO weekdays, Mon=1
  equipment: string[]; experience: Experience; limitations: string;
  status: 'active' | 'achieved' | 'archived'; createdAt: string;
}

export type DayStatus = 'scheduled' | 'completed' | 'skipped' | 'missed';
export interface PlanDay {
  id: string; planId: string; date: IsoDate; originalDate: IsoDate; status: DayStatus;
  original: Prescription; current: Prescription; reason: string;
}
export interface ProgressionState { level: number; variation: Variation; successStreak: number; struggleStreak: number }
export interface ProgressionConfig {
  successesRequired: number; effortMax: number; strugglingEffort: number;
  reduceFraction: number; struggleLimit: number; progressEvery: number; promoteIncline: number;
}
export const DEFAULT_PROGRESSION: ProgressionConfig = {
  successesRequired: 1, effortMax: 7, strugglingEffort: 9, reduceFraction: 0.1, struggleLimit: 2, progressEvery: 2, promoteIncline: 12,
};
export interface PlanMeta { startDate: IsoDate; trainDays: number[]; state: ProgressionState; config: ProgressionConfig; milestones: { date: IsoDate; level: number }[]; warnings: string[] }
export interface Plan { id: string; goalId: string; version: number; active: boolean; createdAt: string; meta: PlanMeta }

export type SetStatus = 'pending' | 'done' | 'skipped';
export interface SetLog { id: string; sessionExerciseId: string; index: number; status: SetStatus; prescribed: number; actual: number | null }
export interface SessionExercise { id: string; sessionId: string; position: number; exerciseId: string; name: string; unit: Unit; restSec: number; sets: SetLog[] }
export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned';
export interface Session {
  id: string; planDayId: string | null; routineId: string | null; title: string; date: IsoDate; status: SessionStatus;
  startedAt: string; endedAt: string | null; effort: number | null; pain: boolean; painNote: string; notes: string;
  prescription: Prescription | null; exercises: SessionExercise[];
}
export interface RoutineExercise { exerciseId: string; sets: number; target: number; restSec: number; notes: string }
export interface Routine {
  id: string; name: string; description: string; exercises: RoutineExercise[]; trainingDays: number[];
  goalId: string | null; paused: boolean; restBetweenExercisesSec: number; updatedAt: string;
}
export type Outcome = 'progress' | 'maintain' | 'reduce' | 'modify_exercise' | 'review_pain' | 'reassess';
export interface Decision {
  id: string; sessionId: string; planId: string; outcome: Outcome; reason: string; requiresReview: boolean;
  before: ProgressionState; after: ProgressionState; createdAt: string;
}
export interface ReminderSettings { enabled: boolean; time: string; missedEnabled: boolean; missedTime: string }
export interface Settings {
  reminders: ReminderSettings; habitRule: HabitRule; weekStart: number;
  calendar: 'ethiopian' | 'gregorian'; script: 'latin' | 'amharic';
}
export const DEFAULT_SETTINGS: Settings = {
  reminders: { enabled: false, time: '18:00', missedEnabled: false, missedTime: '20:30' },
  habitRule: 'weekly', weekStart: 1, calendar: 'ethiopian', script: 'latin',
};
