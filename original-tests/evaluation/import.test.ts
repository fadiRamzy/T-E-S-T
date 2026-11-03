import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { MONTH_NAMES, REMOVED_SHEETS } from '../src/domain/constants';
import { buildRoster } from '../src/domain/roster';
import { exportWorkbook } from '../src/xlsx/export';
import { analyzeWorkbook, importWorkbook, ImportError } from '../src/xlsx/import';
import { XlsxPackage } from '../src/xlsx/package';
import { fixtureBytes, seedModel } from './helpers';

type Aoa = (string | number | null)[][];
interface Book { names: string[]; sheets: Record<string, Aoa>; hidden: Set<string> }

/** The fixture as plain value grids (what any *other* tool would see — no styles, no formulas, no metadata). */
async function load(): Promise<Book> {
  const wb = XLSX.read(await fixtureBytes(), { type: 'array' });
  const sheets: Record<string, Aoa> = {};
  wb.SheetNames.forEach((n) => { sheets[n] = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[n], { header: 1, defval: null, raw: true }); });
  return { names: [...wb.SheetNames], sheets, hidden: new Set(wb.SheetNames.filter((_, i) => wb.Workbook?.Sheets?.[i]?.Hidden)) };
}
function write(b: Book, type: 'xlsx' | 'biff8' = 'xlsx'): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const n of b.names) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b.sheets[n]), n);
  return new Uint8Array(XLSX.write(wb, { bookType: type, type: 'array' }));
}
const rename = (b: Book, from: string, to: string) => { b.names = b.names.map((n) => (n === from ? to : n)); b.sheets[to] = b.sheets[from]; if (to !== from) delete b.sheets[from]; };

const summary = (m: ReturnType<typeof seedModel>) => buildRoster(m, '2026-11-01').rows.map((r) => [r.code, r.visits, r.points, r.grade]);
const EXPECTED = [[1001877, 36, 332], [1007355, 51, 331], [1007801, 19, 288], [1006567, 45, 371], [1002185, 21, 316], [1003603, 23, 367], [1001523, 7, 77]];

