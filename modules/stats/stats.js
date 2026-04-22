// Stats tab — a single scrollable page with five sections (weight,
// calories, training volume, habits completion, budget trends). Each
// section reads from the relevant data layer and renders inline SVG
// charts via modules/stats/charts.js.
//
// No editing happens here except the weight entry, which is lightweight
// enough to keep on this page rather than buried in a settings drawer.

import { icon } from '../../core/icons.js';
import { addDays, todayStr, monthKeyFromDate, currentMonthKey, monthLabel } from '../../core/date.js';
import { lineChart, barChart } from './charts.js';
import { getAllWeights, getLatestWeight, getRecentWeights, deleteWeight } from './weight-data.js';
import { openWeightForm } from './weight-form.js';

import { getAllHabits, getCompletionRate, getStreak, isCompletedToday } from '../habits/data.js';
import { DB } from '../../core/db.js';
import {
  getAllExpenses, getMonthSummary,
} from '../budget/data.js';
import { formatEUR } from '../budget/categories.js';
import { confirmModal } from '../../core/ui.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function round1(n) { return Math.round(n * 10) / 10; }

function shortDate(dateStr) {
  // "2026-04-22" -> "22/04"
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

export async function mount(root) {
  root.innerHTML = `
    <div class="stats-page">
      <div class="page-header"><h1 class="page-title">Stats</h1></div>

      <section class="stats-section" data-section="weight"></section>
      <section class="stats-section" data-section="calories"></section>
      <section class="stats-section" data-section="training"></section>
      <section class="stats-section" data-section="habits"></section>
      <section class="stats-section" data-section="budget"></section>
    </div>
  `;

  await Promise.all([
    renderWeight(root.querySelector('[data-section="weight"]')),
    renderCalories(root.querySelector('[data-section="calories"]')),
    renderTraining(root.querySelector('[data-section="training"]')),
    renderHabits(root.querySelector('[data-section="habits"]')),
    renderBudget(root.querySelector('[data-section="budget"]')),
  ]);
}

// ---- Weight ----
async function renderWeight(host) {
  const recent = await getRecentWeights(90);
  const latest = await getLatestWeight();
  const chartPoints = recent.map((w) => ({ label: shortDate(w.date), value: w.kg }));

  const first = recent[0];
  const diff = latest && first ? round1(latest.kg - first.kg) : 0;

  host.innerHTML = `
    <div class="section-head">
      <h2>Poids</h2>
      <button class="btn-link" data-add>Saisir</button>
    </div>
    <div class="stats-row">
      <div class="stat-mini">
        <span>Actuel</span>
        <strong>${latest ? round1(latest.kg) + ' kg' : '—'}</strong>
      </div>
      <div class="stat-mini">
        <span>90 j</span>
        <strong class="${diff < 0 ? 'positive' : diff > 0 ? 'warn' : ''}">${diff > 0 ? '+' : ''}${diff || 0} kg</strong>
      </div>
      <div class="stat-mini">
        <span>Entrées</span>
        <strong>${recent.length}</strong>
      </div>
    </div>
    <div class="chart-wrap">${lineChart({ points: chartPoints, color: '#3b82f6' })}</div>
    <div class="stat-tail">
      ${recent.slice(-5).reverse().map((w) => `
        <div class="tail-row" data-id="${w.id}">
          <span>${shortDate(w.date)}</span>
          <strong>${round1(w.kg)} kg</strong>
          <button class="icon-btn" data-delete>${icon('trash', { size: 12 })}</button>
        </div>
      `).join('')}
    </div>
  `;

  host.querySelector('[data-add]').onclick = async () => {
    const saved = await openWeightForm({});
    if (saved) renderWeight(host);
  };
  host.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.closest('.tail-row').dataset.id;
      const ok = await confirmModal('Supprimer cette pesée ?', { confirmText: 'Supprimer', danger: true });
      if (!ok) return;
      await deleteWeight(id);
      renderWeight(host);
    };
  });
}

// ---- Calories ----
async function renderCalories(host) {
  // Last 14 days of food_log aggregated by date.
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(addDays(todayStr(), -i));

  const byDay = new Map(days.map((d) => [d, 0]));
  for (const d of days) {
    const rows = await DB.getByIndex('food_log', 'date', d);
    byDay.set(d, rows.filter((r) => !r.deletedAt).reduce((s, r) => s + (r.kcal || 0), 0));
  }

  const target = (await DB.getSetting('nutrition.calorieGoal')) || 0;
  const bars = days.map((d) => ({
    label: shortDate(d),
    value: Math.round(byDay.get(d)),
    hlTarget: target > 0 && byDay.get(d) > 0 && Math.abs(byDay.get(d) - target) / target <= 0.1,
  }));
  const loggedDays = bars.filter((b) => b.value > 0);
  const avg = loggedDays.length ? Math.round(loggedDays.reduce((s, b) => s + b.value, 0) / loggedDays.length) : 0;
  const onTarget = target > 0 ? bars.filter((b) => b.hlTarget).length : 0;

  host.innerHTML = `
    <div class="section-head"><h2>Calories</h2></div>
    <div class="stats-row">
      <div class="stat-mini"><span>Moyenne 14 j</span><strong>${avg || '—'}</strong></div>
      <div class="stat-mini"><span>Objectif</span><strong>${target || '—'}</strong></div>
      ${target > 0 ? `<div class="stat-mini"><span>Jours OK</span><strong class="positive">${onTarget}</strong></div>` : ''}
    </div>
    <div class="chart-wrap">${barChart({ bars, color: '#c4a87a', target: target || null })}</div>
  `;
}

