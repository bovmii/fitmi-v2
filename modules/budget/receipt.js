// Receipt scanner: snap a photo, ship to Gemini, get back structured
// expense data, hand off to the regular add-expense flow so the user
// reviews and edits before saving.
//
// The image is held in memory only — never written to IndexedDB or
// pushed to Supabase. Only the parsed fields end up persisted, via
// the existing saveExpense() path.

import { showToast, confirmModal } from '../../core/ui.js';
import { DB } from '../../core/db.js';
import { CATEGORIES } from './categories.js';
import { saveExpense } from './data.js';
import { todayStr } from '../../core/date.js';
import { isNative } from '../../core/native.js';
import { icon } from '../../core/icons.js';

const SETTINGS_KEY = 'budget.geminiApiKey';
const ALLOWED_KEYS = CATEGORIES.map((c) => c.key);

export async function getGeminiKey() {
  return (await DB.getSetting(SETTINGS_KEY)) || '';
}
export async function setGeminiKey(key) {
  return DB.setSetting(SETTINGS_KEY, String(key || '').trim());
}

// Open camera and return a base64 JPEG (no data URL prefix). Falls
// back to a hidden <input type=file> on the web build so the flow
// still works in a browser.
async function pickReceiptImage() {
  if (await isNative()) {
    try {
      const cap = await import('https://esm.sh/@capacitor/camera@8.1.0');
      const { Camera, CameraResultType, CameraSource } = cap;
      const photo = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        correctOrientation: true,
        width: 1600,
      });
      return { base64: photo.base64String, mime: `image/${photo.format || 'jpeg'}` };
    } catch (err) {
      if (String(err).includes('cancelled')) return null;
      throw err;
    }
  }
  // Web fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const [meta, b64] = dataUrl.split(',');
        const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
        resolve({ base64: b64, mime });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

const SYSTEM_PROMPT = `Tu es un assistant qui lit des tickets de caisse pour une app de finances perso. Réponds UNIQUEMENT en JSON valide, sans aucune prose, sans markdown.

Catégories autorisées (utilise EXACTEMENT ces clés): ${ALLOWED_KEYS.join(', ')}.

Schéma attendu :
{
  "store": string | null,
  "date": "YYYY-MM-DD" | null,
  "currency": "EUR" | "USD" | "CAD" | "GBP" | "CHF" | autre code ISO 4217,
  "total": number | null,
  "line_items": [{ "name": string, "price": number, "category": <une des clés autorisées> }],
  "dominant_category": <une des clés autorisées>,
  "confidence": 0..1,
  "language": ISO,
  "notes": string | null
}

Règles :
- Détecte la devise depuis les symboles ($, €, £, CHF, CAD, USD…) ou indices (langue, prix). Pas de conversion : reste dans la devise du ticket.
- Prix avec point décimal.
- Ignore lignes "TOTAL", "TVA", "TPS", "TVQ", "REMISE", "REDUCTION", "TAX".
- Si tu n'es pas sûr d'une catégorie, mets "Autre".
- Si total illisible → total: null, confidence < 0.5.
- Si la date n'est pas trouvée, mets null.`;

