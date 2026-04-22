// Dashboard "Aujourd'hui". Vertical scroll with these sections:
//   - Greeting: hello + date + ISO week number
//   - Habits strip: today's habits, tap to toggle, progress counter,
//     "Voir tout" opens the full list drawer
//   - Nutrition: placeholder (phase 4c)
//   - Training:  placeholder (phase 4d)
//   - Budget:    placeholder (phase 4b)
//   - Water:     placeholder (phase 4c — moved under Nutrition)
//
// Data changes from the habits module bubble back through a refresh
// callback — the strip re-renders without refetching the other
// sections. Budget/nutrition/training sections will gain the same
// pattern as their modules land.

import { Auth } from '../../core/auth.js';
import { icon } from '../../core/icons.js';
import { DAYS_FULL, MONTHS_LONG, getWeekKey } from '../../core/date.js';
import {
  getTodayHabits, isCompletedToday, toggleHabit,
} from '../habits/data.js';
import { openHabitForm } from '../habits/form.js';
import { openAllHabits } from '../habits/all.js';
import {
  getMonthSummary, getTodaySpend, getAllSubscriptions, subsDueToday,
} from '../budget/data.js';
import { formatEUR } from '../budget/categories.js';
import { openAddExpense } from '../budget/add.js';
import { getDayTotals, getNutritionTargets } from '../nutrition/data.js';
import { openAddFood } from '../nutrition/add.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function formatGreetingDate() {
  const now = new Date();
  const weekDay = DAYS_FULL[(now.getDay() + 6) % 7].toLowerCase();
  const week = getWeekKey(now).split('-W')[1].replace(/^0/, '');
  return `${weekDay} ${now.getDate()} ${MONTHS_LONG[now.getMonth()]} · semaine ${week}`;
}

function greetingLine() {
  const u = Auth.getUser();
  const name = u?.name || 'Toi';
  const hour = new Date().getHours();
  const salute = hour < 5 ? 'Bonne nuit' : hour < 11 ? 'Bonjour' : hour < 18 ? 'Salut' : 'Bonsoir';
  return `${salute} ${escapeHtml(name)}`;
}

