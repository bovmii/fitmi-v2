// Water tracker section.
// Each glass is 250 mL; the goal is configurable in settings. Taps on
// "+" add a glass, "-" removes the most recent glass. A row of drop
// chips above the counter visualises progress — filled chips count as
// consumed. When the goal is reached we emit `water.goal_reached` on
// the bus so phase 5 habit auto-triggers can react.

import { icon } from '../../core/icons.js';
import { Bus } from '../../core/bus.js';
import {
  DEFAULT_GLASS_ML, DEFAULT_WATER_GOAL_ML,
  getTodayWaterMl, getWaterGoalMl, logGlass, removeLastGlass,
} from './data.js';

export async function renderWater(host, { date, onChange } = {}) {
  let goal = await getWaterGoalMl();
  let consumed = await getTodayWaterMl(date);
  let lastReachedGoal = consumed >= goal;

  function totalCups() {
    return Math.max(1, Math.ceil(goal / DEFAULT_GLASS_ML));
  }

  function consumedCups() {
    return Math.round(consumed / DEFAULT_GLASS_ML);
  }

  function chipsHtml() {
    const total = totalCups();
    const done = consumedCups();
    // Cap visible chips at 12 so absurd goals don't blow up the row;
    // extra consumed water is still counted in the total label.
    const visible = Math.min(total, 12);
    const filledVisible = Math.min(done, visible);
    let html = '';
    for (let i = 0; i < visible; i++) {
      const filled = i < filledVisible;
      html += `<span class="water-chip ${filled ? 'done' : ''}">${icon('droplet', { size: 16 })}</span>`;
    }
    if (total > 12) html += `<span class="water-chip-more">+${total - 12}</span>`;
    return html;
  }

  function render() {
    const pct = goal > 0 ? Math.min(100, (consumed / goal) * 100) : 0;
    const done = consumedCups();
    const target = totalCups();
    host.innerHTML = `
      <div class="water-head">
        <div class="water-title">${icon('droplet', { size: 16 })}<span>Eau</span></div>
        <div class="water-count">${done} / ${target} verres <span>(${consumed} mL)</span></div>
      </div>
      <div class="water-chips">${chipsHtml()}</div>
      <div class="budget-bar"><div class="budget-bar-fill" style="width:${pct}%;background:#3b82f6;"></div></div>
      <div class="water-actions">
        <button class="settings-btn" data-op="minus">${icon('minus', { size: 14 })}<span>Retirer</span></button>
        <button class="settings-btn" data-op="plus">${icon('plus', { size: 14 })}<span>+ un verre</span></button>
      </div>
    `;

    host.querySelector('[data-op="plus"]').onclick = async () => {
      await logGlass(DEFAULT_GLASS_ML, date);
      consumed += DEFAULT_GLASS_ML;
      render();
      if (!lastReachedGoal && consumed >= goal) {
        lastReachedGoal = true;
        Bus.emit('water.goal_reached', { date, consumed, goal });
      }
      onChange?.();
    };
    host.querySelector('[data-op="minus"]').onclick = async () => {
      const removed = await removeLastGlass(date);
      if (removed) {
        consumed = Math.max(0, consumed - (removed.amount || DEFAULT_GLASS_ML));
        if (consumed < goal) lastReachedGoal = false;
        render();
        onChange?.();
      }
    };
  }

  render();
}
