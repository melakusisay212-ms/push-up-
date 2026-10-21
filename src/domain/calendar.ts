// Calendar utilities. Every stored date is a local-calendar ISO string (YYYY-MM-DD).
// The Ethiopian (Habesha) calendar is the DISPLAY calendar by default; Gregorian is opt-in.
export type IsoDate = string;
const ETH_EPOCH = 1723856; // JDN origin used by both conversions (Meskerem 1 of year 1 EC = ETH_EPOCH + 365)

export function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
export function jdnToGregorian(jdn: number): [number, number, number] {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return [100 * b + d - 4800 + Math.floor(m / 10), m + 3 - 12 * Math.floor(m / 10), e - Math.floor((153 * m + 2) / 5) + 1];
}
export function ethiopianToJdn(y: number, m: number, d: number): number {
  return ETH_EPOCH + 365 * y + Math.floor(y / 4) + 30 * m + d - 31;
}
export function jdnToEthiopian(jdn: number): [number, number, number] {
  const r = (jdn - ETH_EPOCH) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - ETH_EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  return [year, Math.floor(n / 30) + 1, (n % 30) + 1];
}
export function parseIso(iso: IsoDate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
export function isoToJdn(iso: IsoDate): number { const [y, m, d] = parseIso(iso); return gregorianToJdn(y, m, d); }
export function jdnToIso(jdn: number): IsoDate {
  const [y, m, d] = jdnToGregorian(jdn);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function addDays(iso: IsoDate, n: number): IsoDate { return jdnToIso(isoToJdn(iso) + n); }
export function daysBetween(a: IsoDate, b: IsoDate): number { return isoToJdn(b) - isoToJdn(a); }
/** ISO weekday: Monday = 1 ... Sunday = 7 */
export function weekday(iso: IsoDate): number { return (isoToJdn(iso) % 7) + 1; }
/** weekStart: 1 = Monday (default; the Ethiopian week begins on Segno/Monday), 7 = Sunday */
export function startOfWeek(iso: IsoDate, weekStart = 1): IsoDate {
  const diff = (weekday(iso) - weekStart + 7) % 7;
  return addDays(iso, -diff);
}
/** Local calendar date of the device clock (never UTC). */
export function localTodayIso(now: Date = new Date()): IsoDate {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function isoToEthiopian(iso: IsoDate): [number, number, number] { return jdnToEthiopian(isoToJdn(iso)); }
export function ethiopianToIso(y: number, m: number, d: number): IsoDate { return jdnToIso(ethiopianToJdn(y, m, d)); }
export function ethMonthLength(year: number, month: number): number { return month < 13 ? 30 : year % 4 === 3 ? 6 : 5; }
function gregLen(y: number, m: number): number {
  return [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export const ETH_MONTHS_LATIN = ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'];
export const ETH_MONTHS_AMHARIC = ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን'];
export const WEEKDAYS_LATIN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_AMHARIC = ['ሰኞ', 'ማክሰ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ', 'እሁድ'];
export const GREG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type CalendarSystem = 'ethiopian' | 'gregorian';
export type NameScript = 'latin' | 'amharic';
export interface CalendarPrefs { system: CalendarSystem; script: NameScript }
export const DEFAULT_CALENDAR: CalendarPrefs = { system: 'ethiopian', script: 'latin' };

export function monthName(month: number, prefs: CalendarPrefs): string {
  if (prefs.system === 'gregorian') return GREG_MONTHS[month - 1];
  return (prefs.script === 'amharic' ? ETH_MONTHS_AMHARIC : ETH_MONTHS_LATIN)[month - 1];
}
export function weekdayName(isoWeekday: number, prefs: CalendarPrefs): string {
  return (prefs.script === 'amharic' && prefs.system === 'ethiopian' ? WEEKDAYS_AMHARIC : WEEKDAYS_LATIN)[isoWeekday - 1];
}
export function formatDate(iso: IsoDate, prefs: CalendarPrefs = DEFAULT_CALENDAR, withWeekday = false): string {
  const [y, m, d] = prefs.system === 'ethiopian' ? isoToEthiopian(iso) : parseIso(iso);
  const base = `${monthName(m, prefs)} ${d}, ${y}`;
  return withWeekday ? `${weekdayName(weekday(iso), prefs)} ${base}` : base;
}
export interface MonthCell { iso: IsoDate; day: number }
export interface MonthGrid { year: number; month: number; title: string; cells: (MonthCell | null)[] }
/** Month grid in the chosen calendar; leading nulls align the first day to the week start. */
export function monthGrid(year: number, month: number, prefs: CalendarPrefs, weekStart = 1): MonthGrid {
  const eth = prefs.system === 'ethiopian';
  const first = eth ? ethiopianToIso(year, month, 1) : `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const len = eth ? ethMonthLength(year, month) : gregLen(year, month);
  const cells: (MonthCell | null)[] = Array((weekday(first) - weekStart + 7) % 7).fill(null);
  for (let i = 0; i < len; i++) cells.push({ iso: addDays(first, i), day: i + 1 });
  return { year, month, title: `${monthName(month, prefs)} ${year}`, cells };
}
export function shiftMonth(year: number, month: number, delta: number, prefs: CalendarPrefs): [number, number] {
  const per = prefs.system === 'ethiopian' ? 13 : 12;
  const idx = year * per + (month - 1) + delta;
  return [Math.floor(idx / per), ((idx % per) + per) % per + 1];
}
export function currentMonth(iso: IsoDate, prefs: CalendarPrefs): [number, number] {
  const [y, m] = prefs.system === 'ethiopian' ? isoToEthiopian(iso) : parseIso(iso);
  return [y, m];
}