// FX cache: { base: { rate, fetchedAt } } — kept in module scope so
// repeated scans during one session don't re-hit Frankfurter.
const fxCache = new Map();
const FX_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function getEurRate(currency) {
  const code = String(currency || '').toUpperCase();
  if (!code || code === 'EUR') return 1;
  const cached = fxCache.get(code);
  if (cached && Date.now() - cached.fetchedAt < FX_TTL_MS) return cached.rate;
  try {
    // Frankfurter is ECB-backed, free, no key. Returns EUR per 1 unit
    // of `from` when symbols=EUR.
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(code)}&to=EUR`);
    if (!res.ok) throw new Error('fx ' + res.status);
    const data = await res.json();
    const rate = Number(data?.rates?.EUR);
    if (!rate || !isFinite(rate)) throw new Error('no rate');
    fxCache.set(code, { rate, fetchedAt: Date.now() });
    return rate;
  } catch (err) {
    console.warn('[receipt] FX fetch failed', err);
    return null; // signal failure — caller decides
  }
}

const CURRENCY_SYMBOL = {
  EUR: '€', USD: '$', CAD: 'CA$', GBP: '£', CHF: 'CHF',
  AUD: 'A$', JPY: '¥', CNY: '¥',
};
function fmtMoney(amount, currency) {
  const n = Number(amount) || 0;
  const sym = CURRENCY_SYMBOL[currency] || `${currency} `;
  return `${n.toFixed(2).replace('.', ',')} ${sym}`.trim();
}

async function callGemini({ base64, mime, apiKey }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: SYSTEM_PROMPT },
        { inlineData: { mimeType: mime, data: base64 } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini non-JSON: ' + text.slice(0, 120));
  }
}

function clampCategory(cat) {
  return ALLOWED_KEYS.includes(cat) ? cat : 'Autre';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Editable review drawer. Pre-fills with what Gemini parsed but lets
// the user fix anything before saving — store, date, currency, total,
// and (in multi mode) every line item's name/price/category. Returns
// the array of expenses to persist, or null on cancel.
async function openReceiptReview(parsed) {
  const currency = String(parsed.currency || 'EUR').toUpperCase();
  const eurRate = await getEurRate(currency);

  const toEur = (amt) => {
    if (currency === 'EUR') return Number(amt) || 0;
    if (eurRate == null) return Number(amt) || 0;
    return Math.round((Number(amt) || 0) * eurRate * 100) / 100;
  };

  const initialItems = Array.isArray(parsed.line_items)
    ? parsed.line_items.filter((i) => Number(i.price) > 0)
    : [];

  const state = {
    mode: initialItems.length > 1 ? 'multi' : 'single',
    store: parsed.store || 'Ticket scanné',
    date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : todayStr(),
    total: Number(parsed.total) || initialItems.reduce((s, i) => s + (Number(i.price) || 0), 0),
    category: clampCategory(parsed.dominant_category),
    items: initialItems.length > 0
      ? initialItems.map((i) => ({
          name: String(i.name || '').slice(0, 80),
          price: Number(i.price) || 0,
          category: clampCategory(i.category),
        }))
      : [{ name: '', price: Number(parsed.total) || 0, category: clampCategory(parsed.dominant_category) }],
  };

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    document.body.appendChild(overlay);

    function fxLabel(amt) {
      if (currency === 'EUR') return '';
      if (eurRate == null) return `<span class="receipt-fx muted">taux EUR indisponible</span>`;
      return `<span class="receipt-fx">≈ ${fmtMoney(amt * eurRate, 'EUR')}</span>`;
    }

    function render() {
      const grandTotal = state.mode === 'single'
        ? state.total
        : state.items.reduce((s, i) => s + (Number(i.price) || 0), 0);
      overlay.innerHTML = `
        <form class="drawer habit-form receipt-review">
          <div class="drawer-header">
            <h2>Vérifier le ticket</h2>
            <button type="button" class="icon-btn" data-close>${icon('x', { size: 22 })}</button>
          </div>
          <div class="drawer-body">

            <label class="auth-field">
              <span>Magasin</span>
              <input type="text" data-store value="${escapeHtml(state.store)}">
            </label>

            <label class="auth-field">
              <span>Date</span>
              <input type="date" data-date value="${escapeHtml(state.date)}">
            </label>

            <div class="settings-segment receipt-mode-seg">
              <button type="button" data-mode="single" class="${state.mode === 'single' ? 'active' : ''}">Une seule dépense</button>
              <button type="button" data-mode="multi" class="${state.mode === 'multi' ? 'active' : ''}">Une par ligne</button>
            </div>

            ${state.mode === 'single' ? renderSingle() : renderMulti()}

            <div class="receipt-grand">
              <span>Total ${state.mode === 'multi' ? 'lignes' : ''}</span>
              <strong>${fmtMoney(grandTotal, currency)} ${fxLabel(grandTotal)}</strong>
            </div>

            <div class="form-actions">
              <button type="submit" class="auth-submit">Enregistrer ${state.mode === 'multi' ? `${state.items.length} dépense${state.items.length > 1 ? 's' : ''}` : 'la dépense'}</button>
            </div>
          </div>
        </form>
      `;
      bind();
    }

    function renderSingle() {
      return `
        <label class="auth-field">
          <span>Montant (${currency})</span>
          <input type="number" inputmode="decimal" step="0.01" min="0" data-total value="${state.total}">
        </label>
        <div class="auth-field">
          <span>Catégorie</span>
          <div class="cat-grid" data-cat-grid="single">
            ${CATEGORIES.map((c) => `
              <button type="button" class="cat-pick ${state.category === c.key ? 'active' : ''}" data-category="${c.key}" style="${state.category === c.key ? `--cat-color:${c.color};` : ''}">
                <span class="cat-icon" style="color:${c.color};">${icon(c.icon, { size: 18, stroke: 2 })}</span>
                <span class="cat-label">${c.key}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    function renderMulti() {
      return `
        <div class="receipt-items">
          ${state.items.map((it, idx) => `
            <div class="receipt-item" data-idx="${idx}">
              <div class="receipt-item-row">
                <input type="text" data-item-name="${idx}" placeholder="Nom" value="${escapeHtml(it.name)}">
                <input type="number" inputmode="decimal" step="0.01" min="0" data-item-price="${idx}" value="${it.price}" class="receipt-item-price">
                <button type="button" class="icon-btn receipt-item-del" data-del="${idx}" title="Retirer">${icon('trash', { size: 16 })}</button>
              </div>
              <div class="receipt-item-cats" data-cat-grid="${idx}">
                ${CATEGORIES.map((c) => `
                  <button type="button" class="receipt-item-cat ${it.category === c.key ? 'active' : ''}" data-category="${c.key}" data-target="${idx}" style="--cat-color:${c.color};color:${it.category === c.key ? c.color : 'var(--text-muted)'}">
                    ${icon(c.icon, { size: 14, stroke: 2 })}
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <button type="button" class="settings-btn" data-add-line>
          ${icon('plus', { size: 16 })}<span>Ajouter une ligne</span>
        </button>
      `;
    }

    function bind() {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      overlay.querySelector('[data-close]').onclick = () => close(null);

      overlay.querySelectorAll('[data-mode]').forEach((b) => {
        b.onclick = () => { state.mode = b.dataset.mode; render(); };
      });
      overlay.querySelector('[data-store]').oninput = (e) => { state.store = e.target.value; };
      overlay.querySelector('[data-date]').onchange = (e) => { state.date = e.target.value; };

      // SINGLE mode wires
      overlay.querySelector('[data-total]')?.addEventListener('input', (e) => { state.total = Number(e.target.value) || 0; updateGrand(); });
      overlay.querySelectorAll('[data-cat-grid="single"] button').forEach((b) => {
        b.onclick = () => { state.category = b.dataset.category; render(); };
      });

      // MULTI mode wires
      overlay.querySelectorAll('[data-item-name]').forEach((el) => {
        el.oninput = (e) => { state.items[el.dataset.itemName].name = e.target.value; };
      });
      overlay.querySelectorAll('[data-item-price]').forEach((el) => {
        el.oninput = (e) => { state.items[el.dataset.itemPrice].price = Number(e.target.value) || 0; updateGrand(); };
      });
      overlay.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = () => { state.items.splice(Number(b.dataset.del), 1); if (!state.items.length) state.items.push({ name: '', price: 0, category: 'Autre' }); render(); };
      });
      overlay.querySelectorAll('.receipt-item-cat').forEach((b) => {
        b.onclick = () => { state.items[b.dataset.target].category = b.dataset.category; render(); };
      });
      overlay.querySelector('[data-add-line]')?.addEventListener('click', () => {
        state.items.push({ name: '', price: 0, category: state.category });
        render();
      });

      overlay.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const drafts = buildDrafts();
        if (!drafts.length) { showToast('Aucune ligne valide'); return; }
        close(drafts);
      });
    }

    function updateGrand() {
      const grand = state.mode === 'single'
        ? state.total
        : state.items.reduce((s, i) => s + (Number(i.price) || 0), 0);
      const el = overlay.querySelector('.receipt-grand strong');
      if (el) el.innerHTML = `${fmtMoney(grand, currency)} ${fxLabel(grand)}`;
    }

    function buildDrafts() {
      if (state.mode === 'single') {
        if (!state.total || state.total <= 0) return [];
        const note = currency === 'EUR' ? '' : ` · ${fmtMoney(state.total, currency)}${eurRate ? ` ≈ ${fmtMoney(toEur(state.total), 'EUR')}` : ''}`;
        return [{
          amount: toEur(state.total),
          category: state.category,
          description: `${state.store}${note}`,
          date: state.date,
        }];
      }
      return state.items
        .filter((i) => Number(i.price) > 0)
        .map((i) => {
          const note = currency === 'EUR' ? '' : ` · ${fmtMoney(i.price, currency)}${eurRate ? ` ≈ ${fmtMoney(toEur(i.price), 'EUR')}` : ''}`;
          return {
            amount: toEur(i.price),
            category: i.category,
            description: `${state.store} · ${i.name || '—'}${note}`,
            date: state.date,
          };
        });
    }

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    render();
  });
}

// Public entry: from button tap to expenses persisted. Returns the
// number of expenses created (0 on cancel, 1+ on success).
export async function captureAndScanReceipt() {
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    const ok = await confirmModal(
      "Pour scanner les tickets il faut une clé Gemini API. Tu peux l'ajouter dans Réglages → Scanner de tickets.",
      { confirmText: 'OK', cancelText: '' },
    );
    return 0;
  }

  let img;
  try {
    img = await pickReceiptImage();
  } catch (err) {
    showToast('Impossible d\'ouvrir l\'appareil photo');
    return 0;
  }
  if (!img) return 0;

  showToast('Lecture du ticket…');

  let parsed;
  try {
    parsed = await callGemini({ base64: img.base64, mime: img.mime, apiKey });
  } catch (err) {
    console.error('[receipt] gemini failed', err);
    showToast('Lecture échouée — saisis manuellement');
    return 0;
  }

  const drafts = await openReceiptReview(parsed);
  if (!drafts) return 0; // user cancelled
  if (!drafts.length) {
    showToast('Aucune ligne à enregistrer');
    return 0;
  }

  let saved = 0;
  for (const d of drafts) {
    if (!d.amount || d.amount <= 0) continue;
    await saveExpense(d);
    saved++;
  }
  if (saved > 0) {
    const total = drafts.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    showToast(`${saved} dépense${saved > 1 ? 's' : ''} ajoutée${saved > 1 ? 's' : ''} · ${total.toFixed(2).replace('.', ',')} €`);
  }
  return saved;
}
