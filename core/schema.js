// Unified fit.mi v2 database.
//
// Every user store uses string UUIDs as primary keys so records can be
// created on any device without auto-increment collisions. Sync metadata
// (updatedAt, deletedAt) lives as plain fields on each record — handled
// by the DB wrapper, not by extra columns — so we don't have to declare
// indexes for them in every store.
//
// Two internal stores drive the sync engine:
//   _outbox  pending changes waiting to be pushed to Supabase
//   _sync    per-user sync cursors (lastPullAt, signedInAs, etc.)

import { DB } from './db.js';

export const FITMI_DB_NAME = 'fitmi';
export const FITMI_DB_VERSION = 1;

// Stores that should participate in cloud sync. Settings is included so
// preferences (monthly budget, TDEE profile) propagate across devices.
export const SYNCED_STORES = [
  'food_log', 'custom_foods', 'water_log',
  'meals', 'recipes', 'shopping_extra', 'favorites',
  'exercises', 'workouts', 'sets', 'templates',
  'weight_log',
  'habits', 'completions',
  'expenses', 'subscriptions', 'savings',
  'settings',
];

export function upgrade(db) {
  // ----- Nutrition -----
  if (!db.objectStoreNames.contains('food_log')) {
    const s = db.createObjectStore('food_log', { keyPath: 'id' });
    s.createIndex('date', 'date', { unique: false });
  }
  if (!db.objectStoreNames.contains('custom_foods')) {
    const s = db.createObjectStore('custom_foods', { keyPath: 'id' });
    s.createIndex('name', 'name', { unique: false });
    s.createIndex('category', 'category', { unique: false });
  }
  if (!db.objectStoreNames.contains('water_log')) {
    const s = db.createObjectStore('water_log', { keyPath: 'id' });
    s.createIndex('date', 'date', { unique: false });
  }

  // ----- Meals -----
  if (!db.objectStoreNames.contains('meals')) {
    const s = db.createObjectStore('meals', { keyPath: 'id' });
    s.createIndex('weekKey', 'weekKey', { unique: false });
  }
  if (!db.objectStoreNames.contains('recipes')) {
    db.createObjectStore('recipes', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('shopping_extra')) {
    const s = db.createObjectStore('shopping_extra', { keyPath: 'id' });
    s.createIndex('weekKey', 'weekKey', { unique: false });
  }
  if (!db.objectStoreNames.contains('favorites')) {
    db.createObjectStore('favorites', { keyPath: 'id' });
  }

  // ----- Training -----
  if (!db.objectStoreNames.contains('exercises')) {
    const s = db.createObjectStore('exercises', { keyPath: 'id' });
    s.createIndex('muscleGroup', 'muscleGroup', { unique: false });
  }
  if (!db.objectStoreNames.contains('workouts')) {
    const s = db.createObjectStore('workouts', { keyPath: 'id' });
    s.createIndex('startedAt', 'startedAt', { unique: false });
  }
  if (!db.objectStoreNames.contains('sets')) {
    const s = db.createObjectStore('sets', { keyPath: 'id' });
    s.createIndex('workoutId', 'workoutId', { unique: false });
    s.createIndex('exerciseId', 'exerciseId', { unique: false });
  }
  if (!db.objectStoreNames.contains('templates')) {
    db.createObjectStore('templates', { keyPath: 'id' });
  }

  // ----- Tracking -----
  if (!db.objectStoreNames.contains('weight_log')) {
    const s = db.createObjectStore('weight_log', { keyPath: 'id' });
    s.createIndex('date', 'date', { unique: false });
  }

  // ----- Habits -----
  if (!db.objectStoreNames.contains('habits')) {
    const s = db.createObjectStore('habits', { keyPath: 'id' });
    s.createIndex('order', 'order', { unique: false });
  }
  if (!db.objectStoreNames.contains('completions')) {
    const s = db.createObjectStore('completions', { keyPath: 'id' });
    s.createIndex('habitId', 'habitId', { unique: false });
    s.createIndex('date', 'date', { unique: false });
    s.createIndex('habitDate', ['habitId', 'date'], { unique: false });
  }

  // ----- Budget -----
  if (!db.objectStoreNames.contains('expenses')) {
    const s = db.createObjectStore('expenses', { keyPath: 'id' });
    s.createIndex('date', 'date', { unique: false });
    s.createIndex('category', 'category', { unique: false });
  }
  if (!db.objectStoreNames.contains('subscriptions')) {
    db.createObjectStore('subscriptions', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('savings')) {
    db.createObjectStore('savings', { keyPath: 'id' });
  }

  // ----- Common -----
  // settings uses the namespaced key (e.g. 'budget.monthly') as its id.
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }

  // ----- Sync internals -----
  // _outbox tracks records that were modified locally and still need to
  // be pushed to Supabase. Keyed by composite "store:id" so a record that
  // is edited multiple times before the next push collapses into a single
  // outbox entry.
  if (!db.objectStoreNames.contains('_outbox')) {
    db.createObjectStore('_outbox', { keyPath: 'key' });
  }
  // _sync holds per-user cursors: lastPullAt (global), signedInAs, etc.
  if (!db.objectStoreNames.contains('_sync')) {
    db.createObjectStore('_sync', { keyPath: 'key' });
  }
}

export function initFitmiDB() {
  DB.init({ name: FITMI_DB_NAME, version: FITMI_DB_VERSION, upgrade });
}

// Namespaced keys for the settings store.
export const SETTINGS_KEYS = {
  // Nutrition
  NUTRITION_TDEE: 'nutrition.tdee',
  NUTRITION_CALORIE_GOAL: 'nutrition.calorieGoal',
  NUTRITION_MACROS: 'nutrition.macros',
  NUTRITION_COACH_MODE: 'nutrition.coachMode',
  NUTRITION_FOOD_DB: 'nutrition.foodDb',
  NUTRITION_USDA_KEY: 'nutrition.usdaKey',
  NUTRITION_WATER_GOAL: 'nutrition.waterGoal',
  NUTRITION_FASTING: 'nutrition.fasting',
  // Habits
  HABITS_AUTO_TRIGGERS: 'habits.autoTriggers',
  // Budget
  BUDGET_MONTHLY: 'budget.monthly',
  BUDGET_CATEGORY_LIMITS: 'budget.categoryLimits',
  BUDGET_LAST_SUB_RUN: 'budget.lastSubRun',
  // Dashboard
  DASHBOARD_WEEKLY_DISMISS: 'dashboard.weeklyDismiss',
  // UI
  UI_THEME: 'ui.theme',
};
