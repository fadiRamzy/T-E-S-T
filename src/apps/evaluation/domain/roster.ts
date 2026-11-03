import { annualGrade, monthTotal, num } from './calc';
import { CAP } from './constants';
import type { AppModel, EmployeeRow, MonthRecord, Raw } from './types';

export function codeKey(c: Raw): string | null {
  if (c === null || c === undefined) return null;
  if (typeof c === 'string' && c.trim() === '') return null;
  return String(c).trim();
}

export function sortedMonthRecords(model: AppModel): MonthRecord[] {
  return [...model.months].sort((a, b) => a.month - b.month || a.row - b.row);
}

/** First record (by row) of a code in a month — the one XLOOKUP / MATCH would hit. */
export function recordIn(model: AppModel, month: number, key: string): MonthRecord | undefined {
  let best: MonthRecord | undefined;
  for (const r of model.months) {
    if (r.month !== month || codeKey(r.code) !== key) continue;
    if (!best || r.row < best.row) best = r;
  }
  return best;
}

export interface Roster {
  rows: EmployeeRow[];
  overflow: number; // distinct codes beyond capacity (not shown by the workbook)
}

/** Employee master = distinct codes ordered by (first month, row); identity = first occurrence. */
export function buildRoster(model: AppModel, asOf?: string | number | Date): Roster {
  const seen = new Map<string, MonthRecord>();
  for (const r of sortedMonthRecords(model)) {
    const k = codeKey(r.code);
    if (k === null || seen.has(k)) continue;
    seen.set(k, r);
  }
  const all = [...seen.entries()];
  const rows: EmployeeRow[] = [];
  all.slice(0, CAP.main).forEach(([key, first], i) => {
    let visits = 0;
    let points = 0;
    for (let m = 1; m <= 12; m++) {
      const rec = recordIn(model, m, key);
      if (!rec) continue;
      visits += num(rec.visits);
      points += monthTotal(rec);
    }
    const g = annualGrade(points, first.join, asOf, model.date1904);
    rows.push({
      index: i + 1,
      code: typeof first.code === 'number' ? first.code : String(first.code),
      sector: first.sector,
      gov: first.gov,
      name: first.name,
      join: first.join,
      job: first.job,
      visits,
      points,
      monthsSince: g.k,
      grade: g.grade,
      firstMonth: first.month,
      notes: model.mainNotes[key] ?? '',
    });
  });
  return { rows, overflow: Math.max(0, all.length - CAP.main) };
}
