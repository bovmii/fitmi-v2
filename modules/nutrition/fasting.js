// Intermittent fasting timer.
//
// When no fast is active, shows four presets (14:10, 16:8, 18:6, 20:4)
// plus a "Custom" entry. Starting a fast records startedAt + target
// hours in settings.nutrition.fasting; that state is synced so
// other devices see the live timer too.
//
// When a fast is active, renders a circular SVG progress meter
// driven by requestAnimationFrame (ticks once per second). Ending
// the fast appends an entry to settings.nutrition.fastingHistory
// (capped at 30) and emits `fasting.completed` with success/duration
// for the habit auto-trigger layer in phase 5.

import { icon } from '../../core/icons.js';
import { Bus } from '../../core/bus.js';
import { confirmModal, showToast } from '../../core/ui.js';
import {
  FASTING_PRESETS, getActiveFast, startFast, endFast,
} from './data.js';

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function renderFasting(host, { onChange } = {}) {
  let active = await getActiveFast();
  let rafId = null;

  async function render() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    active = await getActiveFast();
    host.innerHTML = active ? renderActive(active) : renderIdle();
    if (active) wireActive();
    else wireIdle();
  }

  function renderIdle() {
    return `
      <div class="fasting-head">
        <div class="water-title">${icon('clock', { size: 16 })}<span>Jeûne intermittent</span></div>
      </div>
      <div class="fasting-presets">
        ${FASTING_PRESETS.map((p) => `
          <button class="preset-btn" data-preset="${p.key}" data-hours="${p.hours}">
            <strong>${p.label}</strong><span>${p.hours}h jeûne</span>
          </button>
        `).join('')}
        <button class="preset-btn" data-custom>
          <strong>Custom</strong><span>choisir</span>
        </button>
      </div>
    `;
  }

  function renderActive(a) {
    const targetMs = a.targetHours * 3600 * 1000;
    return `
      <div class="fasting-head">
        <div class="water-title">${icon('clock', { size: 16 })}<span>Jeûne en cours · ${a.targetHours}h</span></div>
      </div>
      <div class="fasting-circle" data-target="${targetMs}" data-started="${a.startedAt}">
        <svg viewBox="0 0 120 120" width="160" height="160">
          <circle class="fasting-bg" cx="60" cy="60" r="52" fill="none" stroke-width="10"></circle>
          <circle class="fasting-fg" cx="60" cy="60" r="52" fill="none" stroke-width="10" stroke-dasharray="${2 * Math.PI * 52}" stroke-dashoffset="${2 * Math.PI * 52}" transform="rotate(-90 60 60)" stroke-linecap="round"></circle>
        </svg>
        <div class="fasting-text">
          <div class="fasting-elapsed" data-elapsed>00:00:00</div>
          <div class="fasting-remain" data-remain>—</div>
        </div>
      </div>
      <button class="settings-btn danger" data-end style="justify-content:center;">${icon('x', { size: 14 })}<span>Terminer le jeûne</span></button>
    `;
  }

  function wireIdle() {
    host.querySelectorAll('[data-preset]').forEach((b) => {
      b.onclick = async () => {
        await startFast({ hours: Number(b.dataset.hours), presetKey: b.dataset.preset });
        await render();
        onChange?.();
      };
    });
    host.querySelector('[data-custom]').onclick = async () => {
      const raw = prompt('Durée cible en heures :', '16');
      if (!raw) return;
      const hours = Math.max(1, Math.min(72, Number(raw) || 16));
      await startFast({ hours, presetKey: null });
      await render();
      onChange?.();
    };
  }

  function wireActive() {
    host.querySelector('[data-end]').onclick = async () => {
      const ok = await confirmModal('Terminer le jeûne maintenant ?', { confirmText: 'Terminer' });
      if (!ok) return;
      const result = await endFast();
      if (result) {
        const mins = result.durationMinutes;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        Bus.emit('fasting.completed', result);
        showToast(`Jeûne terminé — ${h}h ${m}min${result.success ? ' · objectif atteint' : ''}`);
      }
      await render();
      onChange?.();
    };
    tick();
  }

  function tick() {
    const wrap = host.querySelector('.fasting-circle');
    if (!wrap) return;
    const target = Number(wrap.dataset.target);
    const started = new Date(wrap.dataset.started).getTime();
    const elapsed = Date.now() - started;
    const pct = Math.min(100, (elapsed / target) * 100);
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (circumference * pct) / 100;
    const fg = wrap.querySelector('.fasting-fg');
    if (fg) fg.setAttribute('stroke-dashoffset', offset);
    const remain = target - elapsed;
    const elapsedEl = wrap.querySelector('[data-elapsed]');
    const remainEl = wrap.querySelector('[data-remain]');
    if (elapsedEl) elapsedEl.textContent = fmtDuration(elapsed);
    if (remainEl) {
      if (remain > 0) remainEl.textContent = `reste ${fmtDuration(remain)}`;
      else remainEl.innerHTML = `<strong>objectif atteint</strong>`;
    }
    rafId = requestAnimationFrame(() => {
      // ~1 per frame, but we only need 1/s; throttle by storing last update.
      setTimeout(tick, 1000);
    });
  }

  await render();

  // Cleanup when the host is detached. Caller can call returned cancel
  // to force-stop the RAF loop.
  return {
    stop: () => { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } },
  };
}
