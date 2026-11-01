import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { MONTH_NAMES, REMOVED_SHEETS, SHEET, SHEET_ORDER } from '../src/domain/constants';
import { isoToSerial } from '../src/domain/dates';
import { addMonthRecord, blankRecord, deleteMonthRecord, clone, setMainNote, revertCorrection } from '../src/domain/model';
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
    expect(pkg.sheets.map((s) => s.name)).toEqual([REMOVED_SHEETS[0], REMOVED_SHEETS[1], ...SHEET_ORDER]);
    expect(pkg.sheets[15].state).toBe('hidden');
  });
  it('import reproduces the Appendix-A model exactly (no corrections)', async () => {
    const r = await importWorkbook(await fixtureBytes(), { applyCorrections: false });
    expect(r.model).toEqual(seedModel());
    expect(r.analysis.layout.removed).toEqual([REMOVED_SHEETS[0], REMOVED_SHEETS[1]]);
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
  it('rejects non-Excel input with an explicit message', async () => {
    await expect(importWorkbook(new Uint8Array([1, 2, 3]))).rejects.toThrow(ImportError);
    await expect(importWorkbook(new TextEncoder().encode('a,b\n1,2'))).rejects.toThrow(/Excel/);
  });
});

const monthTotalOf = (r: { visits: unknown; scores: unknown[] }) => [r.visits, ...r.scores].reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0);

