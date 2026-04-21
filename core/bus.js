// Tiny pub/sub bus. Used in phase 5 for cross-module integrations —
// habits auto-completion reacts to events like 'water.goal_reached',
// 'workout.logged', 'fasting.completed', 'calories.day_closed',
// 'weight.logged', 'expense.logged'.

const listeners = new Map();

export const Bus = {
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => this.off(event, handler);
  },

  off(event, handler) {
    listeners.get(event)?.delete(handler);
  },

  emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try { handler(payload); } catch (err) { console.error('[bus]', event, err); }
    }
  },

  clear() {
    listeners.clear();
  },
};
