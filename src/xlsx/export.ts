import { monthTotal } from '../domain/calc';
import { CAP, MONTH_NAMES } from '../domain/constants';
import { todaySerial } from '../domain/dates';
import { buildRoster } from '../domain/roster';
import type { AppModel, Raw } from '../domain/types';
import { detectLayout, type Layout } from './layout';
import { XlsxPackage } from './package';
import { removeSheets } from './prune';
import { readWorkbookGrid } from './reader';
import { SheetXml } from './sheetxml';

export interface ExportSummary {
  bytes: Uint8Array;
  changedCells: Record<string, number>;
  totalChanged: number;
  fileName: string;
  warnings: string[];
  removedSheets: string[];
}

const nz = (v: Raw | undefined): Raw => (v === undefined || v === '' ? null : v);
const txt = (s: string): Raw => (s === '' ? null : s);

function yyyymmdd(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function exportFileName(original: string, d = new Date()): string {
  const base = original.replace(/\.(xlsx|xlsm|xls)$/i, '').replace(/_updated_\d{8}$/, '') || 'workbook';
  return `${base}_updated_${yyyymmdd(d)}.xlsx`;
}

const ref = (col: number | undefined, row: number) => {
  let n = col!, s = '';
  while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); }
  return `${s}${row}`;
};

/**
 * Writes the model into the workbook the user imported (the "template"): only INPUT cells are patched, formulas are kept,
 * cached results of the formulas are refreshed, the visits/leave sheets are removed. Columns are located by header
 * (same detector as the importer) — never by fixed letters.
 */
