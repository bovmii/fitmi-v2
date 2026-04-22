// Dashboard "Aujourd'hui". Phase 4 will build the real layout (greeting,
// habits strip, nutrition ring, training, budget, water, FAB). For
// phase 3 we render a clean placeholder so the tab is not empty.

export function mount(root) {
  root.innerHTML = `
    <div class="placeholder">
      <h1 class="placeholder-title">Aujourd'hui</h1>
      <p class="placeholder-sub">Ton tableau de bord — en chantier (phase 4).</p>
    </div>
  `;
}
