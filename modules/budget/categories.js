// Expense categories. Same labels as budgetflow (French names), but
// each one now maps to a Lucide icon slug (in core/icons.js) rather
// than to an emoji. A neutral palette keeps the category chart from
// looking like a pile of stickers.

export const CATEGORIES = [
  { key: 'Alimentation', icon: 'utensils',     color: '#10b981' },
  { key: 'Transport',    icon: 'car',          color: '#3b82f6' },
  { key: 'Loisirs',      icon: 'zap',          color: '#8b5cf6' },
  { key: 'Santé',        icon: 'heart',        color: '#ef4444' },
  { key: 'Shopping',     icon: 'shoppingCart', color: '#ec4899' },
  { key: 'Logement',     icon: 'home',         color: '#f59e0b' },
  { key: 'Abonnements',  icon: 'bell',         color: '#14b8a6' },
  { key: 'Autre',        icon: 'archive',      color: '#9a9389' },
];

// Subset that makes sense for recurring subscriptions.
export const SUBSCRIPTION_CATEGORIES = [
  'Abonnements', 'Transport', 'Logement', 'Santé', 'Autre',
];

export const categoryByKey = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

export function formatEUR(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
  }).format(value || 0);
}
