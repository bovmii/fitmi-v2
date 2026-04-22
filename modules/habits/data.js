// Habits data layer. Every mutation goes through DB.put / DB.delete so
// the sync outbox is populated automatically. Reads filter out
// tombstones (records with deletedAt set) to match the soft-delete
// model used by sync.

import { DB } from '../../core/db.js';
import { uuid } from '../../core/ids.js';
import { todayStr, parseDate, addDays } from '../../core/date.js';
import { adjustSavings } from '../budget/data.js';

export async function getAllHabits({ includeArchived = false } = {}) {
  const rows = await DB.getAllActive('habits');
  const filtered = includeArchived ? rows : rows.filter((h) => !h.archived);
  return filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getHabit(id) {
  const row = await DB.get('habits', id);
  if (!row || row.deletedAt) return null;
  return row;
}

// Today's active habits, filtered by frequency. `specific` habits only
// appear on their scheduled days (days[] is 0=Sunday … 6=Saturday).
export async function getTodayHabits() {
  const all = await getAllHabits();
  const day = new Date().getDay();
  return all.filter((h) => {
    if (h.frequency === 'specific') return Array.isArray(h.days) && h.days.includes(day);
    return true; // 'daily' or missing frequency = every day
  });
}

export async function isCompletedOn(habitId, date) {
  const rows = await DB.getByIndex('completions', 'habitDate', [habitId, date]);
  return rows.some((c) => !c.deletedAt);
}

export async function isCompletedToday(habitId) {
  return isCompletedOn(habitId, todayStr());
}

// Tap a habit: if no active completion for today, create one; otherwise
// soft-delete the existing one. When the habit is a `savingsBoost`
// variant, the linked savings goal's saved amount is adjusted up/down
// by the configured virtualAmount.
export async function toggleHabit(habitId) {
  const today = todayStr();
  const rows = await DB.getByIndex('completions', 'habitDate', [habitId, today]);
  const active = rows.find((c) => !c.deletedAt);
  const habit = await getHabit(habitId);

  if (active) {
    await DB.delete('completions', active.id);
    if (habit?.savingsBoost && habit.linkedGoalId && habit.virtualAmount) {
      await adjustSavings(habit.linkedGoalId, -Number(habit.virtualAmount));
    }
    return { completed: false };
  }

  await DB.put('completions', {
    id: uuid(),
    habitId,
    date: today,
    completedAt: new Date().toISOString(),
  });
  if (habit?.savingsBoost && habit.linkedGoalId && habit.virtualAmount) {
    await adjustSavings(habit.linkedGoalId, Number(habit.virtualAmount));
  }
  return { completed: true };
}

// Idempotent completion: marks the habit as done today if it isn't
// already. Used by the auto-trigger bus listeners so the same
// event replayed multiple times can't create duplicate completions.
export async function markCompletedToday(habitId) {
  const today = todayStr();
  const rows = await DB.getByIndex('completions', 'habitDate', [habitId, today]);
  if (rows.some((c) => !c.deletedAt)) return { alreadyCompleted: true };
  await DB.put('completions', {
    id: uuid(),
    habitId,
    date: today,
    completedAt: new Date().toISOString(),
    autoCompleted: true,
  });
  return { completed: true };
}

export async function saveHabit(data) {
  const existing = data.id ? await getHabit(data.id) : null;
  const habit = {
    id: data.id || uuid(),
    name: (data.name || '').trim(),
    icon: data.icon || 'target',
    color: data.color || '#c4a87a',
    frequency: data.frequency || 'daily',
    days: data.frequency === 'specific' ? (data.days || []).slice().sort() : [],
    reminder: data.reminder || null,
    order: data.order ?? existing?.order ?? Date.now(),
    archived: Boolean(data.archived),
    autoTrigger: data.autoTrigger || null,
    // Savings-boost: each check nudges a linked savings goal up by
    // virtualAmount €. Purely a motivator — no real money moves.
    savingsBoost: Boolean(data.savingsBoost),
    linkedGoalId: data.linkedGoalId || null,
    virtualAmount: Number(data.virtualAmount) || 0,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  await DB.put('habits', habit);
  return habit;
}

export async function archiveHabit(id, archived = true) {
  const h = await getHabit(id);
  if (!h) return;
  await DB.put('habits', { ...h, archived });
}

// Permanent delete: drops the habit tombstone and every completion
// linked to it. Completions still get soft-deleted individually so
// other devices replay the deletions via sync.
export async function deleteHabit(id) {
  const completions = await DB.getByIndex('completions', 'habitId', id);
  for (const c of completions) {
    if (!c.deletedAt) await DB.delete('completions', c.id);
  }
  await DB.delete('habits', id);
}

// Drag-and-drop reorder: pass the new full ordering.
export async function reorderHabits(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    const h = await getHabit(orderedIds[i]);
    if (!h || h.order === i) continue;
    await DB.put('habits', { ...h, order: i });
  }
}

// Streak: count consecutive "required" days from today going back,
// skipping non-scheduled days. Today without a completion doesn't
// break the streak — the user might still tick it later.
export async function getStreak(habitId) {
  const habit = await getHabit(habitId);
  if (!habit) return 0;
  const rows = await DB.getByIndex('completions', 'habitId', habitId);
  const completed = new Set(rows.filter((c) => !c.deletedAt).map((c) => c.date));
  const today = todayStr();

  let streak = 0;
  let cursor = today;
  for (let i = 0; i < 365; i++) {
    const dayOfWeek = parseDate(cursor).getDay();
    const required = habit.frequency === 'specific'
      ? Array.isArray(habit.days) && habit.days.includes(dayOfWeek)
      : true;
    if (required) {
      if (completed.has(cursor)) {
        streak++;
      } else if (cursor !== today) {
        break;
      }
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// Completion rate since the habit was created, capped to the number of
// days where the habit was scheduled.
export async function getCompletionRate(habitId) {
  const habit = await getHabit(habitId);
  if (!habit) return 0;
  const rows = await DB.getByIndex('completions', 'habitId', habitId);
  const completedCount = rows.filter((c) => !c.deletedAt).length;
  const startDate = (habit.createdAt || '').slice(0, 10) || todayStr();
  let scheduled = 0;
  let cursor = startDate;
  const today = todayStr();
  for (let i = 0; i < 365 && cursor <= today; i++) {
    const dayOfWeek = parseDate(cursor).getDay();
    const required = habit.frequency === 'specific'
      ? Array.isArray(habit.days) && habit.days.includes(dayOfWeek)
      : true;
    if (required) scheduled++;
    cursor = addDays(cursor, 1);
  }
  if (scheduled === 0) return 0;
  return Math.min(100, Math.round((completedCount / scheduled) * 100));
}
