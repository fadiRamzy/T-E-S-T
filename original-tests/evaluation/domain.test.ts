import { describe, expect, it } from 'vitest';
import { annualGrade, gradeFor, monthTotal, tenureFactor } from '../src/domain/calc';
import { buildRoster } from '../src/domain/roster';
import { isoToSerial, serialToISO } from '../src/domain/dates';
import { computeQuality } from '../src/domain/quality';
import { addEmployee, addMonthRecord, blankRecord, changeEmployeeCode, copyRosterFromPrevious, deleteEmployee, deleteMonthRecord, editIdentity, OpError, setMainNote } from '../src/domain/model';
import { validateMonthRecord } from '../src/domain/validate';
import { seedModel } from './helpers';

const ASOF = '2026-11-01';

describe('calc', () => {
  it('monthTotal: visits + 8 scores, text counts as 0', () => {
    const m = seedModel();
    const jan = m.months.filter((r) => r.month === 1);
    expect(monthTotal(jan.find((r) => r.code === 1001877)!)).toBe(36);
    expect(monthTotal(jan.find((r) => r.code === 1007801)!)).toBe(0);
  });
  it('dates round-trip', () => {
    expect(serialToISO(isoToSerial('2024-01-11'))).toBe('2024-01-11');
    expect(isoToSerial('2026-01-01')).toBe(46023);
  });
  it('tenure tiers m=3/4/6/7/9/10', () => {
    expect([3, 4, 6, 7, 9, 10].map(tenureFactor)).toEqual([0.25, 0.5, 0.5, 0.75, 0.75, 1]);
  });
  it('grade boundaries', () => {
    const k = (m: number) => m + 0.5;
    expect([59, 60, 70, 82.5, 107.5].map((n) => gradeFor(n, k(3)))).toEqual(['ضعيف', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز']);
    expect([239, 240, 280, 330, 430].map((n) => gradeFor(n, k(12)))).toEqual(['ضعيف', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز']);
    expect(gradeFor(119, k(6))).toBe('ضعيف');
    expect(gradeFor(120, k(6))).toBe('مقبول');
  });
  it('grade uses U+064B in "جيد جداً"', () => {
    expect(gradeFor(350, 40).endsWith('\u064B')).toBe(true);
  });
  it('blank join date behaves like Excel (0 → p = 1)', () => {
    expect(annualGrade(100, null, ASOF).p).toBe(1);
    expect(annualGrade(100, null, ASOF).grade).toBe('ضعيف');
  });
});

describe('roster + annual aggregates (as-of 2026-11-01)', () => {
  const m = seedModel();
  const { rows } = buildRoster(m, ASOF);
  it('7 distinct codes in first-appearance order', () => {
    expect(rows.map((r) => r.code)).toEqual([1001877, 1007355, 1007801, 1006567, 1002185, 1003603, 1001523]);
  });
  it('points / visits', () => {
    const by = Object.fromEntries(rows.map((r) => [r.code, [r.points, r.visits]]));
    expect(by).toEqual({ 1001877: [332, 36], 1007355: [331, 51], 1007801: [288, 19], 1006567: [371, 45], 1002185: [316, 21], 1003603: [367, 23], 1001523: [77, 7] });
  });
  it('grades per spec table (unscaled seed, original 1001523 date)', () => {
    expect(rows.map((r) => r.grade)).toEqual(['جيد جداً', 'جيد جداً', 'جيد', 'جيد جداً', 'جيد', 'جيد جداً', 'ضعيف']);
    expect(rows.map((r) => Math.floor(r.monthsSince))).toEqual([34, 10, 10, 21, 34, 22, 9]);
    expect(rows[0].monthsSince).toBeCloseTo(34.17, 2);
    expect(rows[6].monthsSince).toBeCloseTo(9.9, 2);
  });
  it('with the corrected join date 1001523 → جيد (p = 0.25)', () => {
    const fixed = editIdentity(m, 1001523, { join: isoToSerial('2026-08-01') }, 'all');
    const e = buildRoster(fixed, ASOF).rows[6];
    expect(e.monthsSince).toBeCloseTo(3.07, 2);
    expect(e.grade).toBe('جيد');
  });
});

describe('operations & validation', () => {
  const m = seedModel();
  it('blocks duplicate code in a month', () => {
    const rec = { ...blankRecord(1, 0), code: 1001877, name: 'x' };
    expect(() => addMonthRecord(m, rec)).toThrow(OpError);
    expect(validateMonthRecord(m, rec).some((i) => i.field === 'code' && i.level === 'error')).toBe(true);
  });
  it('adds into first free slot with identity; delete keeps other months', () => {
    const rec = { ...blankRecord(11, 0), code: 1009999, name: 'جديد' };
    const a = addMonthRecord(m, rec);
    expect(a.months.find((r) => r.code === 1009999)!.row).toBe(10);
    const d = deleteMonthRecord(a, 11, 10);
    expect(d.months.some((r) => r.code === 1009999)).toBe(false);
    expect(d.months.filter((r) => r.month === 10).length).toBe(7);
  });
  it('copy roster from previous month copies identity only', () => {
    const { model, added } = copyRosterFromPrevious(m, 12);
    expect(added).toBe(1);
    const n = model.months.find((r) => r.month === 12 && r.code === 1001523)!;
    expect(n.visits).toBeNull();
    expect(n.scores.every((s) => s === null)).toBe(true);
  });
  it('addEmployee: code is unique across ALL months and the name is required', () => {
    expect(() => addEmployee(m, { code: 1001877, name: 'x', sector: '', gov: '', job: '', join: null, month: 5 })).toThrow(OpError);
    expect(() => addEmployee(m, { code: 5, name: '  ', sector: '', gov: '', job: '', join: null, month: 5 })).toThrow(OpError);
    const a = addEmployee(m, { code: 1009998, name: 'جديد', sector: 'الصعيد', gov: '', job: 'مسئول', join: null, month: 5 });
    expect(buildRoster(a).rows.map((r) => r.code)).toContain(1009998);
  });
  it('deleteEmployee removes every month row and the note', () => {
    const d = deleteEmployee(setMainNote(m, 1007355, 'x'), 1007355);
    expect(d.months.some((r) => r.code === 1007355)).toBe(false);
    expect(d.mainNotes['1007355']).toBeUndefined();
    expect(buildRoster(d).rows).toHaveLength(6);
  });
  it('changeEmployeeCode renames everywhere and refuses duplicates', () => {
    const c = changeEmployeeCode(m, 1007355, 1007356);
    expect(c.months.filter((r) => r.code === 1007356).length).toBe(m.months.filter((r) => r.code === 1007355).length);
    expect(() => changeEmployeeCode(m, 1007355, 1001877)).toThrow(OpError);
  });
  it('scores outside 1-5 produce warnings', () => {
    const rec = { ...m.months[0], scores: [1, 2, 3, 4, 5, 6, 0, 'x'] };
    expect(validateMonthRecord(m, rec, m.months[0]).filter((i) => i.field.startsWith('s')).length).toBe(3);
  });
  it('data-quality panel reports the known items', () => {
    const ids = computeQuality(m, ASOF).map((q) => q.id);
    expect(ids).toContain('swap-1001523');
    expect(ids).toContain('cf-literal');
    expect(ids.some((i) => i.startsWith('txtH-1-'))).toBe(true);
  });
});
