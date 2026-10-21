import type { Decision, Outcome, Prescription, ProgressionConfig, ProgressionState, SetStatus, Variation } from './types.ts';
import { variationExerciseId } from './catalog.ts';

export interface SetResult { status: SetStatus; prescribed: number; actual: number | null }
export interface Feedback { effort: number | null; pain: boolean }
export interface EvalResult { outcome: Outcome; reason: string; requiresReview: boolean; state: ProgressionState }

/** Exercise-specific strategies plug in here. Only push-up is implemented and tested. */
export interface ProgressionStrategy {
  id: string;
  stepFor(level: number): number;
  prescribe(level: number, variation: Variation, deload: boolean): Prescription;
  evaluate(state: ProgressionState, presc: Prescription, sets: SetResult[], fb: Feedback, cfg: ProgressionConfig): EvalResult;
}

const setsFor = (level: number): number => (level < 10 ? 3 : level < 25 ? 4 : 5);

export const pushUpStrategy: ProgressionStrategy = {
  id: 'pushup',
  stepFor: (level) => (level < 15 ? 1 : level < 30 ? 2 : 3),
  prescribe(level, variation, deload) {
    let sets = setsFor(level);
    const volume = 1.8 * level; // working volume well below repeated maximal efforts
    const reps = Math.max(2, Math.round(volume / sets));
    if (deload) sets = Math.max(2, sets - 1);
    return { exerciseId: variationExerciseId(variation), variation, unit: 'reps', sets, reps, restSec: level < 10 ? 60 : level < 25 ? 90 : 120, level, deload };
  },
  evaluate(state, presc, sets, fb, cfg) {
    const s = { ...state };
    if (fb.pain) {
      s.successStreak = 0;
      return { outcome: 'review_pain', requiresReview: true, state: s,
        reason: 'You reported pain. Stop the painful movement and review your exercise choice (or see a health professional) before continuing. Your workload has not been increased.' };
    }
    const total = Math.max(sets.length, 1);
    const done = sets.filter((x) => x.status === 'done');
    const ratio = done.length / total;
    const allMet = ratio === 1 && done.every((x) => (x.actual ?? 0) >= x.prescribed);
    const avgFrac = sets.reduce((a, x) => a + (x.status === 'done' && x.prescribed > 0 ? Math.min(1.5, (x.actual ?? 0) / x.prescribed) : 0), 0) / total;
    const struggling = (fb.effort !== null && fb.effort >= cfg.strugglingEffort) || ratio < 0.5 || avgFrac < 0.7;
    const cut = (l: number) => Math.max(1, Math.floor(l * (1 - cfg.reduceFraction)));

    if (struggling) {
      s.successStreak = 0; s.struggleStreak += 1; s.level = cut(s.level);
      if (s.struggleStreak >= cfg.struggleLimit) {
        if (s.variation === 'standard') {
          s.variation = 'incline';
          return { outcome: 'modify_exercise', requiresReview: true, state: s, reason: 'Several sessions in a row were too hard. We moved you to incline push-ups at a lower workload. Consider re-testing your maximum before progressing again.' };
        }
        return { outcome: 'reassess', requiresReview: true, state: s, reason: 'Several sessions in a row were too hard. Re-test your current maximum and adjust your goal or schedule; the workload has been reduced meanwhile.' };
      }
      return { outcome: 'reduce', requiresReview: false, state: s, reason: 'That session was too demanding, so the next one is a little lighter. Recovery matters as much as effort.' };
    }
    s.struggleStreak = 0;
    const manageable = fb.effort === null || fb.effort <= cfg.effortMax;
    if (allMet && manageable) {
      s.successStreak += 1;
      if (s.successStreak >= cfg.successesRequired) {
        s.successStreak = 0; s.level += pushUpStrategy.stepFor(s.level);
        if (s.variation === 'incline' && s.level >= cfg.promoteIncline) {
          s.variation = 'standard'; s.level = Math.max(4, Math.round(s.level * 0.5));
          return { outcome: 'progress', requiresReview: false, state: s, reason: 'You built a solid base on incline push-ups. Next session moves to standard push-ups at a conservative workload.' };
        }
        return { outcome: 'progress', requiresReview: false, state: s, reason: 'You completed every prescribed set with manageable effort. Your next session increases slightly.' };
      }
      return { outcome: 'maintain', requiresReview: false, state: s, reason: `Good session. We'll repeat this workload to confirm it feels manageable (${s.successStreak}/${cfg.successesRequired}).` };
    }
    s.successStreak = 0;
    return { outcome: 'maintain', requiresReview: false, state: s,
      reason: allMet ? 'You finished all sets but it felt hard, so the workload stays the same while you build consistency.' : "You completed part of today's plan. We'll keep the workload steady while you build consistency." };
  },
};
export const STRATEGIES: Record<string, ProgressionStrategy> = { pushup: pushUpStrategy };

export function makeDecisionRecord(id: string, sessionId: string, planId: string, before: ProgressionState, r: EvalResult, now: string): Decision {
  return { id, sessionId, planId, outcome: r.outcome, reason: r.reason, requiresReview: r.requiresReview, before, after: r.state, createdAt: now };
}