describe('import is independent of file hash / XML / formatting / metadata', () => {
  it('a workbook re-written by another tool (no styles, formulas, metadata) imports to the same model', async () => {
    const r = await importWorkbook(write(await load()), { applyCorrections: false });
    expect(r.model).toEqual(seedModel());
    expect(summary(r.model).map((x) => x.slice(0, 3))).toEqual(EXPECTED);
  });

  it('legacy .xls (BIFF8) is accepted and converted for export', async () => {
    const xls = write(await load(), 'biff8');
    expect(xls[0]).toBe(0xd0); // OLE2 signature
    const a = await analyzeWorkbook(xls, 'old.xls');
    expect(a.format).toBe('xls');
    expect(a.blocking).toBe(false);
    // (the BIFF8 writer used to build this fixture truncates very long cell texts, so notes are compared by prefix)
    const noNotes = (m: ReturnType<typeof seedModel>) => ({ ...m, months: m.months.map((r) => ({ ...r, notes: '' })) });
    expect(noNotes(a.rawModel)).toEqual(noNotes(seedModel()));
    a.rawModel.months.forEach((r, i) => expect(seedModel().months[i].notes.startsWith(r.notes)).toBe(true));
    expect(a.templateBytes[0]).toBe(0x50); // converted to a zip (.xlsx) so it can be used as the export template
    const out = await exportWorkbook(a.templateBytes, a.model, { originalName: 'old.xls', now: new Date(2026, 10, 1) });
    expect(out.fileName).toBe('old_updated_20261101.xlsx');
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(re.model).toEqual({ ...a.model, appliedCorrections: [] });
    expect(buildRoster(re.model, '2026-11-01').rows.map((r) => [r.code, r.visits, r.points])).toEqual(EXPECTED);
  });

  it('works without the visits, leave and Data sheets (lists are derived)', async () => {
    const b = await load();
    for (const n of [...REMOVED_SHEETS, 'Data']) { b.names = b.names.filter((x) => x !== n); delete b.sheets[n]; }
    const a = await analyzeWorkbook(write(b), 'x.xlsx');
    expect(a.blocking).toBe(false);
    expect(a.layout.removed).toEqual([]);
    expect(a.model.lists.sectors.length).toBeGreaterThan(0);
    expect(summary(a.rawModel).map((x) => x.slice(0, 3))).toEqual(EXPECTED);
    expect(a.issues.some((i) => /Data/.test(i.message))).toBe(true);
  });

  it('accepts sheet-name variants (أبريل, trailing spaces, different main-sheet year) and different sheet order', async () => {
    const b = await load();
    rename(b, 'ابريل', 'أبريل ');
    rename(b, 'اكتوبر', ' اكتوبر');
    rename(b, 'التقييم السنوي 2026', 'التقييم السنوي 2027');
    b.names.reverse();
    const a = await analyzeWorkbook(write(b), 'v.xlsx');
    expect(a.blocking).toBe(false);
    expect(a.layout.months.every(Boolean)).toBe(true);
    expect(a.layout.main?.sheet).toBe('التقييم السنوي 2027');
    expect(a.rawModel.months).toHaveLength(seedModel().months.length);
  });

  it('finds the header row and columns when rows are inserted above and columns are reordered', async () => {
    const b = await load();
    for (const m of MONTH_NAMES) {
      const rows = b.sheets[m].map((r) => { const x = [...r]; [x[1], x[4]] = [x[4], x[1]]; return x; }); // sector <-> code columns swapped
      b.sheets[m] = [[null], [null], [null], ...rows];
    }
    const a = await analyzeWorkbook(write(b), 'shifted.xlsx');
    expect(a.blocking).toBe(false);
    expect(a.layout.months[0]!.headerRow).toBe(5);
    expect(a.layout.months[0]!.cols.code).toBe(2);
    expect(summary(a.rawModel).map((x) => x.slice(0, 3))).toEqual(EXPECTED);
    expect(a.rawModel.grid?.firstRow).toBe(6);
  });

  it('extra and deleted employee rows are simply what the file contains', async () => {
    const b = await load();
    const jan = b.sheets['يناير'];
    jan.splice(3, 1); // remove the first employee row in January (rows shift up)
    jan.push([null, 'الصعيد', 'محافظه - المنيا .', 'موظف إضافي', 1009999, 46000, 'مسئول', 5, 4, 4, 4, 4, 4, 4, 4, 4, 44, null]);
    const a = await analyzeWorkbook(write(b), 'e.xlsx');
    expect(a.blocking).toBe(false);
    const j = a.rawModel.months.filter((r) => r.month === 1);
    expect(j.some((r) => r.code === 1009999)).toBe(true);
    expect(j.length).toBe(seedModel().months.filter((r) => r.month === 1).length);
  });

  it('numeric codes typed as text are normalised; duplicate codes in a month keep the first and are reported', async () => {
    const b = await load();
    const feb = b.sheets['فبراير'];
    feb[3][4] = ` ${feb[3][4]} `; // text with spaces
    feb[4][4] = feb[3][4]; // duplicate of the row above
    const a = await analyzeWorkbook(write(b), 'd.xlsx');
    expect(a.rawModel.months.find((r) => r.month === 2 && r.row === 4)!.code).toBe(Number(String(feb[3][4]).trim()));
    expect(a.ignored).toHaveLength(1);
    expect(a.ignored[0]).toMatchObject({ sheet: 'فبراير', row: 5 });
    const codes = a.rawModel.months.filter((r) => r.month === 2).map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('specific, actionable errors', () => {
  it('missing «الكود» column in one month sheet names the sheet and the column', async () => {
    const b = await load();
    b.sheets['مارس'][1][4] = 'رقم'; // header renamed
    const a = await analyzeWorkbook(write(b), 'e.xlsx');
    expect(a.blocking).toBe(true);
    const msg = a.issues.filter((i) => i.level === 'error').map((i) => i.message).join(' ');
    expect(msg).toContain('مارس');
    expect(msg).toContain('الكود');
    await expect(importWorkbook(write(b))).rejects.toThrow(ImportError);
  });
  it('missing visits column and missing score columns are reported separately', async () => {
    const b = await load();
    b.sheets['يناير'][1][7] = 'عدد'; // visits header (month name) removed
    b.sheets['فبراير'][1] = b.sheets['فبراير'][1].map((v, i) => (i >= 12 && i <= 16 ? null : v)); // 5 score headers gone
    const a = await analyzeWorkbook(write(b), 'e.xlsx');
    const errs = a.issues.filter((i) => i.level === 'error').map((i) => i.message);
    expect(errs.some((m) => m.includes('يناير') && m.includes('الزيارات'))).toBe(true);
    expect(errs.some((m) => m.includes('فبراير') && m.includes('معايير التقييم'))).toBe(true);
  });
  it('a missing month sheet is only a warning; no month sheet at all is blocking', async () => {
    const b = await load();
    b.names = b.names.filter((n) => n !== 'مايو');
    const a = await analyzeWorkbook(write(b), 'm.xlsx');
    expect(a.blocking).toBe(false);
    expect(a.issues.some((i) => i.level === 'warn' && i.message.includes('مايو'))).toBe(true);
    const c = await load();
    c.names = c.names.filter((n) => !MONTH_NAMES.includes(n as never));
    const z = await analyzeWorkbook(write(c), 'n.xlsx');
    expect(z.blocking).toBe(true);
  });
  it('not an Excel file', async () => {
    await expect(analyzeWorkbook(new TextEncoder().encode('hello'), 'a.xlsx')).rejects.toThrow(/Excel/);
    await expect(analyzeWorkbook(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]), 'a.xlsx')).rejects.toThrow(ImportError);
  });
});

describe('export after import of a foreign workbook', () => {
  it('adds, edits and deletes employees and still produces a valid workbook with only the supported sheets', async () => {
    const a = await analyzeWorkbook(write(await load()), 'foreign.xlsx');
    const m = structuredClone(a.model);
    m.months = m.months.filter((r) => r.code !== 1006567); // delete an employee everywhere
    const out = await exportWorkbook(a.templateBytes, m, { now: new Date(2026, 10, 1), originalName: 'foreign.xlsx' });
    const pkg = await XlsxPackage.open(out.bytes);
    expect(pkg.sheets.map((s) => s.name)).not.toContain(REMOVED_SHEETS[0]);
    const re = await importWorkbook(out.bytes, { applyCorrections: false });
    expect(buildRoster(re.model).rows.map((r) => r.code)).not.toContain(1006567);
    expect(re.model.months).toHaveLength(m.months.length);
  });
});
