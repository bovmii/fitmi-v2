// Renders either the idle state ("Commencer une séance" + recent
// workouts) or the active workout state (elapsed timer, grouped
// exercises with their sets, quick add set row, finish button).

import { icon } from '../../core/icons.js';
import { confirmModal, showToast } from '../../core/ui.js';
import { formatDateFr } from '../../core/date.js';
import {
  getActiveWorkout, startWorkout, finishWorkout, cancelWorkout,
  getRecentWorkouts, getWorkoutComposition, computeVolume,
  addSet, updateSet, deleteSet,
} from './data.js';
import { openExercisePicker } from './exercises-picker.js';
import { startRestTimer, stopRestTimer } from './rest-timer.js';

const DEFAULT_REST_SECONDS = 90;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m} min`;
  return `${s}s`;
}

export async function renderWorkoutView(host) {
  let active = await getActiveWorkout();
  let tickerId = null;

  async function render() {
    if (tickerId) { clearInterval(tickerId); tickerId = null; }
    active = await getActiveWorkout();
    if (active) await renderActive();
    else await renderIdle();
  }

  async function renderIdle() {
    const recent = await getRecentWorkouts(6);
    host.innerHTML = `
      <div class="training-idle">
        <button class="fab-cta" data-start>${icon('plus', { size: 20 })}<span>Commencer une séance</span></button>
        <div class="section-head" style="margin-top:8px;"><h2>Récentes</h2></div>
        <div data-recent></div>
      </div>
    `;
    host.querySelector('[data-start]').onclick = async () => {
      await startWorkout();
      await render();
    };

    const recentHost = host.querySelector('[data-recent]');
    if (recent.length === 0) {
      recentHost.innerHTML = `<div class="settings-hint" style="padding:14px 0;text-align:center;">Aucune séance pour l'instant.</div>`;
      return;
    }
    // Render each with its composition summary (muscle groups + volume).
    const cards = await Promise.all(recent.map(async (w) => {
      const groups = await getWorkoutComposition(w.id);
      const totalSets = groups.reduce((s, g) => s + g.sets.length, 0);
      const muscleGroups = [...new Set(groups.map((g) => g.exercise.muscleGroup))].join(', ');
      const volume = groups.reduce((s, g) => s + computeVolume(g.sets), 0);
      const seconds = w.durationSeconds || Math.round((new Date(w.endedAt) - new Date(w.startedAt)) / 1000);
      return { w, groups, totalSets, muscleGroups, volume, seconds };
    }));
    recentHost.innerHTML = cards.map(({ w, totalSets, muscleGroups, volume, seconds }) => `
      <div class="training-card">
        <div class="training-card-head">
          <div>
            <div class="training-card-title">${muscleGroups || 'Séance'}</div>
            <div class="training-card-date">${formatDateFr(w.startedAt.slice(0, 10))}</div>
          </div>
          <div class="training-card-duration">${fmtDuration(seconds)}</div>
        </div>
        <div class="training-card-stats">
          <span>${totalSets} série${totalSets > 1 ? 's' : ''}</span>
          ${volume > 0 ? `<span>${Math.round(volume)} kg total</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  async function renderActive() {
    host.innerHTML = `
      <div class="workout-active">
        <div class="workout-head">
          <div>
            <div class="workout-title" data-title>Séance en cours</div>
            <div class="workout-elapsed" data-elapsed>00:00</div>
          </div>
          <button class="icon-btn" data-cancel title="Annuler la séance">${icon('x', { size: 20 })}</button>
        </div>
        <div data-exercises></div>
        <button class="fab-cta" data-add-ex>${icon('plus', { size: 20 })}<span>Ajouter un exercice</span></button>
        <button class="settings-btn" data-finish style="justify-content:center;background:var(--accent);color:var(--bg);border-color:var(--accent);font-weight:700;">
          ${icon('check', { size: 16 })}<span>Terminer la séance</span>
        </button>
      </div>
    `;

    host.querySelector('[data-cancel]').onclick = async () => {
      const ok = await confirmModal('Annuler la séance ? Les séries déjà loguées seront supprimées.', { confirmText: 'Annuler', danger: true, cancelText: 'Garder' });
      if (!ok) return;
      await cancelWorkout(active.id);
      stopRestTimer();
      await render();
    };

    host.querySelector('[data-add-ex]').onclick = async () => {
      const ex = await openExercisePicker({ title: 'Ajouter un exercice' });
      if (!ex) return;
      // Insert a placeholder set with 0/0 so the exercise appears in the list.
      await addSet({ workoutId: active.id, exerciseId: ex.id, reps: 0, weight: 0 });
      await refreshComposition();
    };

    host.querySelector('[data-finish]').onclick = async () => {
      const groups = await getWorkoutComposition(active.id);
      const totalSets = groups.reduce((s, g) => s + g.sets.length, 0);
      if (totalSets === 0) {
        const ok = await confirmModal('Terminer sans aucune série ?', { confirmText: 'Terminer', danger: true });
        if (!ok) return;
      }
      stopRestTimer();
      const finished = await finishWorkout(active.id);
      showToast(`Séance terminée — ${groups.length} exercice${groups.length > 1 ? 's' : ''}, ${totalSets} série${totalSets > 1 ? 's' : ''}`);
      await render();
    };

    // Elapsed ticker
    tickerId = setInterval(() => {
      const el = host.querySelector('[data-elapsed]');
      if (!el) return;
      const sec = Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000);
      el.textContent = fmtDuration(sec).replace(' ', '');
    }, 1000);

    await refreshComposition();
  }

  async function refreshComposition() {
    const groupsHost = host.querySelector('[data-exercises]');
    if (!groupsHost) return;
    const groups = await getWorkoutComposition(active.id);
    host.querySelector('[data-title]').textContent =
      groups.length === 0 ? 'Séance en cours' : [...new Set(groups.map((g) => g.exercise.muscleGroup))].join(' · ');

    if (groups.length === 0) {
      groupsHost.innerHTML = `<div class="settings-hint" style="padding:14px 0;text-align:center;">Ajoute un exercice pour démarrer.</div>`;
      return;
    }

    groupsHost.innerHTML = groups.map((g) => `
      <div class="ex-group" data-exercise="${g.exercise.id}">
        <div class="ex-group-head">
          <div class="ex-group-name">${escapeHtml(g.exercise.name)}</div>
          <div class="ex-group-muscle">${escapeHtml(g.exercise.muscleGroup)}</div>
        </div>
        <div class="set-list">
          ${g.sets.filter((s) => s.reps || s.weight).map((s, i) => `
            <div class="set-row" data-set="${s.id}">
              <span class="set-num">${i + 1}</span>
              <input type="number" inputmode="numeric" data-reps value="${s.reps}" min="0">
              <span class="set-sep">×</span>
              <input type="number" inputmode="decimal" data-weight value="${s.weight}" min="0" step="0.5">
              <span class="set-unit">kg</span>
              <button class="icon-btn" data-remove>${icon('trash', { size: 14 })}</button>
            </div>
          `).join('')}
        </div>
        <button class="settings-btn" data-add-set>${icon('plus', { size: 14 })}<span>Ajouter une série</span></button>
      </div>
    `).join('');

    groupsHost.querySelectorAll('.ex-group').forEach((group) => {
      const exerciseId = group.dataset.exercise;
      group.querySelectorAll('.set-row').forEach((row) => {
        const setId = row.dataset.set;
        const repsEl = row.querySelector('[data-reps]');
        const weightEl = row.querySelector('[data-weight]');
        repsEl.onchange = () => updateSet(setId, { reps: repsEl.value });
        weightEl.onchange = () => updateSet(setId, { weight: weightEl.value });
        row.querySelector('[data-remove]').onclick = async () => {
          await deleteSet(setId);
          await refreshComposition();
        };
      });

      group.querySelector('[data-add-set]').onclick = async () => {
        const comp = await getWorkoutComposition(active.id);
        const entry = comp.find((g) => g.exercise.id === exerciseId);
        // Prefill from the last real set of this exercise (reps, weight)
        const lastReal = [...(entry?.sets || [])].reverse().find((s) => s.reps || s.weight);
        const reps = lastReal?.reps || 10;
        const weight = lastReal?.weight || 0;
        await addSet({ workoutId: active.id, exerciseId, reps, weight });
        await refreshComposition();
        // Fire the rest timer.
        startRestTimer({ seconds: DEFAULT_REST_SECONDS });
      };
    });
  }

  await render();

  // Cleanup hook for the sub-tab host.
  return { stop: () => { if (tickerId) clearInterval(tickerId); stopRestTimer(); } };
}
