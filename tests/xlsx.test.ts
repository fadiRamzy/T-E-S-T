import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { SHEET_ORDER, MONTH_NAMES, SHEET } from '../src/domain/constants';
import { isoToSerial } from '../src/domain/dates';
import { addMonthRecord, addVisitRow, blankRecord, deleteMonthRecord, deleteVisitRow, clone, addLeaveRow, setMainNote, revertCorrection } from '../src/domain/model';
import { buildRoster } from '../src/domain/roster';
import { exportWorkbook } from '../src/xlsx/export';
import { importWorkbook, ImportError } from '../src/xlsx/import';
import { XlsxPackage } from '../src/xlsx/package';
import { SheetXml } from '../src/xlsx/sheetxml';
import { fixtureBytes, seedModel } from './helpers';

async function parts(bytes: Uint8Array) {
  const z = await JSZip.loadAsync(bytes);
  const out = new Map<string, string>();
  for (const [n, f] of Object.entries(z.files)) if (!f.dir) out.set(n, n.endsWith('.png') || n.endsWith('.bin') ? Buffer.from(await f.async('uint8array')).toString('base64') : await f.async('string'));
  return out;
}
const changedParts = (a: Map<string, string>, b: Map<string, string>) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
const sheetPath = async (bytes: Uint8Array, name: string) => (await XlsxPackage.open(bytes)).sheet(name)!.path;

