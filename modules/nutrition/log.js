// "Log" sub-view: date navigation, calorie ring, macro bars, water,
// fasting and the food journal. Extracted from nutrition.js so the
// Nutrition tab can host three sibling sub-views.

import { icon } from '../../core/icons.js';
import { confirmModal } from '../../core/ui.js';
import { todayStr, addDays, formatDateFr } from '../../core/date.js';
import {
  getFoodLogForDate, getDayTotals, deleteFoodEntry, getNutritionTargets,
} from './data.js';
import { openTdeeModal } from './tdee.js';
import { openAddFood } from './add.js';
import { renderWater } from './water.js';
import { renderFasting } from './fasting.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export async function renderNutritionLog(root) {
  let currentDate = todayStr();

  root.innerHTML = `
    <div class="date-nav">
      <button class="icon-btn" data-date-prev>${icon('chevronLeft', { size: 20 })}</button>
      <div class="date-nav-center">
        <button class="btn-link" data-date-today>Aujourd'hui</button>
        <div class="date-nav-label" data-date-label></div>
      </div>
      <button class="icon-btn" data-date-next>${icon('chevronRight', { size: 20 })}</button>
    </div>

    <section class="cal-ring-wrap" data-ring></section>
    <section class="macros-wrap" data-macros></section>
    <section class="water-section" data-water></section>
    <section class="fasting-section" data-fasting></section>

    <button class="fab-cta" data-add-food>
      ${icon('plus', { size: 20 })}<span>Ajouter un aliment</span>
    </button>

    <section class="log-wrap">
      <div class="section-head">
        <h2>Journal du jour</h2>
        <button class="icon-btn" data-open-tdee title="Mes besoins">${icon('settings', { size: 18 })}</button>
      </div>
      <div data-log></div>
    </section>
  `;

  root.querySelector('[data-date-prev]').onclick = async () => {
    currentDate = addDays(currentDate, -1);
    await refresh();
  };
  root.querySelector('[data-date-next]').onclick = async () => {
    if (currentDate >= todayStr()) return;
    currentDate = addDays(currentDate, 1);
    await refresh();
  };
  root.querySelector('[data-date-today]').onclick = async () => {
    currentDate = todayStr();
    await refresh();
  };
  root.querySelector('[data-open-tdee]').onclick = () => openTdeeModal({ onSave: refresh });
  root.querySelector('[data-add-food]').onclick = async () => {
    const r = await openAddFood({ date: currentDate });
    if (r?.logged) await refresh();
  };

  let fastingRef = null;

  await refresh();

  // Expose a cleanup so the parent sub-tab router can stop our RAF loop.
  return {
    stop: () => { if (fastingRef?.stop) fastingRef.stop(); },
  };

  async function refresh() {
    const [totals, targets, entries] = await Promise.all([
      getDayTotals(currentDate),
      getNutritionTargets(),
      getFoodLogForDate(currentDate),
    ]);

    root.querySelector('[data-date-label]').textContent =
      currentDate === todayStr() ? formatDateFr(currentDate) : formatDateFr(currentDate);

    renderRing(totals, targets);
    renderMacros(totals, targets);
    renderLogRows(entries);

    await renderWater(root.querySelector('[data-water]'), { date: currentDate });
    if (fastingRef?.stop) fastingRef.stop();
    fastingRef = await renderFasting(root.querySelector('[data-fasting]'));
  }

  function renderRing(totals, targets) {
    const host = root.querySelector('[data-ring]');
    const target = targets.kcal || 0;
    const consumed = Math.round(totals.kcal);
    const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
    const remaining = target > 0 ? Math.max(0, target - consumed) : 0;
    const circumference = 2 * Math.PI * 50;
    const offset = circumference - (circumference * pct) / 100;

    host.innerHTML = `
      <div class="cal-ring">
        <svg viewBox="0 0 120 120" width="180" height="180">
          <circle class="cal-ring-bg" cx="60" cy="60" r="50" fill="none" stroke-width="10"></circle>
          <circle class="cal-ring-fg" cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 60 60)" stroke-linecap="round"></circle>
        </svg>
        <div class="cal-ring-text">
          <div class="cal-ring-main"><strong>${consumed}</strong><span>kcal</span></div>
          <div class="cal-ring-sub">${target > 0 ? `reste <strong>${remaining}</strong>` : 'définis ton objectif'}</div>
        </div>
      </div>
      <div class="cal-ring-side">
        <div class="ring-stat"><span class="ring-stat-label">Consommé</span><strong>${consumed}</strong></div>
        <div class="ring-stat"><span class="ring-stat-label">Objectif</span><strong>${target || '—'}</strong></div>
        <div class="ring-stat"><span class="ring-stat-label">Entrées</span><strong>${totals.count}</strong></div>
      </div>
    `;
  }

  function renderMacros(totals, targets) {
    const host = root.querySelector('[data-macros]');
    const items = [
      { key: 'prot', label: 'Protéines', value: totals.p, target: targets.protein },
      { key: 'carb', label: 'Glucides',  value: totals.c, target: targets.carbs },
      { key: 'fat',  label: 'Lipides',   value: totals.f, target: targets.fat },
    ];
    host.innerHTML = items.map((m) => {
      const pct = m.target > 0 ? Math.min(100, (m.value / m.target) * 100) : 0;
      return `
        <div class="macro-row">
          <div class="macro-head">
            <span class="macro-label">${m.label}</span>
            <span class="macro-value">${Math.round(m.value)}${m.target ? ` / ${m.target}` : ''} g</span>
          </div>
          <div class="macro-bar"><div class="macro-fill macro-${m.key}" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');
  }

  function renderLogRows(entries) {
    const host = root.querySelector('[data-log]');
    if (entries.length === 0) {
      host.innerHTML = `<div class="settings-hint" style="padding:16px 0;text-align:center;">Rien logué pour ce jour.</div>`;
      return;
    }
    host.innerHTML = entries.map((e) => `
      <div class="log-row" data-id="${e.id}">
        <div class="log-info">
          <div class="log-name">${escapeHtml(e.name)}</div>
          <div class="log-meta">${e.quantity || 0} g · P ${e.p || 0} · G ${e.c || 0} · L ${e.f || 0}</div>
        </div>
        <div class="log-kcal">${Math.round(e.kcal || 0)} kcal</div>
        <button class="icon-btn" data-delete>${icon('trash', { size: 14 })}</button>
      </div>
    `).join('');
    host.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.closest('.log-row').dataset.id;
        const ok = await confirmModal('Supprimer cette entrée du journal ?', { confirmText: 'Supprimer', danger: true });
        if (!ok) return;
        await deleteFoodEntry(id);
        await refresh();
      };
    });
  }
}
