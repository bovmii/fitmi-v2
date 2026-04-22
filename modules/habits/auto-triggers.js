// Habit auto-completion wiring. Subscribes to the bus events emitted
// by the other modules and, whenever one fires, auto-completes every
// habit whose `autoTrigger` matches. The condition is always checked
// inside the emitter so this listener stays a thin mapping table —
// the day a habit triggers is the day the event fires, never anything
// recomputed here.

import { Bus } from '../../core/bus.js';
import { showToast } from '../../core/ui.js';
import { getAllHabits, markCompletedToday } from './data.js';

const EVENT_TO_TRIGGER = {
  'water.goal_reached':     'water_goal',
  'workout.logged':         'workout',
  'fasting.completed':      'fasting_done',
  'weight.logged':          'weight_logged',
  'calories.goal_ok':       'calories_ok',
  'budget.day_under_limit': 'expense_under_daily',
};

async function complete(trigger, hint) {
  const habits = await getAllHabits();
  const matches = habits.filter((h) => h.autoTrigger === trigger);
  for (const h of matches) {
    const res = await markCompletedToday(h.id);
    if (res?.completed) {
      showToast(`Habitude auto-cochée : ${h.name}${hint ? ' · ' + hint : ''}`);
    }
  }
}

export function initHabitAutoTriggers() {
  for (const [event, trigger] of Object.entries(EVENT_TO_TRIGGER)) {
    Bus.on(event, async (payload) => {
      // Fasting only counts a completion if the target hours were hit.
      if (event === 'fasting.completed' && !payload?.success) return;
      await complete(trigger);
    });
  }
}
