// Budget data layer. Wraps the three stores (expenses, subscriptions,
// savings) plus the handful of settings keys (budget.monthly,
// budget.categoryLimits, budget.lastSubRun) behind a typed façade.

import { DB } from '../../core/db.js';
import { uuid } from '../../core/ids.js';
import { SETTINGS_KEYS } from '../../core/schema.js';
import { todayStr, currentMonthKey, monthKeyFromDate } from '../../core/date.js';

// ---- Expenses ----

export async function getAllExpenses() {
  const rows = await DB.getAllActive('expenses');
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function getExpensesForMonth(monthKey = currentMonthKey()) {
  const all = await getAllExpenses();
  return all.filter((e) => monthKeyFromDate(e.date || '') === monthKey);
}

export async function getExpensesForDate(date = todayStr()) {
  const all = await getAllExpenses();
  return all.filter((e) => e.date === date);
}

export async function saveExpense(data) {
  const expense = {
    id: data.id || uuid(),
    amount: Number(data.amount) || 0,
    category: data.category || 'Autre',
    description: (data.description || '').trim(),
    date: data.date || todayStr(),
    createdAt: data.createdAt || new Date().toISOString(),
    fromSubscription: Boolean(data.fromSubscription),
  };
  await DB.put('expenses', expense);
  return expense;
}

export async function deleteExpense(id) {
  await DB.delete('expenses', id);
}

// ---- Subscriptions ----

export async function getAllSubscriptions() {
  const rows = await DB.getAllActive('subscriptions');
  return rows.sort((a, b) => (a.day ?? 1) - (b.day ?? 1));
}

export async function saveSubscription(data) {
  const sub = {
    id: data.id || uuid(),
    name: (data.name || '').trim(),
    amount: Number(data.amount) || 0,
    category: data.category || 'Abonnements',
    day: Math.max(1, Math.min(28, Number(data.day) || 1)),
  };
  await DB.put('subscriptions', sub);
  return sub;
}

export async function deleteSubscription(id) {
  await DB.delete('subscriptions', id);
}

// Once per calendar month, auto-create an expense for every saved
// subscription. Keeps the dashboard honest about what's already
// committed before the month even starts. Idempotent — tracks the
// last processed month in settings so reloads don't double-bill.
export async function processSubscriptions() {
  const mk = currentMonthKey();
  const lastRun = await DB.getSetting(SETTINGS_KEYS.BUDGET_LAST_SUB_RUN);
  if (lastRun === mk) return { created: 0, skipped: true };

  const subs = await getAllSubscriptions();
  if (subs.length === 0) {
    await DB.setSetting(SETTINGS_KEYS.BUDGET_LAST_SUB_RUN, mk);
    return { created: 0 };
  }

  const [year, month] = mk.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  let created = 0;
  for (const sub of subs) {
    const day = Math.min(sub.day || 1, lastDay);
    const date = `${mk}-${String(day).padStart(2, '0')}`;
    await saveExpense({
      amount: sub.amount,
      category: sub.category,
      description: sub.name,
      date,
      fromSubscription: true,
    });
    created++;
  }
  await DB.setSetting(SETTINGS_KEYS.BUDGET_LAST_SUB_RUN, mk);
  return { created };
}

// Subscriptions due today — for the dashboard nudge. A subscription
// whose `day` falls today, regardless of auto-bill state.
export function subsDueToday(subs) {
  const d = new Date().getDate();
  return subs.filter((s) => (s.day || 1) === d);
}

// ---- Savings goals ----

export async function getAllSavings() {
  const rows = await DB.getAllActive('savings');
  return rows.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function saveSavings(data) {
  const goal = {
    id: data.id || uuid(),
    name: (data.name || '').trim(),
    target: Number(data.target) || 0,
    saved: Number(data.saved) || 0,
    icon: data.icon || 'target',
    color: data.color || '#c4a87a',
    createdAt: data.createdAt || new Date().toISOString(),
  };
  await DB.put('savings', goal);
  return goal;
}

export async function adjustSavings(id, delta) {
  const goal = await DB.get('savings', id);
  if (!goal || goal.deletedAt) return;
  const next = { ...goal, saved: Math.max(0, (goal.saved || 0) + Number(delta)) };
  await DB.put('savings', next);
  return next;
}

export async function deleteSavings(id) {
  await DB.delete('savings', id);
}

// ---- Settings ----

export async function getMonthlyBudget() {
  return (await DB.getSetting(SETTINGS_KEYS.BUDGET_MONTHLY)) || 0;
}

export async function setMonthlyBudget(amount) {
  return DB.setSetting(SETTINGS_KEYS.BUDGET_MONTHLY, Number(amount) || 0);
}

export async function getCategoryLimits() {
  return (await DB.getSetting(SETTINGS_KEYS.BUDGET_CATEGORY_LIMITS)) || {};
}

export async function setCategoryLimit(category, amount) {
  const limits = await getCategoryLimits();
  const num = Number(amount);
  if (!num || num <= 0) {
    delete limits[category];
  } else {
    limits[category] = num;
  }
  return DB.setSetting(SETTINGS_KEYS.BUDGET_CATEGORY_LIMITS, limits);
}

// ---- Aggregations ----

export async function getMonthSummary(monthKey = currentMonthKey()) {
  const [expenses, monthly, limits] = await Promise.all([
    getExpensesForMonth(monthKey),
    getMonthlyBudget(),
    getCategoryLimits(),
  ]);

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const byCategory = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + (e.amount || 0);
  }

  const alerts = [];
  for (const [category, limit] of Object.entries(limits)) {
    const used = byCategory[category] || 0;
    const pct = limit > 0 ? used / limit : 0;
    let level = 'ok';
    if (pct >= 1) level = 'over';
    else if (pct >= 0.75) level = 'warn';
    if (level !== 'ok') alerts.push({ category, used, limit, pct, level });
  }

  return {
    total,
    monthly,
    remaining: monthly - total,
    byCategory,
    limits,
    alerts,
    expenseCount: expenses.length,
  };
}

export async function getTodaySpend(date = todayStr()) {
  const rows = await getExpensesForDate(date);
  return rows.reduce((s, e) => s + (e.amount || 0), 0);
}
