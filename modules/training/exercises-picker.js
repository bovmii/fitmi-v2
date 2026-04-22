// Drawer that lists every exercise by muscle group with a search
// field and a "new exercise" form at the top. Resolves with the
// picked exercise, or null if the user cancels.

import { icon } from '../../core/icons.js';
import { confirmModal } from '../../core/ui.js';
import {
  getAllExercises, saveExercise, deleteExercise, MUSCLE_GROUPS,
} from './data.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function normalize(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function openExercisePicker({ title = 'Choisir un exercice' } = {}) {
  return new Promise((resolve) => {
    let state = { query: '', filter: null, creating: false, newName: '', newGroup: MUSCLE_GROUPS[0] };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = wrapper();
    document.body.appendChild(overlay);
    bind();
    refresh();

    function wrapper() {
      return `
        <div class="drawer">
          <div class="drawer-header">
            <h2>${escapeHtml(title)}</h2>
            <button class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
          </div>
          <div class="drawer-body">
            <div class="amount-row" style="margin-bottom:8px;">
              <input type="search" data-query placeholder="Rechercher un exercice…" value="${escapeHtml(state.query)}">
              <span class="amount-currency">${icon('search', { size: 16 })}</span>
            </div>
            <div class="filter-chips" data-filters></div>
            <div data-list></div>
            <div class="settings-section" style="margin-top:18px;">
              <div class="settings-section-title">Ajouter un exercice</div>
              <form class="sub-form" data-new-form>
                <div class="form-row">
                  <input type="text" name="name" placeholder="Nom de l'exercice" required>
                  <select name="muscleGroup">
                    ${MUSCLE_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join('')}
                  </select>
                </div>
                <button type="submit" class="auth-submit">Créer</button>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    function close(value) { overlay.remove(); resolve(value); }

    function bind() {
      overlay.querySelector('[data-close]').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

      overlay.querySelector('[data-query]').oninput = (e) => {
        state.query = e.target.value;
        refresh();
        overlay.querySelector('[data-query]').focus();
      };

      overlay.querySelector('[data-new-form]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (!String(fd.get('name') || '').trim()) return;
        const saved = await saveExercise({ name: fd.get('name'), muscleGroup: fd.get('muscleGroup') });
        close(saved);
      });
    }

    async function refresh() {
      const all = await getAllExercises();
      const q = normalize(state.query);
      const filtered = all.filter((e) => {
        if (state.filter && e.muscleGroup !== state.filter) return false;
        if (q && !normalize(e.name).includes(q)) return false;
        return true;
      });

      const filters = overlay.querySelector('[data-filters]');
      filters.innerHTML = `
        <button class="chip ${state.filter === null ? 'active' : ''}" data-filter="">Tous</button>
        ${MUSCLE_GROUPS.map((g) => `<button class="chip ${state.filter === g ? 'active' : ''}" data-filter="${g}">${g}</button>`).join('')}
      `;
      filters.querySelectorAll('[data-filter]').forEach((b) => {
        b.onclick = () => { state.filter = b.dataset.filter || null; refresh(); };
      });

      const list = overlay.querySelector('[data-list]');
      if (filtered.length === 0) {
        list.innerHTML = `<div class="settings-hint" style="padding:14px 0;text-align:center;">Aucun exercice${q ? ` pour "${escapeHtml(state.query)}"` : ''}.</div>`;
        return;
      }

      // Group visually by muscleGroup.
      const groups = {};
      for (const ex of filtered) {
        if (!groups[ex.muscleGroup]) groups[ex.muscleGroup] = [];
        groups[ex.muscleGroup].push(ex);
      }
      list.innerHTML = Object.entries(groups).map(([group, items]) => `
        <div class="settings-section-title" style="margin:12px 0 6px;">${escapeHtml(group)}</div>
        ${items.map((ex) => `
          <div class="ex-row" data-id="${ex.id}">
            <button class="ex-pick" data-pick>
              <span class="ex-pick-name">${escapeHtml(ex.name)}</span>
              ${ex.custom ? '<span class="ex-pick-tag">perso</span>' : ''}
            </button>
            ${ex.custom ? `<button class="icon-btn" data-delete title="Supprimer">${icon('trash', { size: 16 })}</button>` : ''}
          </div>
        `).join('')}
      `).join('');

      list.querySelectorAll('[data-pick]').forEach((btn) => {
        btn.onclick = () => {
          const id = btn.closest('.ex-row').dataset.id;
          const ex = filtered.find((e) => e.id === id);
          if (ex) close(ex);
        };
      });
      list.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const id = btn.closest('.ex-row').dataset.id;
          const ok = await confirmModal('Supprimer cet exercice ?', { confirmText: 'Supprimer', danger: true });
          if (!ok) return;
          await deleteExercise(id);
          await refresh();
        };
      });
    }
  });
}