export async function exportWorkbook(
  templateBytes: Uint8Array,
  model: AppModel,
  opts: { originalName?: string; now?: Date; layout?: Layout } = {},
): Promise<ExportSummary> {
  const now = opts.now ?? new Date();
  const layout = opts.layout ?? detectLayout(await readWorkbookGrid(templateBytes));
  const pkg = await XlsxPackage.open(templateBytes);
  const changed: Record<string, number> = {};
  const warnings: string[] = [];
  let cachedWrites = 0;
  const sxs = new Map<string, SheetXml>();

  const open = async (name: string) => {
    const sx = new SheetXml(await pkg.sheetText(name), pkg.sst);
    sxs.set(name, sx);
    return sx;
  };
  const put = (sx: SheetXml, name: string, col: number | undefined, row: number, v: Raw) => {
    if (col === undefined) return;
    if (sx.set(ref(col, row), v)) changed[name] = (changed[name] ?? 0) + 1;
  };
  const cache = (sx: SheetXml, col: number | undefined, row: number, v: number | string) => {
    if (col === undefined) return;
    if (sx.setCached(ref(col, row), v)) cachedWrites++;
  };

  // ---- lists (hidden Data sheet) ----
  if (layout.data) {
    const sx = await open(layout.data.sheet);
    const n = Math.max(model.lists.sectors.length, model.lists.governorates.length, 60);
    for (let i = 0; i < n; i++) {
      put(sx, layout.data.sheet, layout.data.sectorCol, layout.data.headerRow + 1 + i, txt(model.lists.sectors[i] ?? ''));
      put(sx, layout.data.sheet, layout.data.govCol, layout.data.headerRow + 1 + i, txt(model.lists.governorates[i] ?? ''));
    }
  }

  // ---- month sheets ----
  for (let mi = 0; mi < 12; mi++) {
    const recs = model.months.filter((r) => r.month === mi + 1);
    const ml = layout.months[mi];
    if (!ml) {
      if (recs.length) warnings.push(`شيت «${MONTH_NAMES[mi]}» غير موجود في الملف الأصلي، لذلك لم تُكتب بيانات هذا الشهر (${recs.length} سجل). أضِف الشيت في Excel أو استورد ملفاً يحتويه.`);
      continue;
    }
    const sx = await open(ml.sheet);
    const c = ml.cols;
    const byRow = new Map(recs.map((r) => [r.row, r]));
    const lastRow = Math.max(ml.lastRow, CAP.monthLastRow, ...recs.map((r) => r.row));
    for (let r = ml.firstRow; r <= lastRow; r++) {
      const rec = byRow.get(r);
      put(sx, ml.sheet, c.sector, r, rec ? txt(rec.sector) : null);
      put(sx, ml.sheet, c.gov, r, rec ? txt(rec.gov) : null);
      put(sx, ml.sheet, c.name, r, rec ? txt(rec.name) : null);
      put(sx, ml.sheet, c.code, r, rec ? nz(rec.code) : null);
      put(sx, ml.sheet, c.join, r, rec ? nz(rec.join) : null);
      put(sx, ml.sheet, c.job, r, rec ? txt(rec.job) : null);
      put(sx, ml.sheet, c.visits, r, rec ? nz(rec.visits) : null);
      c.scores.forEach((col, i) => put(sx, ml.sheet, col, r, rec ? nz(rec.scores[i]) : null));
      put(sx, ml.sheet, c.notes, r, rec ? txt(rec.notes) : null);
      // total column keeps its formula (=SUM(H:P)); only its cached result is refreshed
      cache(sx, c.total, r, rec ? monthTotal(rec) : 0);
    }
  }

  // ---- main sheet: notes are input; the rest are formulas whose cached results we refresh ----
  if (layout.main) {
    const ml = layout.main;
    const sx = await open(ml.sheet);
    const c = ml.cols;
    const roster = buildRoster(model, now).rows;
    const today = todaySerial(now, model.date1904);
    for (let i = 0; i < CAP.main; i++) {
      const r = ml.firstRow + i;
      const e = roster[i];
      if (c.notes !== undefined) put(sx, ml.sheet, c.notes, r, txt(e ? model.mainNotes[String(e.code)] ?? '' : model.mainNotes[`#row${r}`] ?? ''));
      cache(sx, c.sector, r, e?.sector ?? '');
      cache(sx, c.gov, r, e?.gov ?? '');
      cache(sx, c.name, r, e?.name ?? '');
      cache(sx, c.code, r, e ? e.code : '');
      cache(sx, c.join, r, e ? (e.join === null || e.join === '' ? 0 : (e.join as number | string)) : 0);
      cache(sx, c.job, r, e?.job ?? '');
      cache(sx, c.visits, r, e?.visits ?? 0);
      cache(sx, c.points, r, e?.points ?? 0);
      cache(sx, c.grade, r, e?.grade ?? 'ضعيف');
      cache(sx, c.months, r, e ? e.monthsSince : today / 30);
    }
  }

  for (const [name, sx] of sxs) if (sx.isDirty()) pkg.zip.file(pkg.sheet(name)!.path, sx.toString());

  // ---- remove the unsupported sheets (visits + leave) and everything that pointed at them ----
  const removedNames = layout.removed.filter((n) => pkg.sheet(n));
  const pr = await removeSheets(pkg, removedNames);
  warnings.push(...pr.warnings);

  const totalChanged = Object.values(changed).reduce((a, b) => a + b, 0);
  if (totalChanged > 0 || cachedWrites > 0 || pr.removed.length) {
    let wb = (await pkg.text(pkg.workbookPath))!;
    if (/<calcPr\b/.test(wb)) {
      wb = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a: string, sl: string) => (/fullCalcOnLoad=/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"${sl}>`));
    } else if (wb.includes('</definedNames>')) {
      wb = wb.replace('</definedNames>', '</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/>');
    } else wb = wb.replace('</sheets>', '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/>');
    pkg.zip.file(pkg.workbookPath, wb);
  }

  const bytes = await pkg.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes, changedCells: changed, totalChanged, fileName: exportFileName(opts.originalName ?? 'workbook.xlsx', now), warnings, removedSheets: pr.removed };
}
