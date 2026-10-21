import type { ExerciseDefinition } from './types.ts';
export const CATALOG: ExerciseDefinition[] = [
  { id: 'pushup', name: 'Push-up', unit: 'reps', equipment: [], family: 'pushup', difficulty: 3, progression: 'pushup',
    instructions: 'Hands under shoulders, body in one line, lower the chest until the elbows are about 90 degrees, press back up.', muscles: ['chest', 'triceps', 'shoulders', 'core'] },
  { id: 'pushup_incline', name: 'Incline push-up', unit: 'reps', equipment: ['bench or sturdy surface'], family: 'pushup', difficulty: 2, progression: 'pushup',
    instructions: 'Hands on a raised, stable surface. Same body line as a push-up; a higher surface is easier.', muscles: ['chest', 'triceps', 'shoulders'] },
  { id: 'pushup_knee', name: 'Knee push-up', unit: 'reps', equipment: [], family: 'pushup', difficulty: 2, progression: 'pushup',
    instructions: 'Knees on the floor, body in a line from knees to head, lower and press.', muscles: ['chest', 'triceps', 'shoulders'] },
  { id: 'plank', name: 'Plank', unit: 'seconds', equipment: [], family: 'plank', difficulty: 2, progression: null,
    instructions: 'Forearms on the floor, body straight from head to heels, breathe steadily.', muscles: ['core'] },
  { id: 'squat', name: 'Bodyweight squat', unit: 'reps', equipment: [], family: 'squat', difficulty: 1, progression: null,
    instructions: 'Feet shoulder-width, sit back and down with a flat back, stand tall.', muscles: ['quads', 'glutes'] },
  { id: 'pullup', name: 'Pull-up', unit: 'reps', equipment: ['pull-up bar'], family: 'pullup', difficulty: 4, progression: null,
    instructions: 'Hang from a bar, pull until the chin clears it, lower with control.', muscles: ['back', 'biceps'] },
];
export const exerciseById = (id: string): ExerciseDefinition | undefined => CATALOG.find((e) => e.id === id);
export const variationExerciseId = (v: 'standard' | 'incline' | 'knee'): string => (v === 'standard' ? 'pushup' : v === 'incline' ? 'pushup_incline' : 'pushup_knee');
