// Tiny hand-rolled SVG chart helpers. No dependency — the shapes are
// trivial and we own the styling. Both helpers return an HTML string
// so sections can concatenate them into innerHTML.
//
// lineChart({ points: [{ label, value }], color, target? })
// barChart ({ bars:   [{ label, value, hlTarget? }], color, target? })

const VB_WIDTH = 320;
const VB_HEIGHT = 140;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function niceRange(values, fallback = 0) {
  if (values.length === 0) return { min: 0, max: Math.max(1, fallback) };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const pad = span * 0.1 || 1;
  return { min: Math.max(0, Math.floor(min - pad)), max: Math.ceil(max + pad) };
}

function scaleY(v, min, max) {
  if (max === min) return PAD_T + (VB_HEIGHT - PAD_T - PAD_B) / 2;
  return PAD_T + (1 - (v - min) / (max - min)) * (VB_HEIGHT - PAD_T - PAD_B);
}

export function lineChart({ points, color = '#c4a87a', target = null }) {
  if (!points || points.length === 0) return emptyChart('Pas encore de données.');

  const values = points.map((p) => p.value);
  if (target) values.push(target);
  const { min, max } = niceRange(values);

  const innerW = VB_WIDTH - PAD_L - PAD_R;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;

  const pathD = points.map((p, i) => {
    const x = PAD_L + i * step;
    const y = scaleY(p.value, min, max);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const dots = points.map((p, i) => {
    const x = PAD_L + i * step;
    const y = scaleY(p.value, min, max);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"/>`;
  }).join('');

  return `
    <svg class="chart" viewBox="0 0 ${VB_WIDTH} ${VB_HEIGHT}" preserveAspectRatio="none">
      ${axisY(min, max)}
      ${target ? axisTarget(target, min, max) : ''}
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${axisLabels(points)}
    </svg>
  `;
}

export function barChart({ bars, color = '#c4a87a', target = null }) {
  if (!bars || bars.length === 0) return emptyChart('Pas encore de données.');

  const values = bars.map((b) => b.value);
  if (target) values.push(target);
  const { min, max } = niceRange(values, 10);

  const innerW = VB_WIDTH - PAD_L - PAD_R;
  const slot = innerW / bars.length;
  const barWidth = Math.max(4, slot * 0.7);
  const baseY = scaleY(Math.max(0, min), min, max);

  const shapes = bars.map((b, i) => {
    const x = PAD_L + slot * i + (slot - barWidth) / 2;
    const y = scaleY(b.value, min, max);
    const h = baseY - y;
    const hlColor = b.hlTarget ? 'var(--success)' : color;
    return `<rect x="${x.toFixed(1)}" y="${Math.min(y, baseY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.abs(h).toFixed(1)}" rx="2" fill="${hlColor}"/>`;
  }).join('');

  return `
    <svg class="chart" viewBox="0 0 ${VB_WIDTH} ${VB_HEIGHT}" preserveAspectRatio="none">
      ${axisY(min, max)}
      ${target ? axisTarget(target, min, max) : ''}
      ${shapes}
      ${axisLabels(bars)}
    </svg>
  `;
}

function axisY(min, max) {
  const mid = Math.round((min + max) / 2);
  const yMin = scaleY(min, min, max);
  const yMid = scaleY(mid, min, max);
  const yMax = scaleY(max, min, max);
  return `
    <line x1="${PAD_L}" y1="${yMax}" x2="${VB_WIDTH - PAD_R}" y2="${yMax}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="2 2"/>
    <line x1="${PAD_L}" y1="${yMid}" x2="${VB_WIDTH - PAD_R}" y2="${yMid}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="2 2"/>
    <line x1="${PAD_L}" y1="${yMin}" x2="${VB_WIDTH - PAD_R}" y2="${yMin}" stroke="var(--border)" stroke-width="0.5"/>
    <text x="4" y="${(yMax + 3).toFixed(1)}" class="chart-axis">${max}</text>
    <text x="4" y="${(yMid + 3).toFixed(1)}" class="chart-axis">${mid}</text>
    <text x="4" y="${(yMin + 3).toFixed(1)}" class="chart-axis">${min}</text>
  `;
}

function axisTarget(target, min, max) {
  const y = scaleY(target, min, max);
  return `<line x1="${PAD_L}" y1="${y}" x2="${VB_WIDTH - PAD_R}" y2="${y}" stroke="var(--success)" stroke-width="1" stroke-dasharray="3 3"/>`;
}

function axisLabels(data) {
  const n = data.length;
  if (n === 0) return '';
  const innerW = VB_WIDTH - PAD_L - PAD_R;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const ticks = Math.min(4, n);
  const stride = Math.max(1, Math.floor(n / ticks));
  let html = '';
  for (let i = 0; i < n; i += stride) {
    const x = PAD_L + (n > 1 ? i * step : innerW / 2);
    const label = data[i].label || '';
    if (!label) continue;
    html += `<text x="${x.toFixed(1)}" y="${VB_HEIGHT - 6}" text-anchor="middle" class="chart-axis chart-axis-x">${escapeText(label)}</text>`;
  }
  return html;
}

function emptyChart(message) {
  return `
    <svg class="chart chart-empty" viewBox="0 0 ${VB_WIDTH} ${VB_HEIGHT}" preserveAspectRatio="none">
      <text x="${VB_WIDTH / 2}" y="${VB_HEIGHT / 2 + 4}" text-anchor="middle" class="chart-axis">${escapeText(message)}</text>
    </svg>
  `;
}

function escapeText(str) {
  return String(str || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
}
