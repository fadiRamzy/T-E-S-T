import { GRADE_BASE, MONTH_NAMES } from './constants';
import { todaySerial } from './dates';
import type { Grade, MonthRecord, Raw } from './types';

/** Excel SUM semantics: only real numbers count; text / blank = 0. */
export function num(v: Raw | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Monthly total (column Q) = SUM(H:P) = visits + 8 scores. */
export function monthTotal(r: Pick<MonthRecord, 'visits' | 'scores'>): number {
  let t = num(r.visits);
  for (const s of r.scores) t += num(s);
  return t;
}

/** K = (TODAY() - F) / 30  (blank join = 0 => ~1500 months, exactly like Excel). */
export function monthsSince(join: Raw, today: number): number {
  const f = typeof join === 'number' ? join : 0;
  return (today - f) / 30;
}

export function tenureFactor(m: number): number {
  if (m <= 3) return 0.25;
  if (m <= 6) return 0.5;
  if (m <= 9) return 0.75;
  return 1;
}

/** Annual grade exactly as the J-column LET formula (U+064B kept in "جيد جداً"). */
export function gradeFor(points: number, monthsSinceJoin: number): Grade {
  const m = Math.floor(monthsSinceJoin); // INT() (floors; negatives floor too)
  const p = tenureFactor(m);
  const n = points;
  if (n < GRADE_BASE.poor * p) return 'ضعيف';
  if (n < GRADE_BASE.ok * p) return 'مقبول';
  if (n < GRADE_BASE.good * p) return 'جيد';
  if (n < GRADE_BASE.vgood * p) return 'جيد جداً';
  return 'ممتاز';
}

export function annualGrade(points: number, join: Raw, asOf?: string | number | Date, date1904 = false): { k: number; m: number; p: number; grade: Grade } {
  const k = monthsSince(join, todaySerial(asOf, date1904));
  const m = Math.floor(k);
  return { k, m, p: tenureFactor(m), grade: gradeFor(points, k) };
}

export function monthIndex(name: string): number {
  return (MONTH_NAMES as readonly string[]).indexOf(name) + 1;
}
