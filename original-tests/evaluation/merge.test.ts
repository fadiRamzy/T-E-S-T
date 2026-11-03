import { describe, expect, it } from 'vitest';
import { combineModels, planMerge } from '../src/domain/merge';
import { buildRoster, codeKey } from '../src/domain/roster';
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

describe('combineModels — accumulate several files without losing data', () => {
  const split = (): [AppModel, AppModel] => {
    const all = seedModel();
    const codes = [...new Set(all.months.map((r) => r.code))];
    const a = clone(all); a.months = a.months.filter((r) => codes.slice(0, 4).includes(r.code));
    const b = clone(all); b.months = b.months.filter((r) => codes.slice(4).includes(r.code));
    return [a, b];
  };
  it('two disjoint branches combine into the full dataset (same roster + points as the single file)', () => {
    const [a, b] = split();
    const p = combineModels(a, b);
    const all = seedModel();
    expect(p.model.months.length).toBe(all.months.length);
    expect(p.stats.updated).toBe(0);
    expect(p.stats.newEmployees).toBe(3);
    expect(dupFree(p.model)).toBe(true);
    const pts = (m: AppModel) => Object.fromEntries(buildRoster(m, '2026-11-01').rows.map((r) => [String(r.code), [r.points, r.visits]]));
    expect(pts(p.model)).toEqual(pts(all));
  });
  it('is idempotent: importing the same file again changes nothing and adds no duplicates', () => {
    const all = seedModel();
    const p = combineModels(all, clone(all));
    expect(p.stats).toMatchObject({ added: 0, updated: 0 });
    expect(p.stats.unchanged).toBe(all.months.length);
    expect(p.model.months).toEqual(all.months);
  });
  it('empty cells never overwrite existing values; non-empty cells update them', () => {
    const cur = seedModel();
    const inc = clone(cur);
    const rec = inc.months.find((r) => r.month === 2 && r.code === 1001877)!;
    const before = cur.months.find((r) => r.month === 2 && r.code === 1001877)!;
    rec.scores = rec.scores.map(() => null); rec.visits = null; rec.notes = ''; rec.job = ''; rec.sector = '   ';
    const p1 = combineModels(cur, inc);
    expect(p1.model.months.find((r) => r.month === 2 && r.code === 1001877)).toEqual(before);
    rec.visits = 99; rec.scores[2] = 1;
    const p2 = combineModels(cur, inc);
    const got = p2.model.months.find((r) => r.month === 2 && r.code === 1001877)!;
    expect(got.visits).toBe(99); expect(got.scores[2]).toBe(1);
    expect(got.scores[0]).toBe(before.scores[0]);
    expect(p2.changes.find((c) => c.kind === 'updated')!.fields).toEqual(['الزيارات', 'المعيار 3']);
  });
  it('same employee in different months (different files) keeps every distinct monthly record', () => {
    const all = seedModel();
    const a = clone(all); a.months = a.months.filter((r) => r.month <= 6);
    const b = clone(all); b.months = b.months.filter((r) => r.month > 6);
    const p = combineModels(a, b);
    expect(p.model.months.length).toBe(all.months.length);
    expect(dupFree(p.model)).toBe(true);
    expect(p.stats.newEmployees).toBe(1); // 1001523 first appears in August
  });
  it('unites lists/notes/corrections and never exceeds month capacity', () => {
    const cur = seedModel(); cur.lists.governorates = ['محافظه - أ'];
    const inc = seedModel(); inc.lists.governorates = ['محافظه - ب'];
    inc.mainNotes = { '1001877': 'ملاحظة', '1007355': '' };
    const p = combineModels(cur, inc);
    expect(p.model.lists.governorates).toEqual(['محافظه - أ', 'محافظه - ب']);
    expect(p.model.mainNotes['1001877']).toBe('ملاحظة');
    expect('1007355' in p.model.mainNotes && p.model.mainNotes['1007355'] === '').toBe(false);
    // fill a month to capacity then try to add one more employee
    let full = clone(cur);
    for (let i = 0; full.months.filter((r) => r.month === 1).length < 50; i++) full = addEmployee(full, { code: 2000000 + i, name: `ز${i}`, sector: '', gov: '', job: '', join: null, month: 1 });
    const extra = clone(inc); extra.months = [{ ...inc.months[0], month: 1, code: 3999999, name: 'زائد' }];
    const q = combineModels(full, extra);
    expect(q.stats.dropped).toBe(1);
    expect(q.model.months.filter((r) => r.month === 1).length).toBe(50);
  });
});
