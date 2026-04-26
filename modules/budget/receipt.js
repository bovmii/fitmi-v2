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

const SYSTEM_PROMPT = `Tu es un assistant qui lit des tickets de caisse français pour une app de finances perso. Réponds UNIQUEMENT en JSON valide, sans aucune prose, sans markdown.

Catégories autorisées (utilise EXACTEMENT ces clés): ${ALLOWED_KEYS.join(', ')}.

Schéma attendu :
{
  "store": string | null,
  "date": "YYYY-MM-DD" | null,
  "currency": "EUR" | string,
  "total": number | null,
  "line_items": [{ "name": string, "price": number, "category": <une des clés autorisées> }],
  "dominant_category": <une des clés autorisées>,
  "confidence": 0..1,
  "language": ISO,
  "notes": string | null
}

Règles :
- Prix en euros, point décimal.
- Ignore lignes "TOTAL", "TVA", "REMISE", "REDUCTION".
- Si tu n'es pas sûr d'une catégorie, mets "Autre".
- Si total illisible → total: null, confidence < 0.5.
- Si la date n'est pas trouvée, mets null.`;

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

// Show a small confirm sheet asking how to log the receipt: as a
// single expense, or one expense per line item. Single is the
// default since most quick scans only need the total.
async function openReceiptReview(parsed) {
  const total = Number(parsed.total) || 0;
  const date = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : todayStr();
  const description = parsed.store || 'Ticket scanné';
  const dominant = clampCategory(parsed.dominant_category);
  const items = Array.isArray(parsed.line_items) ? parsed.line_items.filter((i) => Number(i.price) > 0) : [];

  if (items.length <= 1 || total <= 0) {
    return [{ amount: total, category: dominant, description, date }];
  }

  const choice = await confirmModal(
    `Ticket de ${total.toFixed(2).replace('.', ',')} € chez ${description} — ${items.length} articles détectés.\n\nUne dépense unique ou une par ligne ?`,
    { confirmText: 'Une par ligne', cancelText: 'Une seule' },
  );
  if (!choice) {
    return [{ amount: total, category: dominant, description, date }];
  }
  return items.map((i) => ({
    amount: Number(i.price) || 0,
    category: clampCategory(i.category),
    description: `${description} · ${i.name}`,
    date,
  }));
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
  if (!drafts.length || drafts[0].amount <= 0) {
    showToast('Aucun montant détecté — saisis manuellement');
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
