// Routes `fitmi://<target>` URLs (fired by a widget tap on iOS) to
// the matching tab. The scheme is registered in Info.plist and the
// Capacitor App plugin surfaces incoming opens via `appUrlOpen`.

import { isNative } from './native.js';

// Widget URL host → { tab, sub? }. `sub` is stashed in localStorage
// with the same key the Nutrition tab uses so the right sub-pane
// shows on mount.
const ROUTES = {
  open:      { tab: 'today' },
  today:     { tab: 'today' },
  habits:    { tab: 'today' },
  nutrition: { tab: 'nutrition', sub: 'log' },
  water:     { tab: 'nutrition', sub: 'log' },
  shopping:  { tab: 'nutrition', sub: 'courses' },
  meal:      { tab: 'nutrition', sub: 'repas' },
  budget:    { tab: 'budget' },
  training:  { tab: 'training' },
  stats:     { tab: 'stats' },
};

function go(url) {
  try {
    const u = new URL(url);
    const host = (u.host || u.pathname.replace(/^\/+/, '')).toLowerCase();
    const route = ROUTES[host] || ROUTES.open;
    if (route.sub) localStorage.setItem('fitmi.nutritionTab', route.sub);
    if (window.location.hash !== `#${route.tab}`) {
      window.location.hash = route.tab;
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  } catch {}
}

export async function initDeepLinks() {
  if (!(await isNative())) return;
  try {
    const { App } = await import('https://esm.sh/@capacitor/app@8.1.0');
    App.addListener('appUrlOpen', ({ url }) => { if (url) go(url); });
  } catch (err) {
    console.warn('[deep-link] listener failed', err);
  }
}
