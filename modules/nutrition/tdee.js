// TDEE calculator modal. Mifflin-St Jeor formula with an activity
// multiplier and a goal adjustment. Macros default to 30/40/30
// (protein/carbs/fat) — the user can still edit them manually in
// "manuel" coach mode on the settings page later.

import { icon } from '../../core/icons.js';
import { showToast } from '../../core/ui.js';
import { setNutritionTargets, setTdeeProfile, getTdeeProfile } from './data.js';

const ACTIVITY = [
  { key: 'sedentary',  label: 'Sédentaire',   factor: 1.2,   hint: 'Travail assis, pas de sport' },
  { key: 'light',      label: 'Léger',        factor: 1.375, hint: '1 à 3 séances / semaine' },
  { key: 'moderate',   label: 'Modéré',       factor: 1.55,  hint: '3 à 5 séances / semaine' },
  { key: 'intense',    label: 'Intense',      factor: 1.725, hint: '6 à 7 séances / semaine' },
  { key: 'very_intense', label: 'Très intense', factor: 1.9, hint: 'Sport 2× / jour, métier physique' },
];

const GOAL = [
  { key: 'lose',     label: 'Perte',    delta: -500 },
  { key: 'maintain', label: 'Maintien', delta: 0 },
  { key: 'gain',     label: 'Prise',    delta: 300 },
];

function computeBMR({ sex, weight, height, age }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === 'F' ? base - 161 : base + 5;
}

function computeTdee(profile) {
  if (!profile?.weight || !profile?.height || !profile?.age) return null;
  const bmr = computeBMR(profile);
  const act = ACTIVITY.find((a) => a.key === profile.activity) || ACTIVITY[1];
  const goal = GOAL.find((g) => g.key === profile.goal) || GOAL[1];
  const target = Math.round(bmr * act.factor + goal.delta);
  return { bmr: Math.round(bmr), tdee: Math.round(bmr * act.factor), target };
}

// 30 / 40 / 30 of target calories, grams by macro (4/4/9 kcal/g).
function computeMacros(targetKcal) {
  return {
    protein: Math.round((targetKcal * 0.30) / 4),
    carbs:   Math.round((targetKcal * 0.40) / 4),
    fat:     Math.round((targetKcal * 0.30) / 9),
  };
}

export function openTdeeModal({ onSave } = {}) {
  return new Promise(async (resolve) => {
    const existing = (await getTdeeProfile()) || {};
    const state = {
      sex:      existing.sex      || 'M',
      age:      existing.age      || 30,
      height:   existing.height   || 175,
      weight:   existing.weight   || 75,
      activity: existing.activity || 'moderate',
      goal:     existing.goal     || 'maintain',
    };

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.innerHTML = render();
    document.body.appendChild(overlay);
    bind();

    function render() {
      const calc = computeTdee(state);
      return `
        <form class="drawer habit-form">
          <div class="drawer-header">
            <h2>Calculer mes besoins</h2>
            <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
          </div>
          <div class="drawer-body">

            <div class="auth-field">
              <span>Sexe</span>
              <div class="settings-segment">
                <button type="button" data-sex="M" class="${state.sex === 'M' ? 'active' : ''}">Homme</button>
                <button type="button" data-sex="F" class="${state.sex === 'F' ? 'active' : ''}">Femme</button>
              </div>
            </div>

            <div class="form-grid-3">
              <label class="auth-field">
                <span>Âge</span>
                <input type="number" min="10" max="100" name="age" value="${state.age}">
              </label>
              <label class="auth-field">
                <span>Taille cm</span>
                <input type="number" min="80" max="230" name="height" value="${state.height}">
              </label>
              <label class="auth-field">
                <span>Poids kg</span>
                <input type="number" min="25" max="250" step="0.1" name="weight" value="${state.weight}">
              </label>
            </div>

            <div class="auth-field">
              <span>Activité</span>
              <div class="tdee-radio-list">
                ${ACTIVITY.map((a) => `
                  <button type="button" class="tdee-radio ${state.activity === a.key ? 'active' : ''}" data-activity="${a.key}">
                    <span class="tdee-radio-label">${a.label}</span>
                    <span class="tdee-radio-hint">${a.hint}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="auth-field">
              <span>Objectif</span>
              <div class="settings-segment">
                ${GOAL.map((g) => `
                  <button type="button" data-goal="${g.key}" class="${state.goal === g.key ? 'active' : ''}">${g.label}</button>
                `).join('')}
              </div>
            </div>

            <div class="tdee-preview">
              <div class="tdee-preview-row"><span>BMR</span><strong>${calc ? calc.bmr + ' kcal' : '—'}</strong></div>
              <div class="tdee-preview-row"><span>Maintenance</span><strong>${calc ? calc.tdee + ' kcal' : '—'}</strong></div>
              <div class="tdee-preview-row"><span>Objectif</span><strong class="accent">${calc ? calc.target + ' kcal' : '—'}</strong></div>
              ${calc ? macroPreview(calc.target) : ''}
            </div>

            <button type="submit" class="auth-submit">Enregistrer mes objectifs</button>
          </div>
        </form>
      `;
    }

    function macroPreview(target) {
      const m = computeMacros(target);
      return `
        <div class="tdee-macros">
          <span class="macro-pill prot">${m.protein} g protéines</span>
          <span class="macro-pill carb">${m.carbs} g glucides</span>
          <span class="macro-pill fat">${m.fat} g lipides</span>
        </div>
      `;
    }

    function refresh() {
      overlay.innerHTML = render();
      bind();
    }

    function close(value) {
      overlay.remove();
      resolve(value);
    }

    function bind() {
      overlay.querySelector('[data-close]').onclick = () => close(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

      overlay.querySelectorAll('[data-sex]').forEach((b) => {
        b.onclick = () => { state.sex = b.dataset.sex; refresh(); };
      });
      overlay.querySelectorAll('[data-goal]').forEach((b) => {
        b.onclick = () => { state.goal = b.dataset.goal; refresh(); };
      });
      overlay.querySelectorAll('[data-activity]').forEach((b) => {
        b.onclick = () => { state.activity = b.dataset.activity; refresh(); };
      });
      ['age', 'height', 'weight'].forEach((name) => {
        const el = overlay.querySelector(`input[name="${name}"]`);
        el.oninput = (e) => { state[name] = Number(e.target.value); refresh(); el.focus(); };
      });

      overlay.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const calc = computeTdee(state);
        if (!calc) return;
        const macros = computeMacros(calc.target);
        await setTdeeProfile(state);
        await setNutritionTargets({
          kcal: calc.target,
          protein: macros.protein,
          carbs:   macros.carbs,
          fat:     macros.fat,
          coach:   'auto',
        });
        showToast('Objectifs nutrition mis à jour');
        onSave?.();
        close({ profile: state, target: calc.target, macros });
      });
    }
  });
}

export { computeTdee, computeMacros };
