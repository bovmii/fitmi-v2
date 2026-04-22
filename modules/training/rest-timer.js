// Rest timer banner. Anchored to the bottom of the active workout
// view (above the bottom nav). Counts down from a target in seconds,
// with +30s and Skip buttons. Dismisses itself when the countdown
// hits zero and pulses the background to get the user's attention.

import { icon } from '../../core/icons.js';

let activeTimer = null;

export function startRestTimer({ seconds = 90, onDone } = {}) {
  stopRestTimer();
  const el = document.createElement('div');
  el.className = 'rest-timer';
  document.body.appendChild(el);

  let remaining = seconds;
  let rafId = null;
  const start = Date.now();

  function render() {
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    const label = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    el.innerHTML = `
      <div class="rest-body">
        <span class="rest-icon">${icon('clock', { size: 18 })}</span>
        <span class="rest-label">Repos</span>
        <span class="rest-count">${label}</span>
        <button class="rest-btn" data-plus>+30s</button>
        <button class="rest-btn" data-skip>Passer</button>
      </div>
    `;
    el.querySelector('[data-plus]').onclick = () => { remaining += 30; render(); };
    el.querySelector('[data-skip]').onclick = () => finish();
  }

  function tick() {
    const elapsedActual = Math.floor((Date.now() - start) / 1000);
    const computed = seconds - elapsedActual;
    remaining = computed;
    if (computed <= 0) {
      el.classList.add('done');
      render();
      finish();
      return;
    }
    render();
    rafId = requestAnimationFrame(() => setTimeout(tick, 500));
  }

  function finish() {
    stopRestTimer();
    try { onDone?.(); } catch {}
  }

  render();
  tick();

  activeTimer = { el, stop: () => { if (rafId) cancelAnimationFrame(rafId); el.remove(); activeTimer = null; } };
  return activeTimer;
}

export function stopRestTimer() {
  if (activeTimer) activeTimer.stop();
}