export async function mount(root) {
  root.innerHTML = `
    <div class="dashboard">
      <section class="dash-greeting">
        <h1 class="dash-hello"></h1>
        <div class="dash-date"></div>
      </section>

      <section class="dash-section" data-section="habits">
        <div class="dash-section-head">
          <h2>Habitudes</h2>
          <button class="btn-link" data-view-all>Voir tout</button>
        </div>
        <div class="dash-habits-meter">
          <div class="meter-fill" data-habits-fill></div>
        </div>
        <div class="dash-habits-count" data-habits-count></div>
        <div class="dash-habits-strip" data-habits-strip></div>
      </section>

      <section class="dash-section" data-section="nutrition">
        <div class="dash-section-head">
          <h2>Nutrition</h2>
          <button class="btn-link" data-nutri-add>Ajouter</button>
        </div>
        <div class="dash-nutri-card" data-nutri-card></div>
      </section>

      <section class="dash-section dash-placeholder-card">
        <div class="dash-section-head"><h2>Training</h2></div>
        <div class="dash-pending">${icon('dumbbell', { size: 18 })}<span>Séance du jour — phase 4d</span></div>
      </section>

      <section class="dash-section" data-section="budget">
        <div class="dash-section-head">
          <h2>Budget</h2>
          <button class="btn-link" data-budget-add>Ajouter</button>
        </div>
        <div class="dash-budget-card" data-budget-card></div>
      </section>
    </div>
  `;

  root.querySelector('.dash-hello').textContent = greetingLine();
  root.querySelector('.dash-date').textContent = formatGreetingDate();

  root.querySelector('[data-view-all]').onclick = () => openAllHabits({ onChange: refreshHabits });
  root.querySelector('[data-budget-add]').onclick = async () => {
    const saved = await openAddExpense({});
    if (saved) await refreshBudget();
  };
  root.querySelector('[data-nutri-add]').onclick = async () => {
    const r = await openAddFood({});
    if (r?.logged) await refreshNutrition();
  };

  async function refreshHabits() {
    const strip = root.querySelector('[data-habits-strip]');
    const countEl = root.querySelector('[data-habits-count]');
    const fill = root.querySelector('[data-habits-fill]');

    const habits = await getTodayHabits();
    if (habits.length === 0) {
      strip.innerHTML = `
        <button class="habit-bubble habit-bubble-add" data-add>
          <span class="habit-bubble-circle">${icon('plus', { size: 22 })}</span>
          <span class="habit-bubble-label">Ajouter</span>
        </button>
      `;
      countEl.textContent = 'Aucune habitude pour aujourd\'hui';
      fill.style.width = '0%';
      strip.querySelector('[data-add]').onclick = async () => {
        const h = await openHabitForm({});
        if (h) await refreshHabits();
      };
      return;
    }

    const states = await Promise.all(habits.map(async (h) => {
      const done = await isCompletedToday(h.id);
      return { h, done };
    }));
    const doneCount = states.filter((s) => s.done).length;
    const pct = Math.round((doneCount / habits.length) * 100);

    fill.style.width = `${pct}%`;
    countEl.textContent = `${doneCount} / ${habits.length} fait${doneCount > 1 ? 's' : ''} aujourd'hui`;

    strip.innerHTML = states.map(({ h, done }) => `
      <button class="habit-bubble ${done ? 'done' : ''}" data-id="${h.id}" style="--habit-color:${h.color};">
        <span class="habit-bubble-circle">${icon(h.icon || 'target', { size: 22, stroke: 2 })}</span>
        <span class="habit-bubble-label">${escapeHtml(h.name)}</span>
      </button>
    `).join('') + `
      <button class="habit-bubble habit-bubble-add" data-add>
        <span class="habit-bubble-circle">${icon('plus', { size: 20 })}</span>
        <span class="habit-bubble-label">Ajouter</span>
      </button>
    `;

    strip.querySelectorAll('.habit-bubble[data-id]').forEach((btn) => {
      btn.onclick = async () => {
        await toggleHabit(btn.dataset.id);
        await refreshHabits();
      };
    });
    strip.querySelector('[data-add]').onclick = async () => {
      const h = await openHabitForm({});
      if (h) await refreshHabits();
    };
  }

  await refreshHabits();
  await refreshBudget();
  await refreshNutrition();

  async function refreshNutrition() {
    const card = root.querySelector('[data-nutri-card]');
    if (!card) return;
    const [totals, targets] = await Promise.all([getDayTotals(), getNutritionTargets()]);
    const consumed = Math.round(totals.kcal);
    const target = targets.kcal || 0;
    const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
    const remaining = Math.max(0, target - consumed);
    card.innerHTML = `
      <div class="dash-nutri-top">
        <div>
          <div class="dash-budget-label">Calories</div>
          <div class="dash-budget-value">${consumed}${target > 0 ? ` / ${target}` : ''}</div>
        </div>
        ${target > 0 ? `<div>
          <div class="dash-budget-label">Reste</div>
          <div class="dash-budget-value">${remaining}</div>
        </div>` : ''}
      </div>
      ${target > 0
        ? `<div class="budget-bar"><div class="budget-bar-fill" style="width:${pct}%"></div></div>`
        : `<div class="settings-hint">Définis tes besoins dans Nutrition → ${icon('settings', { size: 12 })}</div>`}
      ${totals.count > 0 ? `<div class="dash-nutri-meta">${totals.count} entrée${totals.count > 1 ? 's' : ''} · P ${Math.round(totals.p)} g · G ${Math.round(totals.c)} g · L ${Math.round(totals.f)} g</div>` : ''}
    `;
  }

  async function refreshBudget() {
    const card = root.querySelector('[data-budget-card]');
    if (!card) return;
    const [summary, today, subs] = await Promise.all([
      getMonthSummary(),
      getTodaySpend(),
      getAllSubscriptions(),
    ]);
    const dueToday = subsDueToday(subs);
    const pct = summary.monthly > 0 ? Math.min(100, (summary.total / summary.monthly) * 100) : 0;
    const over = summary.remaining < 0;

    const dueLine = dueToday.length > 0
      ? `<div class="dash-budget-alert">${icon('bell', { size: 14 })}<span>Prélèvement aujourd'hui : ${dueToday.map((s) => escapeHtml(s.name) + ' ' + formatEUR(s.amount)).join(' · ')}</span></div>`
      : '';

    card.innerHTML = `
      <div class="dash-budget-top">
        <div>
          <div class="dash-budget-label">Aujourd'hui</div>
          <div class="dash-budget-value">${today > 0 ? '-' + formatEUR(today) : formatEUR(0)}</div>
        </div>
        <div>
          <div class="dash-budget-label">${over ? 'Dépassement' : 'Ce mois'}</div>
          <div class="dash-budget-value ${over ? 'danger' : ''}">${formatEUR(summary.total)}${summary.monthly > 0 ? ` / ${formatEUR(summary.monthly)}` : ''}</div>
        </div>
      </div>
      ${summary.monthly > 0 ? `<div class="budget-bar"><div class="budget-bar-fill ${over ? 'danger' : ''}" style="width:${pct}%"></div></div>` : ''}
      ${dueLine}
    `;
  }
}
