import { CAP, MONTH_NAMES } from './constants';
import { capacityMessage } from './validate';
import { buildRoster, codeKey } from './roster';
import type { AppModel, Correction, LeaveRow, MonthRecord, Raw, VisitRow } from './types';

export class OpError extends Error {}

export function emptyModel(): AppModel {
  return { lists: { sectors: [], governorates: [] }, months: [], mainNotes: {}, visits: [], leave: [], leaveTotals: [], date1904: false, appliedCorrections: [] };
}

export function clone<T>(x: T): T {
  return structuredClone(x);
}

export function blankRecord(month: number, row: number): MonthRecord {
  return { month, row, sector: '', gov: '', name: '', code: null, join: null, job: '', visits: null, scores: Array(8).fill(null), notes: '' };
}

export function firstFreeRow(model: AppModel, month: number): number | null {
  const used = new Set(model.months.filter((r) => r.month === month).map((r) => r.row));
  for (let r = CAP.monthFirstRow; r <= CAP.monthLastRow; r++) if (!used.has(r)) return r;
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

// ---- visits ------------------------------------------------------------------
export function blankVisit(n: number): VisitRow {
  return { row: CAP.visitFirst + n, no: n + 1, name: '', area: '', months: Array(12).fill(null) };
}
export function renumberVisits(rows: VisitRow[]): VisitRow[] {
  return rows.map((r, i) => ({ ...r, row: CAP.visitFirst + i }));
}
export function addVisitRow(model: AppModel, v: Omit<VisitRow, 'row'>): AppModel {
  const m = clone(model);
  if (m.visits.length >= CAP.visitMax) throw new OpError(capacityMessage.visitsFull);
  m.visits.push({ ...clone(v), row: CAP.visitFirst + m.visits.length });
  return m;
}
export function updateVisitRow(model: AppModel, index: number, v: VisitRow): AppModel {
  const m = clone(model);
  m.visits[index] = { ...clone(v), row: m.visits[index].row };
  return m;
}
export function deleteVisitRow(model: AppModel, index: number): AppModel {
  const m = clone(model);
  m.visits.splice(index, 1);
  m.visits = renumberVisits(m.visits);
  return m;
}

// ---- leave ---------------------------------------------------------------------
export function renumberLeave(rows: LeaveRow[]): LeaveRow[] {
  return rows.map((r, i) => ({ ...r, row: CAP.leaveFirst + i }));
}
export function addLeaveRow(model: AppModel, l: Omit<LeaveRow, 'row'>): AppModel {
  const m = clone(model);
  if (m.leave.length >= CAP.leaveLast - CAP.leaveFirst + 1) throw new OpError(capacityMessage.leaveFull);
  m.leave.push({ ...clone(l), row: CAP.leaveFirst + m.leave.length });
  return m;
}
export function updateLeaveRow(model: AppModel, index: number, l: LeaveRow): AppModel {
  const m = clone(model);
  m.leave[index] = { ...clone(l), row: m.leave[index].row };
  return m;
}
export function deleteLeaveRow(model: AppModel, index: number): AppModel {
  const m = clone(model);
  m.leave.splice(index, 1);
  m.leave = renumberLeave(m.leave);
  return m;
}

// ---- approved corrections --------------------------------------------------------------
export function revertCorrection(model: AppModel, c: Correction): AppModel {
  const m = clone(model);
  for (const r of m.months) if (codeKey(r.code) === String(c.code) && r.join === c.to) r.join = c.from;
  m.appliedCorrections = m.appliedCorrections.filter((x) => x.id !== c.id);
  return m;
}
