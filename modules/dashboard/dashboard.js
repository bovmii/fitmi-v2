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

      <section class="dash-section dash-placeholder-card">
        <div class="dash-section-head"><h2>Nutrition</h2></div>
        <div class="dash-pending">${icon('utensils', { size: 18 })}<span>Calories & repas — phase 4c</span></div>
      </section>

      <section class="dash-section dash-placeholder-card">
        <div class="dash-section-head"><h2>Training</h2></div>
        <div class="dash-pending">${icon('dumbbell', { size: 18 })}<span>Séance du jour — phase 4d</span></div>
      </section>

      <section class="dash-section dash-placeholder-card">
        <div class="dash-section-head"><h2>Budget</h2></div>
        <div class="dash-pending">${icon('wallet', { size: 18 })}<span>Dépenses du jour — phase 4b</span></div>
      </section>
    </div>
  `;

  root.querySelector('.dash-hello').textContent = greetingLine();
  root.querySelector('.dash-date').textContent = formatGreetingDate();

  root.querySelector('[data-view-all]').onclick = () => openAllHabits({ onChange: refreshHabits });

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
}