describe('fixture + import', () => {
  it('fixture is well-formed XML in every part', async () => {
    const p = await parts(await fixtureBytes());
    for (const [n, x] of p) if (/\.(xml|rels)$/.test(n)) expect(XMLValidator.validate(x), n).toBe(true);
  });
  it('has the 16 sheets in order, Data hidden', async () => {
    const pkg = await XlsxPackage.open(await fixtureBytes());
    expect(pkg.sheets.map((s) => s.name)).toEqual(SHEET_ORDER);
    expect(pkg.sheets[15].state).toBe('hidden');
  });
  it('import reproduces the Appendix-A model exactly (no corrections)', async () => {
    const r = await importWorkbook(await fixtureBytes(), { applyCorrections: false });
    expect(r.model).toEqual(seedModel());
  });
  it('import applies the user-approved 1001523 join-date correction and records it', async () => {
    const r = await importWorkbook(await fixtureBytes());
    expect(r.model.appliedCorrections).toHaveLength(1);
    const e = buildRoster(r.model, '2026-11-01').rows[6];
    expect(e.join).toBe(isoToSerial('2026-08-01'));
    expect(e.grade).toBe('جيد');
    expect(buildRoster(revertCorrection(r.model, r.model.appliedCorrections[0]), '2026-11-01').rows[6].grade).toBe('ضعيف');
  });
  it('import is idempotent', async () => {
    const a = await importWorkbook(await fixtureBytes());
    const b = await importWorkbook(await fixtureBytes());
    expect(a.model).toEqual(b.model);
    expect(a.hash).toBe(b.hash);
  });
  it('rejects bad input with explicit messages', async () => {
    await expect(importWorkbook(new Uint8Array([1, 2, 3]))).rejects.toThrow(ImportError);
    await expect(importWorkbook(await fixtureBytes(), { fileName: 'a.xls' })).rejects.toThrow('.xlsx');
    const z = await JSZip.loadAsync(await fixtureBytes());
    const wb = (await z.file('xl/workbook.xml')!.async('string')).replace('name="يناير"', 'name="Jan"');
    z.file('xl/workbook.xml', wb);
    await expect(importWorkbook(await z.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/يناير/);
  });
});

describe('export (XML patching)', () => {
  it('unchanged model → every part byte-identical', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    const out = await exportWorkbook(tpl, r.model);
    expect(out.totalChanged).toBe(0);
    expect(changedParts(await parts(tpl), await parts(out.bytes))).toEqual([]);
  });

  it('editing one score changes only that cell value (+ stale caches / calcPr)', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    const m = clone(r.model);
    const rec = m.months.find((x) => x.month === 3 && x.code === 1001877)!;
    const oldScore = rec.scores[0] as number;
    const newScore = oldScore === 4 ? 3 : 4;
    rec.scores[0] = newScore;
    const out = await exportWorkbook(tpl, m, { originalName: 'تقييم.xlsx', now: new Date(2026, 10, 1) });
    expect(out.fileName).toBe('تقييم_updated_20261101.xlsx');
    expect(out.changedCells).toEqual({ [MONTH_NAMES[2]]: 1 });
    const a = await parts(tpl), b = await parts(out.bytes);
    const diff = changedParts(a, b).sort();
    const marPath = await sheetPath(tpl, 'مارس');
    const mainPath = await sheetPath(tpl, SHEET.main);
    expect(diff).toEqual(['xl/workbook.xml', marPath, mainPath].sort());
    // March: only I3 differs (apart from Q cached value)
    const sst = (await XlsxPackage.open(tpl)).sst;
    const sa = new SheetXml(a.get(marPath)!, sst), sb = new SheetXml(b.get(marPath)!, sst);
    expect(sa.get('I3')!.value).toBe(oldScore);
    expect(sb.get('I3')!.value).toBe(newScore);
    for (const ref of ['H3', 'J3', 'K3', 'B3', 'E3', 'F3', 'R3', 'I4']) expect(sb.get(ref)!.value).toEqual(sa.get(ref)!.value);
    expect(b.get('xl/workbook.xml')).toContain('fullCalcOnLoad="1"');
    expect(b.get('xl/workbook.xml')).toContain('#REF!');
    // formulas preserved verbatim
    expect(b.get(mainPath)).toContain('cm="1"');
    expect(b.get(mainPath)).toContain('_xlfn.XLOOKUP');
    expect(b.get(mainPath)).toContain('_xlfn.LET');
    expect(b.get(mainPath)).toContain('_xlfn.AGGREGATE');
    expect(b.get(marPath)).toContain('<f>SUM(H3:P3)</f>');
    // reimport gives the edited model
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(re.model).toEqual(m);
  });

  it('add / delete month rows keep template styles, other parts untouched', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    let m = addMonthRecord(r.model, { ...blankRecord(12, 0), code: 1009999, name: 'موظف جديد', sector: 'الصعيد', visits: 2, scores: [5, 5, 5, 5, 5, 5, 5, 5], join: isoToSerial('2026-10-01') });
    m = deleteMonthRecord(m, 1, 8); // delete 1003603 from January only
    const out = await exportWorkbook(tpl, m);
    const a = await parts(tpl), b = await parts(out.bytes);
    const dec = await sheetPath(tpl, 'ديسمبر');
    const jan = await sheetPath(tpl, 'يناير');
    const sd = new SheetXml(b.get(dec)!, []);
    expect(sd.get('D9')!.value).toBe('موظف جديد');
    expect(sd.get('D9')!.style).toBe(new SheetXml(a.get(dec)!, []).get('D9')!.style);
    const sj = new SheetXml(b.get(jan)!, []);
    expect(sj.get('E8')!.value).toBeNull();
    expect(sj.get('E8')!.style).toBe('3');
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(re.model).toEqual(m);
    expect(buildRoster(re.model).rows.map((e) => e.code)).toContain(1009999);
    // images / printer settings / drawings identical
    for (const k of ['xl/media/image1.png', 'xl/drawings/drawing1.xml', 'xl/printerSettings/printerSettings2.bin', 'xl/metadata.xml', 'xl/styles.xml', 'xl/sharedStrings.xml'])
      expect(b.get(k)).toBe(a.get(k));
    for (const [n, x] of b) if (/\.(xml|rels)$/.test(n)) expect(XMLValidator.validate(x), n).toBe(true);
  });

  it('main sheet: only column L is written; formulas B..K untouched', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    const m = setMainNote(r.model, 1007355, 'ملاحظة <اختبار> & "علامات"');
    const out = await exportWorkbook(tpl, m);
    const b = await parts(out.bytes);
    const sx = new SheetXml(b.get(await sheetPath(tpl, SHEET.main))!, []);
    expect(sx.get('L4')!.value).toBe('ملاحظة <اختبار> & "علامات"');
    const orig = new SheetXml((await parts(tpl)).get(await sheetPath(tpl, SHEET.main))!, []);
    expect(sx.getFormula('E10')).toBe(orig.getFormula('E10'));
    expect(sx.getFormula('J7')).toBe(orig.getFormula('J7'));
    expect((await importWorkbook(out.bytes, { applyCorrections: false })).model.mainNotes['1007355']).toBe('ملاحظة <اختبار> & "علامات"');
  });

  it('approved correction writes only the F cells of 1001523 rows', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl);
    const out = await exportWorkbook(tpl, r.model);
    const total = Object.values(out.changedCells).reduce((a, b) => a + b, 0);
    expect(total).toBe(r.model.months.filter((x) => x.code === 1001523).length);
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(re.model.months.filter((x) => x.code === 1001523).every((x) => x.join === isoToSerial('2026-08-01'))).toBe(true);
  });

  it('visits dashboard grows: row 17 shifts, merge + total formula follow', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    let m = addVisitRow(r.model, { no: 9, name: 'موظف 9', area: 'بني سويف', months: [1, 2, 3, null, null, null, null, null, null, null, null, null] });
    m = addVisitRow(m, { no: 10, name: 'موظف 10', area: 'ببا', months: Array(12).fill(null) });
    const out = await exportWorkbook(tpl, m);
    const b = await parts(out.bytes);
    const path = await sheetPath(tpl, SHEET.visits);
    const xml = b.get(path)!;
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('<mergeCell ref="K19:P19"/>');
    expect(xml).toContain('SUM(Q9:Q18)');
    expect(xml).toContain('SUM(E17:P17)');
    expect(xml).not.toContain('SUM(Q9:Q16)');
    const sx = new SheetXml(xml, (await XlsxPackage.open(out.bytes)).sst);
    expect(sx.get('C17')!.value).toBe('موظف 9');
    expect(sx.get('K19')!.value).toBe('اجمالي الزيارات عن العام');
    expect(sx.get('Q17')!.hasFormula).toBe(true);
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(re.model.visits).toHaveLength(10);
    expect(re.model).toEqual(m);
    // deleting back down empties the rows but keeps the structure
    const back = deleteVisitRow(deleteVisitRow(m, 9), 8);
    const out2 = await exportWorkbook(out.bytes, back);
    expect((await importWorkbook(out2.bytes, { applyCorrections: false })).model).toEqual(back);
  });

  it('leave log: new rows keep raw typing; autofilter range grows beyond 66', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    let m = r.model;
    m = addLeaveRow(m, { name: 'جديد', type: 'اذن ساعه', start: isoToSerial('2026-10-30'), startKind: 'date', end: '30/10/2026', endKind: 'text', days: 'اذن' });
    const out = await exportWorkbook(tpl, m);
    const b = await parts(out.bytes);
    expect(b.get(await sheetPath(tpl, SHEET.leave))).toContain('<autoFilter ref="A2:F67"/>');
    expect(b.get('xl/workbook.xml')).toContain("$A$2:$F$67");
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(re.model.leave[64]).toMatchObject({ startKind: 'date', endKind: 'text', end: '30/10/2026' });
    expect(re.model).toEqual(m);
  });

  it('keeps text values in numeric cells (raw) across export', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    const m = clone(r.model);
    m.months.find((x) => x.month === 2 && x.code === 1007801)!.scores[2] = 'غياب';
    const out = await exportWorkbook(tpl, m);
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(re.model.months.find((x) => x.month === 1 && x.code === 1007801)!.visits).toBe('تعيين فبراير');
    expect(re.model.months.find((x) => x.month === 2 && x.code === 1007801)!.scores[2]).toBe('غياب');
  });
});
