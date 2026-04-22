// Barcode scanner overlay. Camera stream inside a full-screen sheet,
// ZXing decodes frames client-side (no cloud call), on detection the
// sheet closes with the decoded string.
//
// BarcodeDetector (the native API) would be lighter but it ships
// inconsistently: Safari iOS 17+, Chrome Android, Mac Safari 17+, not
// Chrome desktop / Firefox. We try it first, fall back to ZXing for
// the rest.
//
// ZXing is loaded lazily from esm.sh the first time the user opens
// the scanner, so the initial app payload stays small.

import { icon } from '../../core/icons.js';

function overlayHtml() {
  return `
    <div class="scanner-header">
      <div class="scanner-title">Scanner un code-barres</div>
      <button class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
    </div>
    <div class="scanner-stage">
      <video data-video autoplay muted playsinline></video>
      <div class="scanner-reticle"></div>
    </div>
    <div class="scanner-hint" data-hint>Pointe l'appareil vers un code-barres.</div>
  `;
}

export function openScanner() {
  return new Promise(async (resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scanner-overlay';
    overlay.innerHTML = overlayHtml();
    document.body.appendChild(overlay);
    const video = overlay.querySelector('[data-video]');
    const hint = overlay.querySelector('[data-hint]');

    let stream = null;
    let stopped = false;
    let zxingControls = null;
    let nativeTimer = null;

    const close = (code) => {
      if (stopped) return;
      stopped = true;
      if (zxingControls?.stop) { try { zxingControls.stop(); } catch {} }
      if (nativeTimer) cancelAnimationFrame(nativeTimer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
      resolve(code);
    };

    overlay.querySelector('[data-close]').onclick = () => close(null);

    // Ask for the back camera preferably; fall back to any camera.
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (err) {
      hint.textContent = `Caméra inaccessible : ${err.message || err}. Active l'accès dans les réglages de Safari.`;
      setTimeout(() => close(null), 4000);
      return;
    }
    video.srcObject = stream;
    await new Promise((r) => { video.onloadedmetadata = () => { video.play(); r(); }; });

    // Prefer the native BarcodeDetector when present (works on iOS 17+
    // Safari and most mobile browsers).
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.() ?? [];
        const usable = formats.length === 0 ? undefined : formats;
        const detector = new window.BarcodeDetector(usable ? { formats: usable } : undefined);
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(video);
            if (found && found.length > 0) {
              close(found[0].rawValue || found[0].rawValue?.toString() || null);
              return;
            }
          } catch {}
          nativeTimer = requestAnimationFrame(() => setTimeout(tick, 200));
        };
        tick();
        return;
      } catch {
        // fall through to ZXing
      }
    }

    // ZXing fallback: dynamic import so users without the scanner never
    // pay the download cost.
    try {
      const mod = await import('https://esm.sh/@zxing/browser@0.1.5');
      const reader = new mod.BrowserMultiFormatReader();
      hint.textContent = 'Pointe sur le code-barres…';
      zxingControls = await reader.decodeFromVideoElement(video, (result, err) => {
        if (result && !stopped) close(result.getText());
      });
    } catch (err) {
      hint.textContent = `Scanner indisponible : ${err.message || err}`;
      setTimeout(() => close(null), 4000);
    }
  });
}
