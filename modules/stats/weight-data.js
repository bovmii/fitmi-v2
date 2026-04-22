// weight_log CRUD. Legacy schema stored one entry per weigh-in; we
// keep that and dedupe per-date only on save (editing today's weight
// updates the existing row rather than adding a new one).

import { DB } from '../../core/db.js';
import { uuid } from '../../core/ids.js';
import { todayStr, parseDate } from '../../core/date.js';
import { Bus } from '../../core/bus.js';

export async function getAllWeights() {
  const rows = await DB.getAllActive('weight_log');
  return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export async function getRecentWeights(days = 90) {
  const all = await getAllWeights();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cut = cutoff.toISOString().slice(0, 10);
  return all.filter((w) => (w.date || '') >= cut);
}

export async function getLatestWeight() {
  const all = await getAllWeights();
  return all.length ? all[all.length - 1] : null;
}

export async function logWeight({ kg, date = todayStr(), note = '' }) {
  const existing = (await getAllWeights()).find((w) => w.date === date);
  const entry = {
    id: existing?.id || uuid(),
    kg: Number(kg) || 0,
    date,
    note: (note || '').trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  await DB.put('weight_log', entry);
  Bus.emit('weight.logged', entry);
  return entry;
}

export async function deleteWeight(id) {
  await DB.delete('weight_log', id);
}