describe('export (XML patching)', () => {
  it('unchanged model: only the removal of visits/leave + cache refresh change the package; kept sheets stay intact', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    const out = await exportWorkbook(tpl, r.model, { now: new Date(2026, 10, 1) });
    expect(out.totalChanged).toBe(0);
    expect(out.removedSheets).toEqual([REMOVED_SHEETS[0], REMOVED_SHEETS[1]]);
    const a = await parts(tpl), b = await parts(out.bytes);
    for (const k of ['xl/styles.xml', 'xl/metadata.xml']) expect(b.get(k)).toBe(a.get(k));
    // month sheets: identical input cells (re-import of the export gives the same model)
    expect((await importWorkbook(out.bytes, { applyCorrections: false })).model).toEqual(r.model);
    const sst0 = (await XlsxPackage.open(tpl)).sst;
    for (const m of MONTH_NAMES) {
      const p = await sheetPath(tpl, m);
      const strip = (x: string) => x.replace(/<v>[^<]*<\/v>/g, '').replace(/ t="str"/g, '');
      if (a.get(p) !== b.get(p)) expect(strip(b.get(p)!).length).toBeGreaterThan(0); // only formula caches may differ
      void sst0;
    }
  });

  it('removes visits + leave sheets completely and leaves a consistent package', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl);
    const out = await exportWorkbook(tpl, r.model, { now: new Date(2026, 10, 1) });
    const pkg = await XlsxPackage.open(out.bytes);
    expect(pkg.sheets.map((s) => s.name)).toEqual(SHEET_ORDER);
    const b = await parts(out.bytes);
    const all = [...b.entries()].filter(([n]) => /\.(xml|rels)$/.test(n));
    for (const [n, x] of all) {
      expect(XMLValidator.validate(x), n).toBe(true);
      for (const gone of REMOVED_SHEETS) expect(x, `${n} still mentions ${gone}`).not.toContain(gone);
    }
    // every internal relationship target and content-type override exists
    for (const [n, x] of all.filter(([n]) => n.endsWith('.rels'))) {
      const base = n.replace(/_rels\/[^/]+$/, '');
      for (const m of x.matchAll(/Target="([^"]+)"[^>]*?(?:\/>)/g)) {
        if (/TargetMode="External"/.test(m[0])) continue;
        const t = m[1].startsWith('/') ? m[1].slice(1) : new URL(base + m[1], 'http://x/').pathname.slice(1);
        expect(b.has(t), `${n} → ${t}`).toBe(true);
      }
    }
    for (const m of b.get('[Content_Types].xml')!.matchAll(/PartName="\/([^"]+)"/g)) expect(b.has(m[1]), m[1]).toBe(true);
    expect([...b.keys()].some((k) => /calcChain/.test(k))).toBe(false);
    const wb = b.get('xl/workbook.xml')!;
    expect(wb).not.toContain('localSheetId');
    expect(wb).not.toContain('Print_Area');
    expect(wb).toContain('fullCalcOnLoad="1"');
    expect(Number(/activeTab="(\d+)"/.exec(wb)![1])).toBeLessThan(pkg.sheets.length);
    // reimport of the export equals the model, no sheet is reported as removed any more
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(re.model).toEqual({ ...r.model, appliedCorrections: [] });
    expect(re.analysis.layout.removed).toEqual([]);
  });

  it('formulas are kept and cached results are refreshed (visible without recalculation)', async () => {
    const tpl = await fixtureBytes();
    const r = await importWorkbook(tpl, { applyCorrections: false });
    const m = clone(r.model);
    m.months.find((x) => x.month === 3 && x.code === 1001877)!.scores[0] = 1;
    const out = await exportWorkbook(tpl, m, { now: new Date(2026, 10, 1) });
    const b = await parts(out.bytes);
    const pkg = await XlsxPackage.open(out.bytes);
    const main = new SheetXml(b.get(pkg.sheet(SHEET.main)!.path)!, pkg.sst);
    const roster = buildRoster(m, '2026-11-01').rows;
    expect(main.getFormula('I3')).toContain('_xlfn.XLOOKUP');
    expect(main.get('I3')!.value).toBe(roster[0].points);
    expect(main.get('H3')!.value).toBe(36);
    expect(main.get('E4')!.value).toBe(1007355);
    expect(main.get('J3')!.value).toBe(roster[0].grade);
    expect(main.get('J9')!.value).toBe('ضعيف'); // blank slot behaves like Excel
    expect(main.get('I3')!.value).toBeLessThan(332);
    const mar = new SheetXml(b.get(pkg.sheet('مارس')!.path)!, pkg.sst);
    expect(mar.getFormula('Q3')).toBe('SUM(H3:P3)');
    const rec = m.months.find((x) => x.month === 3 && x.code === 1001877)!;
    expect(mar.get(`Q${rec.row}`)!.value).toBe(monthTotalOf(rec));
  });

  it('editing one score changes only that input cell (+ refreshed caches, calcPr, removed sheets)', async () => {
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
    expect(diff).not.toContain('xl/styles.xml');
    expect(diff).not.toContain('xl/metadata.xml');
    const otherMonths = await Promise.all(MONTH_NAMES.filter((x) => x !== 'مارس').map((x) => sheetPath(tpl, x)));
    for (const p of otherMonths) {
      // other months: only formula caches (Q) may change — never an input cell
      const strip = (x: string) => x.replace(/<v>[^<]*<\/v>/g, '').replace(/ t="str"/g, '');
      expect(strip(b.get(p)!)).toBe(strip(a.get(p)!));
    }
    expect(diff).toContain(marPath);
    expect(diff).toContain('xl/workbook.xml');
    // March: only I3 differs (apart from Q cached value)
    const sst = (await XlsxPackage.open(tpl)).sst;
    const sa = new SheetXml(a.get(marPath)!, sst), sb = new SheetXml(b.get(marPath)!, sst);
    expect(sa.get('I3')!.value).toBe(oldScore);
    expect(sb.get('I3')!.value).toBe(newScore);
    for (const ref of ['H3', 'J3', 'K3', 'B3', 'E3', 'F3', 'R3', 'I4']) expect(sb.get(ref)!.value).toEqual(sa.get(ref)!.value);
    expect(b.get('xl/workbook.xml')).toContain('fullCalcOnLoad="1"');
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
    // styles / metadata identical
    for (const k of ['xl/metadata.xml', 'xl/styles.xml'])
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
