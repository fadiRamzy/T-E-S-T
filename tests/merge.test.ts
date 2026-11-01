import { describe, expect, it } from 'vitest';
import { planMerge } from '../src/domain/merge';
import { codeKey } from '../src/domain/roster';
import { addEmployee, clone } from '../src/domain/model';
import type { AppModel } from '../src/domain/types';
import { seedModel } from './helpers';

const current = (): AppModel => addEmployee(seedModel(), { code: 1009990, name: 'موجود في التطبيق فقط', sector: 'الصعيد', gov: '', job: 'x', join: null, month: 3 });
function incoming(): AppModel {
  const m = seedModel();
  m.months.find((r) => r.month === 2 && r.code === 1001877)!.scores[0] = 1; // changed score
  m.months.push({ ...m.months[0], month: 12, row: 20, code: 1008888, name: 'جديد في الملف' }); // new employee
  return m;
}
const dupFree = (m: AppModel) => {
  const seen = new Set<string>();
  for (const r of m.months) { const k = `${r.month}|${codeKey(r.code)}`; if (seen.has(k)) return false; seen.add(k); }
  return true;
};

describe('planMerge — employee code (per month) is the key', () => {
  it('merge: file wins on matches, new rows are added, app-only records are kept', () => {
    const p = planMerge(current(), incoming(), { strategy: 'merge', removeMissing: false });
    expect(p.stats).toMatchObject({ added: 1, updated: 1, removed: 0, kept: 1, newEmployees: 1 });
    expect(p.model.months.find((r) => r.month === 2 && r.code === 1001877)!.scores[0]).toBe(1);
    expect(p.model.months.some((r) => r.code === 1009990)).toBe(true);
    expect(p.model.months.some((r) => r.code === 1008888)).toBe(true);
    expect(dupFree(p.model)).toBe(true);
    expect(p.changes.find((c) => c.kind === 'updated')!.fields).toEqual(['المعيار 1']);
  });
  it('merge + removeMissing deletes what the file does not contain', () => {
    const p = planMerge(current(), incoming(), { strategy: 'merge', removeMissing: true });
    expect(p.model.months.some((r) => r.code === 1009990)).toBe(false);
    expect(p.stats).toMatchObject({ removed: 1, removedEmployees: 1 });
  });
  it('add-only never changes existing records', () => {
    const cur = current();
    const p = planMerge(cur, incoming(), { strategy: 'add-only', removeMissing: false });
    expect(p.model.months.find((r) => r.month === 2 && r.code === 1001877)!.scores[0]).toBe(cur.months.find((r) => r.month === 2 && r.code === 1001877)!.scores[0]);
    expect(p.stats).toMatchObject({ added: 1, updated: 0 });
    expect(p.model.months.some((r) => r.code === 1008888)).toBe(true);
  });
  it('replace makes the app equal to the file', () => {
    const inc = incoming();
    const p = planMerge(current(), inc, { strategy: 'replace', removeMissing: false });
    expect(p.model.months.map((r) => [r.month, r.row, r.code])).toEqual(inc.months.map((r) => [r.month, r.row, r.code]));
    expect(p.stats.removed).toBe(1);
  });
  it('first import (no current data) takes the file as it is', () => {
    const inc = incoming();
    const p = planMerge(null, inc, { strategy: 'replace', removeMissing: false });
    expect(p.model.months).toEqual(inc.months);
    expect(p.stats.added).toBe(inc.months.length);
  });
  it('keeps free rows for app-only records so nothing collides with imported rows', () => {
    const cur = current();
    const inc = clone(seedModel());
    inc.months.push({ ...inc.months[0], month: 3, row: cur.months.find((r) => r.code === 1009990)!.row, code: 1008777, name: 'يحتل الصف نفسه' });
    const p = planMerge(cur, inc, { strategy: 'merge', removeMissing: false });
    const rows = p.model.months.filter((r) => r.month === 3).map((r) => r.row);
    expect(new Set(rows).size).toBe(rows.length);
    expect(p.model.months.some((r) => r.code === 1009990)).toBe(true);
  });
  it('is a no-op when the file equals the app', () => {
    const p = planMerge(seedModel(), seedModel(), { strategy: 'merge', removeMissing: false });
    expect(p.stats).toMatchObject({ added: 0, updated: 0, removed: 0, kept: 0 });
    expect(p.model.months).toEqual(seedModel().months);
  });
});
