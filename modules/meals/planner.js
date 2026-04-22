// Weekly meal planner: 7-day swipeable day selector, three slots per
// day (petit-déj / déjeuner / dîner). Tap a slot to open the
// assignment modal. Header shows the estimated cost of the week if
// any recipes have pricePerServing set.

import { icon } from '../../core/icons.js';
import { formatWeekRange, shiftWeek, getWeekKey, getTodayDayIndex, DAYS_SHORT } from '../../core/date.js';
import { getMealsForWeek, getWeekCostEstimate, SLOTS } from './data.js';
import { openMealForm } from './meal-form.js';
import { formatEUR } from '../budget/categories.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export async function renderPlanner(host, { onChange } = {}) {
  let weekKey = getWeekKey(new Date());
  let dayIndex = getTodayDayIndex();

  host.innerHTML = `
    <div class="planner">
      <div class="planner-nav">
        <button class="icon-btn" data-week-prev>${icon('chevronLeft', { size: 20 })}</button>
        <div class="planner-week">
          <div class="planner-week-range" data-range></div>
          <div class="planner-cost" data-cost></div>
        </div>
        <button class="icon-btn" data-week-next>${icon('chevronRight', { size: 20 })}</button>
      </div>
      <div class="planner-days" data-days></div>
      <div class="planner-slots" data-slots></div>
    </div>
  `;

  host.querySelector('[data-week-prev]').onclick = async () => {
    weekKey = shiftWeek(weekKey, -1);
    await refresh();
  };
  host.querySelector('[data-week-next]').onclick = async () => {
    weekKey = shiftWeek(weekKey, 1);
    await refresh();
  };

  await refresh();

  async function refresh() {
    const [meals, cost] = await Promise.all([
      getMealsForWeek(weekKey),
      getWeekCostEstimate(weekKey),
    ]);
    host.querySelector('[data-range]').textContent = formatWeekRange(weekKey);
    const costEl = host.querySelector('[data-cost]');
    if (cost.coveredCount > 0) {
      const hint = cost.coveredCount < cost.totalCount ? ` · ${cost.coveredCount}/${cost.totalCount} chiffré` : '';
      costEl.textContent = `Coût estimé ${formatEUR(cost.total)}${hint}`;
    } else {
      costEl.textContent = '';
    }
    renderDays();
    renderSlots(meals);
  }

  function renderDays() {
    const today = getTodayDayIndex();
    const isCurrentWeek = weekKey === getWeekKey(new Date());
    const host2 = host.querySelector('[data-days]');
    host2.innerHTML = DAYS_SHORT.map((label, i) => {
      const active = i === dayIndex;
      const isToday = isCurrentWeek && i === today;
      return `<button class="planner-day ${active ? 'active' : ''} ${isToday ? 'today' : ''}" data-day="${i}">
        <span class="planner-day-label">${label}</span>
        <span class="planner-day-num">${dateOfWeekSlot(weekKey, i)}</span>
      </button>`;
    }).join('');
    host2.querySelectorAll('[data-day]').forEach((b) => {
      b.onclick = async () => {
        dayIndex = Number(b.dataset.day);
        await refresh();
      };
    });
  }

  function renderSlots(meals) {
    const slotsHost = host.querySelector('[data-slots]');
    slotsHost.innerHTML = SLOTS.map((s) => {
      const meal = meals.find((m) => m.dayIndex === dayIndex && m.slot === s.key);
      return `
        <button class="meal-slot ${meal ? 'filled' : ''}" data-slot="${s.key}">
          <span class="meal-slot-label">${s.label}</span>
          <span class="meal-slot-name">${meal ? escapeHtml(meal.name) : 'Planifier…'}</span>
          ${meal ? `<span class="meal-slot-meta">${meal.servings || 1} portion${meal.servings > 1 ? 's' : ''}</span>` : ''}
        </button>
      `;
    }).join('');

    slotsHost.querySelectorAll('[data-slot]').forEach((b) => {
      const slotKey = b.dataset.slot;
      const meal = meals.find((m) => m.dayIndex === dayIndex && m.slot === slotKey);
      b.onclick = async () => {
        const result = await openMealForm({ weekKey, dayIndex, slot: slotKey, meal });
        if (result !== null) {
          await refresh();
          onChange?.();
        }
      };
    });
  }
}

// Helper: compute the numeric day of the month for Monday-indexed day `i`
// of the ISO week `weekKey`.
function dateOfWeekSlot(weekKey, i) {
  const [year, wStr] = weekKey.split('-W');
  const jan4 = new Date(Number(year), 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (Number(wStr) - 1) * 7);
  const d = new Date(monday);
  d.setDate(monday.getDate() + i);
  return d.getDate();
}
