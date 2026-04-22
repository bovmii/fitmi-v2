// Budget tab. Single scrollable page with:
//   - Month summary: spent / remaining / progress bar
//   - Quick FAB to add an expense
//   - Category chart + alerts (OK / warn / over)
//   - Recent transactions (last 10), tap to delete
//   - Savings & subscriptions entry buttons → drawers
//   - Gear icon → budget settings drawer

import { icon } from '../../core/icons.js';
import { confirmModal } from '../../core/ui.js';
import { monthLabel, currentMonthKey, formatDateFr } from '../../core/date.js';
import {
  getAllExpenses, getExpensesForMonth, deleteExpense,
  getMonthSummary, processSubscriptions,
  getAllSavings,
} from './data.js';
import { CATEGORIES, categoryByKey, formatEUR } from './categories.js';
import { openAddExpense } from './add.js';
import { openSubscriptions } from './subscriptions.js';
import { openSavings } from './savings.js';
import { openBudgetSettings } from './budget-settings.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export async function mount(root) {
  root.innerHTML = `
    <div class="budget-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Budget</h1>
          <div class="page-sub" data-month-label></div>
        </div>
        <button class="icon-btn" data-open-settings title="Budget & plafonds">${icon('settings', { size: 20 })}</button>
      </div>

      <section class="budget-summary" data-summary></section>

      <button class="fab-cta" data-add>
        ${icon('plus', { size: 20 })}<span>Ajouter une dépense</span>
      </button>

      <section data-categories></section>

      <section class="budget-section">
        <div class="section-head">
          <h2>Transactions récentes</h2>
        </div>
        <div data-expenses></div>
      </section>

      <section class="budget-section">
        <div class="section-head">
          <h2>Épargne</h2>
          <button class="btn-link" data-open-savings>Gérer</button>
        </div>
        <div data-savings></div>
      </section>

      <section class="budget-section">
        <div class="section-head">
          <h2>Abonnements</h2>
          <button class="btn-link" data-open-subs>Gérer</button>
        </div>
        <div data-subs-hint></div>
      </section>
    </div>
  `;

  root.querySelector('[data-month-label]').textContent = monthLabel(currentMonthKey());

  root.querySelector('[data-add]').onclick = async () => {
    const saved = await openAddExpense({});
    if (saved) await refreshAll();
  };
  root.querySelector('[data-open-settings]').onclick = () => openBudgetSettings({ onChange: refreshAll });
  root.querySelector('[data-open-savings]').onclick = () => openSavings({ onChange: refreshAll });
  root.querySelector('[data-open-subs]').onclick = () => openSubscriptions({ onChange: refreshAll });

  // Run the monthly subscription bill once per calendar month before
  // the first render so this month's fixed costs are already counted.
  await processSubscriptions();

  await refreshAll();

  async function refreshAll() {
    const [summary, expenses, savings] = await Promise.all([
      getMonthSummary(),
      getExpensesForMonth(),
      getAllSavings(),
    ]);
    renderSummary(summary);
    renderCategories(summary);
    renderExpenses(expenses);
    renderSavings(savings);
    renderSubscriptionsHint();
  }

  function renderSummary(s) {
    const pct = s.monthly > 0 ? Math.min(100, (s.total / s.monthly) * 100) : 0;
    const over = s.remaining < 0;
    root.querySelector('[data-summary]').innerHTML = `
      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-label">Dépensé</div>
          <div class="summary-value">${formatEUR(s.total)}</div>
        </div>
        <div class="summary-card ${over ? 'danger' : ''}">
          <div class="summary-label">${over ? 'Dépassement' : 'Reste ce mois'}</div>
          <div class="summary-value">${formatEUR(Math.abs(s.remaining))}</div>
        </div>
      </div>
      ${s.monthly > 0 ? `
        <div class="budget-bar"><div class="budget-bar-fill ${over ? 'danger' : ''}" style="width:${pct}%"></div></div>
        <div class="budget-bar-hint">${formatEUR(s.total)} sur ${formatEUR(s.monthly)}</div>
      ` : `<div class="settings-hint" style="margin-top:10px;">Définis un budget mensuel dans ${icon('settings', { size: 12 })}</div>`}
    `;
  }

  function renderCategories(s) {
    const host = root.querySelector('[data-categories]');
    const entries = Object.entries(s.byCategory).filter(([, v]) => v > 0);
    if (entries.length === 0) {
      host.innerHTML = '';
      return;
    }
    const max = Math.max(...entries.map(([, v]) => v));
    host.innerHTML = `
      <div class="section-head"><h2>Par catégorie</h2></div>
      <div class="cat-chart">
        ${entries
          .sort((a, b) => b[1] - a[1])
          .map(([key, val]) => {
            const cat = categoryByKey(key);
            const pctOfMax = Math.round((val / max) * 100);
            const limit = s.limits[key];
            const alert = s.alerts.find((a) => a.category === key);
            return `
              <div class="cat-row ${alert ? `alert-${alert.level}` : ''}">
                <div class="cat-row-head">
                  <span class="cat-icon" style="color:${cat.color};">${icon(cat.icon, { size: 14 })}</span>
                  <span class="cat-row-name">${key}</span>
                  <span class="cat-row-amount">${formatEUR(val)}${limit ? ` / ${formatEUR(limit)}` : ''}</span>
                </div>
                <div class="cat-bar"><div class="cat-bar-fill" style="width:${pctOfMax}%;background:${cat.color};"></div></div>
                ${alert ? `<div class="cat-alert">${alert.level === 'over' ? 'Plafond dépassé' : 'Attention, proche du plafond'}</div>` : ''}
              </div>
            `;
          }).join('')}
      </div>
    `;
  }

  function renderExpenses(expenses) {
    const host = root.querySelector('[data-expenses]');
    if (expenses.length === 0) {
      host.innerHTML = `<div class="settings-hint" style="padding:14px 0;text-align:center;">Aucune dépense ce mois.</div>`;
      return;
    }
    const recent = expenses.slice(0, 12);
    host.innerHTML = recent.map((e) => {
      const cat = categoryByKey(e.category);
      return `
        <div class="tx-row" data-id="${e.id}">
          <span class="cat-icon" style="color:${cat.color};">${icon(cat.icon, { size: 16 })}</span>
          <div class="tx-info">
            <div class="tx-title">${escapeHtml(e.description) || cat.key}</div>
            <div class="tx-meta">${formatDateFr(e.date)}${e.fromSubscription ? ' · auto' : ''}</div>
          </div>
          <div class="tx-amount">-${formatEUR(e.amount)}</div>
          <button class="icon-btn" data-delete>${icon('trash', { size: 14 })}</button>
        </div>
      `;
    }).join('');

    host.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.closest('.tx-row').dataset.id;
        const ok = await confirmModal('Supprimer cette dépense ?', { confirmText: 'Supprimer', danger: true });
        if (!ok) return;
        await deleteExpense(id);
        await refreshAll();
      };
    });
  }

  function renderSavings(savings) {
    const host = root.querySelector('[data-savings]');
    if (savings.length === 0) {
      host.innerHTML = `<div class="settings-hint" style="padding:14px 0;text-align:center;">Aucun objectif d'épargne.</div>`;
      return;
    }
    host.innerHTML = savings.slice(0, 3).map((g) => {
      const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
      return `
        <div class="goal-mini" style="--goal-color:${g.color};">
          <span class="goal-icon" style="color:${g.color};">${icon(g.icon || 'target', { size: 16 })}</span>
          <div class="goal-info">
            <div class="goal-name">${escapeHtml(g.name)}</div>
            <div class="goal-meta-compact">${formatEUR(g.saved)} / ${formatEUR(g.target)} · ${Math.round(pct)}%</div>
          </div>
          <div class="goal-bar mini"><div class="goal-bar-fill" style="width:${pct}%;background:${g.color};"></div></div>
        </div>
      `;
    }).join('');
  }

  async function renderSubscriptionsHint() {
    const host = root.querySelector('[data-subs-hint]');
    const all = await (await import('./data.js')).getAllSubscriptions();
    if (all.length === 0) {
      host.innerHTML = `<div class="settings-hint" style="padding:14px 0;text-align:center;">Aucun abonnement enregistré.</div>`;
      return;
    }
    const total = all.reduce((s, x) => s + (x.amount || 0), 0);
    host.innerHTML = `
      <div class="subs-summary">
        <div>${all.length} abonnement${all.length > 1 ? 's' : ''}</div>
        <div class="subs-total">${formatEUR(total)} / mois</div>
      </div>
    `;
  }
}