// ---- Training volume ----
async function renderTraining(host) {
  const workouts = await DB.getAllActive('workouts');
  const completed = workouts.filter((w) => w.endedAt);

  // Aggregate volume per ISO week, last 8 weeks.
  const weeks = [];
  const today = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() || 7) - 1));
    const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
    weeks.push(key);
  }

  const bars = await Promise.all(weeks.map(async (weekStart) => {
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekStartDate.getDate() + 7);
    const sessions = completed.filter((w) => {
      const s = new Date(w.startedAt);
      return s >= weekStartDate && s < weekEndDate;
    });
    let volume = 0;
    for (const w of sessions) {
      const sets = await DB.getByIndex('sets', 'workoutId', w.id);
      for (const s of sets) if (!s.deletedAt) volume += (s.reps || 0) * (s.weight || 0);
    }
    return { label: shortDate(weekStart), value: Math.round(volume), sessionCount: sessions.length };
  }));

  const totalVolume = bars.reduce((s, b) => s + b.value, 0);
  const totalSessions = bars.reduce((s, b) => s + b.sessionCount, 0);

  host.innerHTML = `
    <div class="section-head"><h2>Training</h2></div>
    <div class="stats-row">
      <div class="stat-mini"><span>Séances 8 sem.</span><strong>${totalSessions}</strong></div>
      <div class="stat-mini"><span>Volume total</span><strong>${totalVolume.toLocaleString('fr-FR')} kg</strong></div>
      <div class="stat-mini"><span>Moy/semaine</span><strong>${Math.round(totalSessions / 8 * 10) / 10}</strong></div>
    </div>
    <div class="chart-wrap">${barChart({ bars, color: '#c4a87a' })}</div>
  `;
}

// ---- Habits ----
async function renderHabits(host) {
  const habits = await getAllHabits();
  if (habits.length === 0) {
    host.innerHTML = `
      <div class="section-head"><h2>Habitudes</h2></div>
      <div class="settings-hint" style="padding:14px 0;text-align:center;">Aucune habitude pour l'instant.</div>
    `;
    return;
  }

  const stats = await Promise.all(habits.map(async (h) => ({
    habit: h,
    streak: await getStreak(h.id),
    rate: await getCompletionRate(h.id),
    doneToday: await isCompletedToday(h.id),
  })));

  const doneToday = stats.filter((s) => s.doneToday).length;
  const avgRate = stats.length ? Math.round(stats.reduce((a, s) => a + s.rate, 0) / stats.length) : 0;
  const bestStreak = Math.max(0, ...stats.map((s) => s.streak));

  host.innerHTML = `
    <div class="section-head"><h2>Habitudes</h2></div>
    <div class="stats-row">
      <div class="stat-mini"><span>Aujourd'hui</span><strong>${doneToday} / ${stats.length}</strong></div>
      <div class="stat-mini"><span>Taux moyen</span><strong>${avgRate}%</strong></div>
      <div class="stat-mini"><span>Meilleure série</span><strong>${bestStreak}</strong></div>
    </div>
    <div class="stat-tail">
      ${stats.map(({ habit, streak, rate }) => `
        <div class="tail-row" style="grid-template-columns: 28px 1fr auto auto;">
          <span style="color:${habit.color};display:flex;align-items:center;">${icon(habit.icon || 'target', { size: 16, stroke: 2 })}</span>
          <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(habit.name)}</span>
          <span style="color:var(--accent);font-weight:700;font-size:11.5px;display:inline-flex;align-items:center;gap:3px;">${icon('flame', { size: 12 })}${streak}</span>
          <strong>${rate}%</strong>
        </div>
      `).join('')}
    </div>
  `;
}

// ---- Budget ----
async function renderBudget(host) {
  // Last 3 months total + current month summary.
  const today = new Date();
  const months = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const expenses = await getAllExpenses();
  const bars = months.map((mk) => {
    const total = expenses
      .filter((e) => monthKeyFromDate(e.date || '') === mk)
      .reduce((s, e) => s + (e.amount || 0), 0);
    return { label: monthLabel(mk).slice(0, 3), value: Math.round(total) };
  });

  const summary = await getMonthSummary();
  const catEntries = Object.entries(summary.byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  host.innerHTML = `
    <div class="section-head"><h2>Budget</h2></div>
    <div class="stats-row">
      <div class="stat-mini"><span>Ce mois</span><strong>${formatEUR(summary.total)}</strong></div>
      <div class="stat-mini"><span>Budget</span><strong>${summary.monthly ? formatEUR(summary.monthly) : '—'}</strong></div>
      <div class="stat-mini"><span>Transactions</span><strong>${summary.expenseCount}</strong></div>
    </div>
    <div class="chart-wrap">${barChart({ bars, color: '#10b981' })}</div>
    ${catEntries.length ? `
      <div class="stat-tail">
        ${catEntries.map(([k, v]) => `<div class="tail-row"><span>${escapeHtml(k)}</span><strong>${formatEUR(v)}</strong><span></span></div>`).join('')}
      </div>
    ` : ''}
  `;
}
