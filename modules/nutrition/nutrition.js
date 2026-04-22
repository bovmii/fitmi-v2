// Nutrition tab. Three sub-tabs planned: Log (calories), Repas
// (weekly planner), Courses (shopping list). Phase 4 will port from
// the legacy calories.js + meals (app.js) + explorer.js.

export function mount(root) {
  root.innerHTML = `
    <div class="placeholder">
      <h1 class="placeholder-title">Nutrition</h1>
      <p class="placeholder-sub">Calories, repas, courses — en chantier (phase 4).</p>
    </div>
  `;
}
