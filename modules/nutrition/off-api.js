// Open Food Facts lookup.
//
// OFF is a crowdsourced, public product database. No API key, CORS-
// enabled, respects its users' right to factual data. The API returns a
// huge JSON blob per barcode — we keep only what the add-food form
// needs (name, brand, macros per 100g).
//
// Spec: https://openfoodfacts.github.io/openfoodfacts-server/api/

const BASE = 'https://world.openfoodfacts.org/api/v2/product';

export async function lookupBarcode(barcode) {
  const code = String(barcode || '').replace(/\D/g, '');
  if (code.length < 8) return { ok: false, reason: 'invalid-barcode' };
  try {
    // No custom headers: OFF serves its REST endpoint with simple CORS
    // but rejects preflighted (non-simple) requests from some origins.
    // The `.json` suffix already tells the server what we want.
    const res = await fetch(`${BASE}/${code}.json`);
    if (!res.ok) return { ok: false, reason: 'http-' + res.status };
    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      return { ok: false, reason: 'not-found' };
    }
    const p = data.product;
    const n = p.nutriments || {};

    // OFF stores either `energy-kcal_100g` (preferred) or `energy_100g`
    // in kJ — convert if only kJ is present.
    let kcal = Number(n['energy-kcal_100g']);
    if (!kcal && n.energy_100g) {
      const unit = String(n.energy_unit || '').toLowerCase();
      const raw = Number(n.energy_100g);
      kcal = unit === 'kj' ? raw / 4.184 : raw;
    }

    return {
      ok: true,
      barcode: code,
      name: p.product_name_fr || p.product_name || 'Produit',
      brand: p.brands || '',
      imageUrl: p.image_front_small_url || p.image_front_thumb_url || null,
      kcal: round1(kcal || 0),
      p:    round1(Number(n.proteins_100g) || 0),
      c:    round1(Number(n.carbohydrates_100g) || 0),
      f:    round1(Number(n.fat_100g) || 0),
      servingSize: p.serving_size || null,
      quantity: p.quantity || null,
    };
  } catch (err) {
    return { ok: false, reason: 'network', error: String(err) };
  }
}

function round1(n) { return Math.round(n * 10) / 10; }
