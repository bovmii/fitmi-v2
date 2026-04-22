// Training history sub-tab. Lists past workouts (most recent first).
// Tap a card to open a detail drawer with full set breakdown, total
// volume, duration and actions (Save as template, Delete).

import { icon } from '../../core/icons.js';
import { confirmModal, showToast } from '../../core/ui.js';
import { DB } from '../../core/db.js';
import { formatDateFr } from '../../core/date.js';
import {
  getRecentWorkouts, getWorkoutComposition, computeVolume,
  buildTemplateFromWorkout, saveTemplate,
} from './data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

export async function renderHistory(host) {
  host.innerHTML = `<div data-list></div>`;
  await refresh();

  async function refresh() {
    const list = host.querySelector('[data-list]');
    const workouts = await getRecentWorkouts(100);
    if (workouts.length === 0) {
      list.innerHTML = `<div class="settings-hint" style="padding:36px 0;text-align:center;">Aucune séance terminée.</div>`;
      return;
    }

    const summaries = await Promise.all(workouts.map(async (w) => {
      const groups = await getWorkoutComposition(w.id);
      const totalSets = groups.reduce((s, g) => s + g.sets.filter((x) => x.reps || x.weight).length, 0);
      const muscleGroups = [...new Set(groups.map((g) => g.exercise.muscleGroup))].filter(Boolean);
      const volume = groups.reduce((s, g) => s + computeVolume(g.sets), 0);
      const seconds = w.durationSeconds || Math.round((new Date(w.endedAt) - new Date(w.startedAt)) / 1000);
      return { w, groups, totalSets, muscleGroups, volume, seconds };
    }));

    list.innerHTML = summaries.map(({ w, muscleGroups, totalSets, volume, seconds }) => `
      <button class="training-card history-card" data-id="${w.id}">
        <div class="training-card-head">
          <div>
            <div class="training-card-title">${muscleGroups.join(' · ') || 'Séance'}</div>
            <div class="training-card-date">${formatDateFr(w.startedAt.slice(0, 10))}</div>
          </div>
          <div class="training-card-duration">${fmtDuration(seconds)}</div>
        </div>
        <div class="training-card-stats">
          <span>${totalSets} série${totalSets > 1 ? 's' : ''}</span>
          ${volume > 0 ? `<span>${Math.round(volume)} kg total</span>` : ''}
        </div>
      </button>
    `).join('');

    list.querySelectorAll('[data-id]').forEach((card) => {
      card.onclick = async () => {
        const id = card.dataset.id;
        await openWorkoutDetail(id);
        await refresh();
      };
    });
  }
}

export function openWorkoutDetail(workoutId) {
  return new Promise(async (resolve) => {
    const [workout, groups] = await Promise.all([
      DB.get('workouts', workoutId),
      getWorkoutComposition(workoutId),
    ]);
    if (!workout) { resolve(null); return; }

    const totalSets = groups.reduce((s, g) => s + g.sets.filter((x) => x.reps || x.weight).length, 0);
    const muscleGroups = [...new Set(groups.map((g) => g.exercise.muscleGroup))].filter(Boolean);
    const volume = groups.reduce((s, g) => s + computeVolume(g.sets), 0);
    const seconds = workout.durationSeconds || Math.round((new Date(workout.endedAt) - new Date(workout.startedAt)) / 1000);

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = `
      <div class="drawer">
        <div class="drawer-header">
          <h2>${muscleGroups.join(' · ') || 'Séance'}</h2>
          <button class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
        </div>
        <div class="drawer-body">
          <div class="workout-summary">
            <div class="summary-cell"><span>Date</span><strong>${formatDateFr(workout.startedAt.slice(0, 10))}</strong></div>
            <div class="summary-cell"><span>Durée</span><strong>${fmtDuration(seconds)}</strong></div>
            <div class="summary-cell"><span>Séries</span><strong>${totalSets}</strong></div>
            <div class="summary-cell"><span>Volume</span><strong>${Math.round(volume)} kg</strong></div>
          </div>

          ${groups.map((g) => `
            <div class="ex-group" style="margin-top:10px;">
              <div class="ex-group-head">
                <div class="ex-group-name">${escapeHtml(g.exercise.name)}</div>
                <div class="ex-group-muscle">${escapeHtml(g.exercise.muscleGroup || '')}</div>
              </div>
              <div class="set-list">
                ${g.sets.filter((s) => s.reps || s.weight).map((s, i) => `
                  <div class="set-row readonly">
                    <span class="set-num">${i + 1}</span>
                    <span class="set-readonly">${s.reps}</span>
                    <span class="set-sep">×</span>
                    <span class="set-readonly">${s.weight}</span>
                    <span class="set-unit">kg</span>
                  </div>
                `).join('') || '<div class="settings-hint">Aucune série enregistrée.</div>'}
              </div>
            </div>
          `).join('')}

          <div class="form-actions" style="margin-top:18px;">
            <button class="settings-btn" data-save-template>${icon('archive', { size: 16 })}<span>Enregistrer comme modèle</span></button>
            <button class="settings-btn danger" data-delete>${icon('trash', { size: 16 })}<span>Supprimer cette séance</span></button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (value) => { overlay.remove(); resolve(value); };
    overlay.querySelector('[data-close]').onclick = () => close(null);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

    overlay.querySelector('[data-save-template]').onclick = async () => {
      const name = prompt('Nom du modèle :', muscleGroups.join(' · ') || 'Séance');
      if (!name) return;
      const exercises = await buildTemplateFromWorkout(workoutId);
      if (exercises.length === 0) { showToast('Aucune série à enregistrer.'); return; }
      await saveTemplate({ name, exercises });
      showToast(`Modèle "${name}" créé.`);
      close({ templated: true });
    };

    overlay.querySelector('[data-delete]').onclick = async () => {
      const ok = await confirmModal('Supprimer cette séance et toutes ses séries ?', { confirmText: 'Supprimer', danger: true });
      if (!ok) return;
      // Soft-delete sets + workout
      for (const g of groups) {
        for (const s of g.sets) await DB.delete('sets', s.id);
      }
      await DB.delete('workouts', workoutId);
      close({ deleted: true });
    };
  });
}
