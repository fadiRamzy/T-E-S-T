import { CAP, MONTH_NAMES } from './constants';
import { capacityMessage } from './validate';
import { buildRoster, codeKey } from './roster';
import type { AppModel, Correction, MonthRecord, Raw } from './types';

export class OpError extends Error {}

export function emptyModel(): AppModel {
  return { lists: { sectors: [], governorates: [] }, months: [], mainNotes: {}, date1904: false, appliedCorrections: [] };
}

export function clone<T>(x: T): T {
  return structuredClone(x);
}

/** Bring a persisted/backup model (possibly from an older app version) to the current shape. */
export function migrateModel(raw: AppModel & Record<string, unknown>): AppModel {
  const { visits: _v, leave: _l, leaveTotals: _t, ...rest } = raw;
  void _v; void _l; void _t; // visits & leave sections were removed from the app
  return { ...emptyModel(), ...(rest as AppModel) };
}

export const gridOf = (m: AppModel) => m.grid ?? { firstRow: CAP.monthFirstRow, lastRow: CAP.monthLastRow };

export function blankRecord(month: number, row: number): MonthRecord {
  return { month, row, sector: '', gov: '', name: '', code: null, join: null, job: '', visits: null, scores: Array(8).fill(null), notes: '' };
}

export function firstFreeRow(model: AppModel, month: number): number | null {
  const used = new Set(model.months.filter((r) => r.month === month).map((r) => r.row));
  const g = gridOf(model);
  const last = Math.max(g.lastRow, ...used);
  for (let r = g.firstRow; r <= last; r++) if (!used.has(r)) return r;
  return null;
}

export function addMonthRecord(model: AppModel, rec: Omit<MonthRecord, 'row'>): AppModel {
  const m = clone(model);
  const row = firstFreeRow(m, rec.month);
  if (row === null) throw new OpError(capacityMessage.monthFull);
  const key = codeKey(rec.code);
  if (key === null) throw new OpError('الكود مطلوب');
  if (m.months.some((r) => r.month === rec.month && codeKey(r.code) === key))
    throw new OpError(`الكود ${key} موجود بالفعل في ${MONTH_NAMES[rec.month - 1]}`);
  const isNew = !m.months.some((r) => codeKey(r.code) === key);
  if (isNew && buildRoster(m).rows.length >= CAP.main) throw new OpError(capacityMessage.mainFull);
  m.months.push({ ...clone(rec), row });
  return m;
}

export interface NewEmployee { code: number; name: string; sector: string; gov: string; job: string; join: Raw; month: number }

/** Add a brand-new employee (identity only) in the chosen month. The code must be unused in EVERY month. */
export function addEmployee(model: AppModel, e: NewEmployee): AppModel {
  if (!Number.isInteger(e.code) || e.code <= 0) throw new OpError('الكود يجب أن يكون رقماً صحيحاً موجباً');
  if (!e.name.trim()) throw new OpError('اسم الموظف مطلوب');
  if (model.months.some((r) => codeKey(r.code) === String(e.code))) throw new OpError(`الكود ${e.code} مسجل بالفعل لموظف آخر`);
  const { month, ...id } = e;
  return addMonthRecord(model, { ...blankRecord(month, 0), ...id, name: id.name.trim(), code: id.code });
}

export function updateMonthRecord(model: AppModel, month: number, row: number, next: MonthRecord): AppModel {
  const m = clone(model);
  const i = m.months.findIndex((r) => r.month === month && r.row === row);
  if (i < 0) throw new OpError('الصف غير موجود');
  const key = codeKey(next.code);
  if (key !== null && m.months.some((r, j) => j !== i && r.month === month && codeKey(r.code) === key))
    throw new OpError(`الكود ${key} موجود بالفعل في هذا الشهر`);
  m.months[i] = { ...clone(next), month, row };
  return m;
}

export function deleteMonthRecord(model: AppModel, month: number, row: number): AppModel {
  const m = clone(model);
  m.months = m.months.filter((r) => !(r.month === month && r.row === row));
  return m;
}

/** Remove an employee (every row of the code in every month) together with the main-sheet note. */
export function deleteEmployee(model: AppModel, code: Raw): AppModel {
  const key = codeKey(code);
  const m = clone(model);
  m.months = m.months.filter((r) => codeKey(r.code) !== key);
  if (key !== null) delete m.mainNotes[key];
  return m;
}

export type IdentityPatch = Partial<Pick<MonthRecord, 'sector' | 'gov' | 'name' | 'join' | 'job'>>;

/** Edit an employee's identity. scope=all rewrites every month where the code has a row. */
export function editIdentity(model: AppModel, code: Raw, patch: IdentityPatch, scope: 'all' | 'first'): AppModel {
  const m = clone(model);
  const key = codeKey(code);
  const rows = m.months.filter((r) => codeKey(r.code) === key).sort((a, b) => a.month - b.month || a.row - b.row);
  const targets = scope === 'all' ? rows : rows.slice(0, 1);
  for (const r of targets) Object.assign(r, patch);
  return m;
}

/** Change the employee code in every month (and move the main-sheet note). */
export function changeEmployeeCode(model: AppModel, from: Raw, to: number): AppModel {
  const fk = codeKey(from);
  const tk = String(to);
  if (fk === tk) return model;
  if (model.months.some((r) => codeKey(r.code) === tk)) throw new OpError(`الكود ${tk} مستخدم لموظف آخر`);
  const m = clone(model);
  for (const r of m.months) if (codeKey(r.code) === fk) r.code = to;
  if (fk && m.mainNotes[fk] !== undefined) { m.mainNotes[tk] = m.mainNotes[fk]; delete m.mainNotes[fk]; }
  return m;
}

/** Copy identity only from the previous month for codes missing in `month`. */
export function copyRosterFromPrevious(model: AppModel, month: number): { model: AppModel; added: number } {
  if (month <= 1) throw new OpError('لا يوجد شهر سابق');
  const m = clone(model);
  const have = new Set(m.months.filter((r) => r.month === month).map((r) => codeKey(r.code)));
  const prev = m.months.filter((r) => r.month === month - 1 && codeKey(r.code) !== null).sort((a, b) => a.row - b.row);
  let added = 0;
  for (const p of prev) {
    if (have.has(codeKey(p.code))) continue;
    const row = firstFreeRow(m, month);
    if (row === null) throw new OpError(capacityMessage.monthFull);
    m.months.push({ ...blankRecord(month, row), sector: p.sector, gov: p.gov, name: p.name, code: p.code, join: p.join, job: p.job });
    added++;
  }
  return { model: m, added };
}

export function setMainNote(model: AppModel, code: Raw, note: string): AppModel {
  const m = clone(model);
  const k = codeKey(code);
  if (k === null) return m;
  if (note) m.mainNotes[k] = note;
  else delete m.mainNotes[k];
  return m;
}

// ---- approved corrections --------------------------------------------------------------
export function revertCorrection(model: AppModel, c: Correction): AppModel {
  const m = clone(model);
  for (const r of m.months) if (codeKey(r.code) === String(c.code) && r.join === c.to) r.join = c.from;
  m.appliedCorrections = m.appliedCorrections.filter((x) => x.id !== c.id);
  return m;
}
