// Training tab — sub-tab router.
//   Séance     — idle / active workout view
//   Historique — past workouts + detail drawer
//   Modèles    — templates list + start-from-template

import { ensureExercisesSeeded } from './data.js';
import { renderWorkoutView } from './workout-view.js';
import { renderHistory } from './history.js';
import { renderTemplates } from './templates.js';

const SUBTABS = [
  { key: 'session',   label: 'Séance' },
  { key: 'history',   label: 'Historique' },
  { key: 'templates', label: 'Modèles' },
];
const STORAGE_KEY = 'fitmi.trainingTab';

export async function mount(root) {
  const initial = (SUBTABS.find((t) => t.key === localStorage.getItem(STORAGE_KEY)) || SUBTABS[0]).key;

  root.innerHTML = `
    <div class="training-page">
      <div class="page-header">
        <h1 class="page-title">Training</h1>
      </div>
      <div class="settings-segment" data-seg>
        ${SUBTABS.map((t) => `<button data-sub="${t.key}" class="${t.key === initial ? 'active' : ''}">${t.label}</button>`).join('')}
      </div>
      <div data-subhost></div>
    </div>
  `;

  await ensureExercisesSeeded();

  const host = root.querySelector('[data-subhost]');
  let currentRef = null;

  async function show(key) {
    localStorage.setItem(STORAGE_KEY, key);
    root.querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === key));
    if (currentRef?.stop) currentRef.stop();
    currentRef = null;
    host.innerHTML = '';
    if (key === 'session')   currentRef = await renderWorkoutView(host);
    else if (key === 'history') await renderHistory(host);
    else if (key === 'templates') await renderTemplates(host, {
      onStart: () => show('session'),
    });
  }

  root.querySelectorAll('[data-sub]').forEach((b) => {
    b.onclick = () => show(b.dataset.sub);
  });

  await show(initial);

  return { stop: () => currentRef?.stop?.() };
}
