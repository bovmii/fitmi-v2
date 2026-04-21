// Unified fit.mi v2 database. One IndexedDB named 'fitmi' holds every
// object store from the three legacy apps, plus the new ones.
//
// Bumping FITMI_DB_VERSION requires extending the upgrade() callback to
// handle every prior version (oldVersion < N branches). For now we only
// ship version 1; phase 2 intentionally freezes the shape so legacy data
// can migrate in cleanly.

import { DB } from './db.js';

export const FITMI_DB_NAME = 'fitmi';
export const FITMI_DB_VERSION = 1;

export function upgrade(db) {
  // ----- Nutrition -----
  if (!db.objectStoreNames.contains('food_log')) {
    const s = db.createObjectStore('food_log', { keyPath: 'id', autoIncrement: true });
    s.createIndex('date', 'date', { unique: false });
  }
  if (!db.objectStoreNames.contains('custom_foods')) {
    const s = db.createObjectStore('custom_foods', { keyPath: 'id', autoIncrement: true });
    s.createIndex('name', 'name', { unique: false });
    s.createIndex('category', 'category', { unique: false });
  }
  if (!db.objectStoreNames.contains('water_log')) {
    const s = db.createObjectStore('water_log', { keyPath: 'id', autoIncrement: true });
    s.createIndex('date', 'date', { unique: false });
  }

  // ----- Meals -----
  if (!db.objectStoreNames.contains('meals')) {
    const s = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
    s.createIndex('weekKey', 'weekKey', { unique: false });
  }
  if (!db.objectStoreNames.contains('recipes')) {
    db.createObjectStore('recipes', { keyPath: 'id', autoIncrement: true });
  }
  if (!db.objectStoreNames.contains('shopping_extra')) {
    const s = db.createObjectStore('shopping_extra', { keyPath: 'id', autoIncrement: true });
    s.createIndex('weekKey', 'weekKey', { unique: false });
  }
  if (!db.objectStoreNames.contains('favorites')) {
    db.createObjectStore('favorites', { keyPath: 'id', autoIncrement: true });
  }

  // ----- Training -----
  if (!db.objectStoreNames.contains('exercises')) {
    const s = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
    s.createIndex('muscleGroup', 'muscleGroup', { unique: false });
  }
  if (!db.objectStoreNames.contains('workouts')) {
    const s = db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
    s.createIndex('startedAt', 'startedAt', { unique: false });
  }
  if (!db.objectStoreNames.contains('sets')) {
    const s = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
    s.createIndex('workoutId', 'workoutId', { unique: false });
    s.createIndex('exerciseId', 'exerciseId', { unique: false });
  }
  if (!db.objectStoreNames.contains('templates')) {
    db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
  }

  // ----- Tracking -----
  if (!db.objectStoreNames.contains('weight_log')) {
    const s = db.createObjectStore('weight_log', { keyPath: 'id', autoIncrement: true });
    s.createIndex('date', 'date', { unique: false });
  }

  // ----- Habits (new in v2) -----
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

  // ----- Budget (new in v2) -----
  if (!db.objectStoreNames.contains('expenses')) {
    const s = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
    s.createIndex('date', 'date', { unique: false });
    s.createIndex('category', 'category', { unique: false });
  }
  if (!db.objectStoreNames.contains('subscriptions')) {
    db.createObjectStore('subscriptions', { keyPath: 'id', autoIncrement: true });
  }
  if (!db.objectStoreNames.contains('savings')) {
    db.createObjectStore('savings', { keyPath: 'id', autoIncrement: true });
  }

  // ----- Common -----
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }
}

export function initFitmiDB() {
  DB.init({ name: FITMI_DB_NAME, version: FITMI_DB_VERSION, upgrade });
}

// Settings key namespaces used by the rest of the app.
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
