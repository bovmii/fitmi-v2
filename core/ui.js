// Shared UI primitives: theme toggle, toast, confirm modal, haptics.
// None of these depend on a specific DOM structure — the toast element is
// created on demand, the modal is spawned as a portal on <body>.

const THEME_KEY = 'fitmi.theme';

// ----- Theme -----
// Auto mode follows prefers-color-scheme; dark/light override it. We swap
// data-theme on <html> so CSS variables (defined under [data-theme='dark']
// and [data-theme='light']) react without a page reload.

function resolveAuto() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const Theme = {
  get() {
    return localStorage.getItem(THEME_KEY) || 'auto';
  },

  apply(mode) {
    const effective = mode === 'auto' ? resolveAuto() : mode;
    document.documentElement.setAttribute('data-theme', effective);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effective === 'light' ? '#f5f2ec' : '#0a0a0a');
  },

  set(mode) {
    if (mode === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
    this.apply(mode);
  },

  toggle() {
    const current = this.get();
    const effective = current === 'auto' ? resolveAuto() : current;
    const next = effective === 'dark' ? 'light' : 'dark';
    this.set(next);
    return next;
  },

  init() {
    this.apply(this.get());
    // Respond to OS theme changes when mode is auto (no reload).
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (this.get() === 'auto') this.apply('auto');
    });
  },
};

// ----- Toast -----
let toastEl = null;
let toastTimeout = null;

export function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ----- Confirm modal -----
// Returns a Promise<boolean>. Uses project CSS classes .modal-overlay and
// .modal-box so styling stays consistent with the rest of the app.

export function confirmModal(message, { confirmText = 'Confirmer', cancelText = 'Annuler', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const confirmClass = danger ? 'modal-confirm modal-danger' : 'modal-confirm';
    overlay.innerHTML = `
      <div class="modal-box">
        <p class="modal-message"></p>
        <div class="modal-buttons">
          <button class="modal-cancel" type="button"></button>
          <button class="${confirmClass}" type="button"></button>
        </div>
      </div>
    `;
    overlay.querySelector('.modal-message').textContent = message;
    const cancelBtn = overlay.querySelector('.modal-cancel');
    const confirmBtn = overlay.querySelector('.modal-confirm');
    cancelBtn.textContent = cancelText;
    confirmBtn.textContent = confirmText;
    document.body.appendChild(overlay);
    const close = (value) => { overlay.remove(); resolve(value); };
    cancelBtn.onclick = () => close(false);
    confirmBtn.onclick = () => close(true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

// ----- Haptics -----
// Thin wrapper around navigator.vibrate. When the app is later wrapped in
// Capacitor, core/haptics.js can shadow this with @capacitor/haptics.

export function haptic(pattern = 10) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ----- Utility -----
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
