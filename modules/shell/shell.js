// App shell: sticky header with brand + theme toggle + user menu, five
// tab panes, a bottom nav that swaps the active pane, and a settings
// drawer reachable from the gear icon.
//
// Tabs:
//   today        dashboard (phase 4)
//   nutrition    calories / meals / shopping sub-tabs (phase 4)
//   training     workouts + history (phase 4)
//   budget       expenses + budget (phase 4)
//   stats        weight + trends (phase 4)
//
// Each tab module exports a `mount(root)` that wires itself into a
// given container. For phase 3 the mounts are placeholders.

import { Theme } from '../../core/ui.js';
import { Auth } from '../../core/auth.js';
import { icon } from '../../core/icons.js';
import { openPasswordChange } from '../auth/password-change.js';
import { openSettings } from './settings.js';

const TABS = [
  { id: 'today',     label: 'Aujourd\'hui', icon: 'home' },
  { id: 'nutrition', label: 'Nutrition',    icon: 'utensils' },
  { id: 'training',  label: 'Training',     icon: 'dumbbell' },
  { id: 'budget',    label: 'Budget',       icon: 'wallet' },
  { id: 'stats',     label: 'Stats',        icon: 'barChart' },
];

const TAB_STORAGE = 'fitmi.tab';

function tabFromHash() {
  const h = (window.location.hash || '').replace('#', '');
  return TABS.find((t) => t.id === h) ? h : null;
}

export function renderShell(root) {
  const user = Auth.getUser();
  root.innerHTML = `
    <header class="app-header">
      <div class="brand">fit<span class="accent">.mi</span></div>
      <div class="header-actions">
        <button class="icon-btn" id="btn-theme" title="Thème clair / sombre">
          ${icon('sun', { size: 20 })}
        </button>
        <button class="icon-btn" id="btn-settings" title="Réglages">
          ${icon('settings', { size: 20 })}
        </button>
        <button class="icon-btn avatar-btn" id="btn-user" title="${user?.name || ''}">
          ${user?.avatar_url
            ? `<img src="${user.avatar_url}" alt="">`
            : icon('user', { size: 18 })}
        </button>
      </div>
    </header>

    <main class="tab-host" id="tab-host">
      ${TABS.map((t) => `<section class="tab-pane" data-tab="${t.id}" hidden></section>`).join('')}
    </main>

    <nav class="bottom-nav">
      ${TABS.map((t) => `
        <button class="nav-item" data-tab="${t.id}">
          <span class="nav-icon">${icon(t.icon, { size: 22, stroke: 1.8 })}</span>
          <span class="nav-label">${t.label}</span>
        </button>
      `).join('')}
    </nav>

    <div class="user-menu" id="user-menu" hidden>
      <div class="user-menu-header">
        ${user?.avatar_url ? `<img class="avatar-lg" src="${user.avatar_url}" alt="">` : ''}
        <div>
          <div class="user-menu-name">${user?.name || 'Toi'}</div>
          <div class="user-menu-email">${user?.email || ''}</div>
        </div>
      </div>
      <button class="user-menu-item" id="mi-change-pw">
        ${icon('edit', { size: 16 })}<span>Changer le mot de passe</span>
      </button>
      <button class="user-menu-item" id="mi-logout">
        ${icon('logout', { size: 16 })}<span>Se déconnecter</span>
      </button>
    </div>
  `;

  const host = root.querySelector('#tab-host');
  const panes = new Map();
  for (const t of TABS) {
    panes.set(t.id, host.querySelector(`.tab-pane[data-tab="${t.id}"]`));
  }

  function setActive(id) {
    if (!panes.has(id)) id = TABS[0].id;
    for (const t of TABS) {
      const active = t.id === id;
      panes.get(t.id).hidden = !active;
      const btn = root.querySelector(`.nav-item[data-tab="${t.id}"]`);
      btn.classList.toggle('active', active);
    }
    localStorage.setItem(TAB_STORAGE, id);
    if (window.location.hash.replace('#', '') !== id) {
      history.replaceState({}, '', `#${id}`);
    }
    const handler = MOUNTS[id];
    const pane = panes.get(id);
    if (pane.dataset.mounted !== '1' && handler) {
      handler(pane);
      pane.dataset.mounted = '1';
    }
    // Drain any pending widget actions so the data we're about to
    // show reflects taps that happened while the app was idle in the
    // background (e.g. user opened Today widget, tapped + a few times,
    // then came back). flushPendingWidgetActions is a no-op on web
    // and a fast path on native when the queue is empty.
    import('../../core/widgets.js')
      .then(({ flushPendingWidgetActions }) => flushPendingWidgetActions())
      .catch(() => {});
  }

  // Bottom nav clicks
  root.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => setActive(btn.dataset.tab));
  });

  // Header buttons
  const themeBtn = root.querySelector('#btn-theme');
  themeBtn.addEventListener('click', () => {
    const next = Theme.toggle();
    themeBtn.innerHTML = next === 'light'
      ? icon('moon', { size: 20 })
      : icon('sun', { size: 20 });
  });
  root.querySelector('#btn-settings').addEventListener('click', () => openSettings());

  const menu = root.querySelector('#user-menu');
  root.querySelector('#btn-user').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true;
  });
  root.querySelector('#mi-change-pw').addEventListener('click', () => {
    menu.hidden = true;
    openPasswordChange();
  });
  root.querySelector('#mi-logout').addEventListener('click', () => Auth.logout());

  window.addEventListener('hashchange', () => {
    const id = tabFromHash();
    if (id) setActive(id);
  });

  setActive(tabFromHash() || localStorage.getItem(TAB_STORAGE) || TABS[0].id);
}

// Lazy-loaded tab mounts. Each module imports itself on first visit
// so the initial bundle is tiny.
const MOUNTS = {
  today:     (root) => import('../dashboard/dashboard.js').then((m) => m.mount(root)),
  nutrition: (root) => import('../nutrition/nutrition.js').then((m) => m.mount(root)),
  training:  (root) => import('../training/training.js').then((m) => m.mount(root)),
  budget:    (root) => import('../budget/budget.js').then((m) => m.mount(root)),
  stats:     (root) => import('../stats/stats.js').then((m) => m.mount(root)),
};
