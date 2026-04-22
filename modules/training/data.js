// Training data layer. Three stores:
//   exercises  { id, name, muscleGroup, custom }
//   workouts   { id, startedAt, endedAt?, notes? }
//   sets       { id, workoutId, exerciseId, order, reps, weight, completedAt }
//
// "Active workout" — the id of the session currently in progress — is
// kept in localStorage, not synced. Workouts are physical: resuming an
// in-flight session from another device doesn't make sense. The
// workout record itself lives in IndexedDB and syncs like everything
// else; only the pointer-to-active is device-local.

import { DB } from '../../core/db.js';
import { uuid } from '../../core/ids.js';
import { SEED_EXERCISES } from './seed.js';
import { Bus } from '../../core/bus.js';

const ACTIVE_WORKOUT_KEY = 'fitmi.activeWorkout';

export const MUSCLE_GROUPS = [
  'Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Jambes', 'Abdominaux', 'Cardio',
];

// ---- Seed ----

export async function ensureExercisesSeeded() {
  const existing = await DB.getAllActive('exercises');
  if (existing.length > 0) return { seeded: 0 };
  let seeded = 0;
  for (const ex of SEED_EXERCISES) {
    await DB.put('exercises', {
      id: uuid(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      custom: false,
    });
    seeded++;
  }
  return { seeded };
}

// ---- Exercises ----

export async function getAllExercises() {
  const rows = await DB.getAllActive('exercises');
  return rows.sort((a, b) => {
    const g = (a.muscleGroup || '').localeCompare(b.muscleGroup || '', 'fr');
    return g || (a.name || '').localeCompare(b.name || '', 'fr');
  });
}

export async function getExercise(id) {
  const row = await DB.get('exercises', id);
  return row && !row.deletedAt ? row : null;
}

export async function saveExercise({ id, name, muscleGroup }) {
  const existing = id ? await getExercise(id) : null;
  const ex = {
    id: id || uuid(),
    name: (name || '').trim(),
    muscleGroup: muscleGroup || 'Autre',
    custom: existing ? existing.custom !== false : true,
  };
  await DB.put('exercises', ex);
  return ex;
}

export async function deleteExercise(id) {
  await DB.delete('exercises', id);
}

// ---- Workouts ----

export async function getActiveWorkoutId() {
  return localStorage.getItem(ACTIVE_WORKOUT_KEY) || null;
}

export async function getActiveWorkout() {
  const id = await getActiveWorkoutId();
  if (!id) return null;
  const row = await DB.get('workouts', id);
  if (!row || row.deletedAt || row.endedAt) {
    localStorage.removeItem(ACTIVE_WORKOUT_KEY);
    return null;
  }
  return row;
}

export async function startWorkout() {
  const workout = {
    id: uuid(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    notes: '',
  };
  await DB.put('workouts', workout);
  localStorage.setItem(ACTIVE_WORKOUT_KEY, workout.id);
  return workout;
}

export async function finishWorkout(workoutId, { notes = '' } = {}) {
  const workout = await DB.get('workouts', workoutId);
  if (!workout) return null;
  const endedAt = new Date().toISOString();
  const durationSeconds = Math.round((new Date(endedAt) - new Date(workout.startedAt)) / 1000);
  const finished = { ...workout, endedAt, durationSeconds, notes };
  await DB.put('workouts', finished);
  localStorage.removeItem(ACTIVE_WORKOUT_KEY);
  Bus.emit('workout.logged', { workout: finished });
  return finished;
}

export async function cancelWorkout(workoutId) {
  // Soft-delete the workout AND every set attached to it.
  const sets = await getSetsForWorkout(workoutId);
  for (const s of sets) await DB.delete('sets', s.id);
  await DB.delete('workouts', workoutId);
  localStorage.removeItem(ACTIVE_WORKOUT_KEY);
}

export async function getRecentWorkouts(limit = 10) {
  const rows = await DB.getAllActive('workouts');
  return rows
    .filter((w) => w.endedAt)
    .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
    .slice(0, limit);
}

export async function getTodayWorkout() {
  const rows = await getRecentWorkouts(30);
  const today = new Date().toISOString().slice(0, 10);
  return rows.find((w) => (w.startedAt || '').slice(0, 10) === today) || null;
}

// ---- Sets ----

export async function getSetsForWorkout(workoutId) {
  const rows = await DB.getByIndex('sets', 'workoutId', workoutId);
  return rows
    .filter((s) => !s.deletedAt)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function addSet({ workoutId, exerciseId, reps, weight }) {
  const existing = await getSetsForWorkout(workoutId);
  const forExercise = existing.filter((s) => s.exerciseId === exerciseId);
  const set = {
    id: uuid(),
    workoutId,
    exerciseId,
    order: forExercise.length,
    reps: Number(reps) || 0,
    weight: Number(weight) || 0,
    completedAt: new Date().toISOString(),
  };
  await DB.put('sets', set);
  return set;
}

export async function updateSet(id, { reps, weight }) {
  const row = await DB.get('sets', id);
  if (!row || row.deletedAt) return null;
  const updated = { ...row };
  if (reps !== undefined) updated.reps = Number(reps) || 0;
  if (weight !== undefined) updated.weight = Number(weight) || 0;
  await DB.put('sets', updated);
  return updated;
}

export async function deleteSet(id) {
  await DB.delete('sets', id);
}

// Returns a map exerciseId → { exercise, sets[] } for the given workout,
// preserving insertion order of the first time each exercise appears.
export async function getWorkoutComposition(workoutId) {
  const [sets, allExercises] = await Promise.all([
    getSetsForWorkout(workoutId),
    getAllExercises(),
  ]);
  const byId = new Map(allExercises.map((e) => [e.id, e]));
  const groups = new Map(); // exerciseId -> { exercise, sets[] }
  for (const s of sets) {
    const ex = byId.get(s.exerciseId);
    if (!ex) continue;
    if (!groups.has(s.exerciseId)) groups.set(s.exerciseId, { exercise: ex, sets: [] });
    groups.get(s.exerciseId).sets.push(s);
  }
  return Array.from(groups.values());
}

// Total training volume = sum of reps × weight across every set.
export function computeVolume(sets) {
  return (sets || []).reduce((s, r) => s + (r.reps || 0) * (r.weight || 0), 0);
}

// ---- Templates ----

export async function getAllTemplates() {
  const rows = await DB.getAllActive('templates');
  return rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
}

export async function getTemplate(id) {
  const row = await DB.get('templates', id);
  return row && !row.deletedAt ? row : null;
}

export async function saveTemplate({ id, name, exercises, createdAt }) {
  const tmpl = {
    id: id || uuid(),
    name: (name || '').trim(),
    exercises: (exercises || []).map((ex) => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      muscleGroup: ex.muscleGroup || '',
      sets: (ex.sets || []).map((s) => ({
        reps: Number(s.reps) || 0,
        weight: Number(s.weight) || 0,
      })),
    })),
    createdAt: createdAt || new Date().toISOString(),
  };
  await DB.put('templates', tmpl);
  return tmpl;
}

export async function deleteTemplate(id) {
  await DB.delete('templates', id);
}

// Derive a template from the current composition of a workout (strip
// zero-reps-AND-zero-weight placeholder sets, keep exercises that have
// at least one real set).
export async function buildTemplateFromWorkout(workoutId) {
  const groups = await getWorkoutComposition(workoutId);
  const exercises = groups.map((g) => {
    const sets = g.sets.filter((s) => (s.reps || 0) > 0 || (s.weight || 0) > 0);
    return {
      exerciseId: g.exercise.id,
      exerciseName: g.exercise.name,
      muscleGroup: g.exercise.muscleGroup || '',
      sets: sets.map((s) => ({ reps: s.reps, weight: s.weight })),
    };
  }).filter((ex) => ex.sets.length > 0);
  return exercises;
}

// Start a new workout from a template: creates the workout, then
// inserts every template set as a real set. Returns the workout.
export async function startFromTemplate(templateId) {
  const tmpl = await getTemplate(templateId);
  if (!tmpl) return null;
  const workout = await startWorkout();
  for (const ex of tmpl.exercises || []) {
    // Skip if the exercise has been deleted since the template was saved.
    const live = await getExercise(ex.exerciseId);
    if (!live) continue;
    const sets = ex.sets && ex.sets.length ? ex.sets : [{ reps: 0, weight: 0 }];
    for (const s of sets) {
      await addSet({
        workoutId: workout.id,
        exerciseId: ex.exerciseId,
        reps: s.reps,
        weight: s.weight,
      });
    }
  }
  return workout;
}
