// Date helpers. All date-only values are serialized as 'YYYY-MM-DD' strings;
// anchoring to noon local time when re-parsing avoids DST edge cases around
// midnight.

const DAYS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAYS_FR_SUNDAY_FIRST = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_SHORT = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export { DAYS_FULL, DAYS_SHORT, MONTHS_SHORT, MONTHS_LONG };

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(dateString) {
  return new Date(dateString + 'T12:00:00');
}

export function getDayOfWeek(dateString) {
  return parseDate(dateString).getDay();
}

// 0 = Monday, 6 = Sunday — matches DAYS_FULL / DAYS_SHORT indexing.
export function getTodayDayIndex() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function addDays(dateString, n) {
  const d = parseDate(dateString);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

export function formatDateFr(dateString) {
  const d = parseDate(dateString);
  return `${DAYS_FR_SUNDAY_FIRST[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatDateFrLong(dateString) {
  const d = parseDate(dateString);
  const day = DAYS_FULL[(d.getDay() + 6) % 7].toLowerCase();
  return `${day} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

// ISO week key "YYYY-Www", Monday-based. Matches fit.mi meal planner.
export function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getMonday(weekKey) {
  const [year, wStr] = weekKey.split('-W');
  const jan4 = new Date(Number(year), 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (Number(wStr) - 1) * 7);
  return monday;
}

export function shiftWeek(weekKey, delta) {
  const mon = getMonday(weekKey);
  mon.setDate(mon.getDate() + delta * 7);
  return getWeekKey(mon);
}

export function formatWeekRange(weekKey) {
  const mon = getMonday(weekKey);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmtD = (d) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return `${fmtD(mon)} — ${fmtD(sun)} ${sun.getFullYear()}`;
}

// "YYYY-MM" for the current month. Used by budget aggregation.
export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthKeyFromDate(dateString) {
  return dateString.slice(0, 7);
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-');
  return `${MONTHS_LONG[Number(m) - 1]} ${y}`;
}
