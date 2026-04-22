// Thin bridge to Capacitor's native runtime when present.
//
// The web build runs without Capacitor: `isNative()` returns false and
// every helper in this file is a polite no-op. When the same code runs
// inside the iOS wrapper, Capacitor is injected on window and the
// helpers call the real plugins.
//
// We import Capacitor from its npm ESM entry point. The plain web build
// served by GitHub Pages resolves the import via the dist/ path (which
// we've bundled into ios/App/App/public at build time); on the plain
// web the bare-specifier import would fail, so we use a dynamic import
// wrapped in a try/catch.

const state = {
  ready: false,
  isNative: false,
  platform: 'web',
  Haptics: null,
  StatusBar: null,
};

async function ensureReady() {
  if (state.ready) return;
  state.ready = true;
  try {
    const cap = await import('https://esm.sh/@capacitor/core@8.3.1');
    const native = cap.Capacitor?.isNativePlatform?.();
    state.isNative = Boolean(native);
    state.platform = cap.Capacitor?.getPlatform?.() || 'web';
    if (state.isNative) {
      try {
        state.Haptics = (await import('https://esm.sh/@capacitor/haptics@8.0.2')).Haptics;
      } catch {}
      try {
        state.StatusBar = (await import('https://esm.sh/@capacitor/status-bar@8.0.2')).StatusBar;
      } catch {}
    }
  } catch {
    // No Capacitor available at all — stay on the polite-no-op path.
  }
}

export async function isNative() {
  await ensureReady();
  return state.isNative;
}

export async function getPlatform() {
  await ensureReady();
  return state.platform;
}

// Native-grade haptic on iOS; falls back to navigator.vibrate when
// we're in a web PWA that happens to support it.
export async function haptic(style = 'light') {
  await ensureReady();
  if (state.Haptics?.impact) {
    try {
      await state.Haptics.impact({ style });
      return;
    } catch {}
  }
  if (navigator.vibrate) navigator.vibrate(10);
}

// Ensures the status bar matches our current theme. No-op on web.
export async function applyStatusBarTheme(mode /* 'dark' | 'light' */) {
  await ensureReady();
  if (!state.StatusBar) return;
  try {
    await state.StatusBar.setStyle({ style: mode === 'light' ? 'LIGHT' : 'DARK' });
    await state.StatusBar.setBackgroundColor({ color: mode === 'light' ? '#f5f2ec' : '#0a0a0a' });
  } catch {}
}
