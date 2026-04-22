// Training tab entry point.
//
// Phase 4d1 scope is one view: the workout page. Phase 4d2 adds a
// second sub-tab (Historique). The sub-tab scaffold is already here
// so 4d2 can slot in without touching this file.

import { ensureExercisesSeeded } from './data.js';
import { renderWorkoutView } from './workout-view.js';

export async function mount(root) {
  root.innerHTML = `
    <div class="training-page">
      <div class="page-header">
        <h1 class="page-title">Training</h1>
      </div>
      <div data-host></div>
    </div>
  `;

  // First-time setup: pre-seed the exercise library if empty.
  await ensureExercisesSeeded();

  const host = root.querySelector('[data-host]');
  let ref = await renderWorkoutView(host);

  return {
    stop: () => ref?.stop?.(),
  };
}
