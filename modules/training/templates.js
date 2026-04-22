// Templates sub-tab. Lists saved templates, each card shows the
// muscle groups covered and the exercise count. Tap to view / delete
// in a drawer. A "Démarrer" affordance lets the user start a new
// workout from the template.

import { icon } from '../../core/icons.js';
import { confirmModal, showToast } from '../../core/ui.js';
import { getAllTemplates, deleteTemplate, startFromTemplate, getActiveWorkout } from './data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export async function renderTemplates(host, { onStart } = {}) {
  host.innerHTML = `<div data-list></div>`;
  await refresh();

  async function refresh() {
    const list = host.querySelector('[data-list]');
    const templates = await getAllTemplates();
    if (templates.length === 0) {
      list.innerHTML = `
        <div class="settings-hint" style="padding:36px 20px;text-align:center;line-height:1.6;">
          Aucun modèle pour l'instant.<br>
          Enregistre une séance terminée depuis l'historique pour créer ton premier modèle.
        </div>
      `;
      return;
    }
    list.innerHTML = templates.map((t) => {
      const groups = [...new Set((t.exercises || []).map((e) => e.muscleGroup).filter(Boolean))];
      const sets = (t.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);
      return `
        <div class="training-card" data-id="${t.id}">
          <div class="training-card-head">
            <div>
              <div class="training-card-title">${escapeHtml(t.name)}</div>
              <div class="training-card-date">${groups.join(' · ') || '—'}</div>
            </div>
            <div class="training-card-duration">${(t.exercises || []).length} ex.</div>
          </div>
          <div class="training-card-stats">
            <span>${sets} série${sets > 1 ? 's' : ''} planifiée${sets > 1 ? 's' : ''}</span>
          </div>
          <div class="template-actions">
            <button class="settings-btn" data-start>${icon('play', { size: 14 })}<span>Démarrer</span></button>
            <button class="settings-btn danger" data-delete>${icon('trash', { size: 14 })}<span>Supprimer</span></button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-start]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.closest('[data-id]').dataset.id;
        const active = await getActiveWorkout();
        if (active) {
          const ok = await confirmModal(
            'Une séance est déjà en cours. La terminer et démarrer le modèle ?',
            { confirmText: 'Démarrer', cancelText: 'Annuler' },
          );
          if (!ok) return;
        }
        await startFromTemplate(id);
        showToast('Séance démarrée depuis le modèle.');
        onStart?.();
      };
    });

    list.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.closest('[data-id]').dataset.id;
        const ok = await confirmModal('Supprimer ce modèle ?', { confirmText: 'Supprimer', danger: true });
        if (!ok) return;
        await deleteTemplate(id);
        await refresh();
      };
    });
  }
}
