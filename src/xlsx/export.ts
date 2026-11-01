import { CAP, MONTH_NAMES, SHEET } from '../domain/constants';
import { buildRoster } from '../domain/roster';
import type { AppModel, Raw } from '../domain/types';
import { XlsxPackage } from './package';
import { SheetXml } from './sheetxml';
import { numToCol } from './xml';

export interface ExportSummary {
  bytes: Uint8Array;
  changedCells: Record<string, number>;
  totalChanged: number;
  fileName: string;
  warnings: string[];
}

const nz = (v: Raw | undefined): Raw => (v === undefined || v === '' ? null : v);
const txt = (s: string): Raw => (s === '' ? null : s);

function yyyymmdd(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function exportFileName(original: string, d = new Date()): string {
  const base = original.replace(/\.xlsx$/i, '') || 'workbook';
  return `${base}_updated_${yyyymmdd(d)}.xlsx`;
}

/** Shift merge refs / dimension for rows >= from by k. */
function shiftSheetMeta(xml: string, from: number, k: number): string {
  const shiftRef = (ref: string) => ref.replace(/([A-Z]+)(\d+)/g, (_, c, r) => `${c}${Number(r) >= from ? Number(r) + k : r}`);
  xml = xml.replace(/<mergeCell\b([^>]*?)\bref="([^"]+)"/g, (_, pre, ref) => `<mergeCell${pre}ref="${shiftRef(ref)}"`);
  xml = xml.replace(/<dimension\b ref="([^"]+)"/, (_, ref) => `<dimension ref="${shiftRef(ref)}"`);
  return xml;
}

export async function exportWorkbook(
  templateBytes: Uint8Array,
  model: AppModel,
  opts: { originalName?: string; now?: Date } = {},
): Promise<ExportSummary> {
  const pkg = await XlsxPackage.open(templateBytes);
  const changed: Record<string, number> = {};
  const warnings: string[] = [];
  const outXml = new Map<string, string>();
  const sxs = new Map<string, SheetXml>();
  const extra = new Map<string, (xml: string) => string>(); // post-processing of sheet XML (outside sheetData)

  const open = async (name: string) => {
    const sx = new SheetXml(await pkg.sheetText(name), pkg.sst);
    sxs.set(name, sx);
    return sx;
  };
  const put = (sx: SheetXml, name: string, ref: string, v: Raw) => {
    if (sx.set(ref, v)) changed[name] = (changed[name] ?? 0) + 1;
  };

  // ---- Data lists ----
  {
    const sx = await open(SHEET.data);
    const n = Math.max(model.lists.sectors.length, model.lists.governorates.length, 60);
    for (let i = 0; i < n; i++) {
      put(sx, SHEET.data, `J${i + 2}`, txt(model.lists.sectors[i] ?? ''));
      put(sx, SHEET.data, `K${i + 2}`, txt(model.lists.governorates[i] ?? ''));
    }
  }

  // ---- Month sheets ----
  for (let mi = 0; mi < 12; mi++) {
    const name = MONTH_NAMES[mi];
    const sx = await open(name);
    const recs = model.months.filter((r) => r.month === mi + 1);
    const byRow = new Map(recs.map((r) => [r.row, r]));
    const lastRow = Math.max(CAP.monthLastRow, ...recs.map((r) => r.row));
    for (let r = CAP.monthFirstRow; r <= lastRow; r++) {
      const rec = byRow.get(r);
      put(sx, name, `B${r}`, rec ? txt(rec.sector) : null);
      put(sx, name, `C${r}`, rec ? txt(rec.gov) : null);
      put(sx, name, `D${r}`, rec ? txt(rec.name) : null);
      put(sx, name, `E${r}`, rec ? nz(rec.code) : null);
      put(sx, name, `F${r}`, rec ? nz(rec.join) : null);
      put(sx, name, `G${r}`, rec ? txt(rec.job) : null);
      put(sx, name, `H${r}`, rec ? nz(rec.visits) : null);
      for (let i = 0; i < 8; i++) put(sx, name, `${numToCol(9 + i)}${r}`, rec ? nz(rec.scores[i]) : null);
      put(sx, name, `R${r}`, rec ? txt(rec.notes) : null);
    }
  }

  // ---- Main sheet: only column L (notes). B..K are formulas and are never touched ----
  {
    const sx = await open(SHEET.main);
    const roster = buildRoster(model).rows;
    for (let r = 3; r <= 2 + CAP.main; r++) {
      const e = roster[r - 3];
      const note = e ? model.mainNotes[String(e.code)] ?? '' : model.mainNotes[`#row${r}`] ?? '';
      put(sx, SHEET.main, `L${r}`, txt(note));
    }
  }

  // ---- Visits dashboard ----
  {
    const name = SHEET.visits;
    const sx = await open(name);
    // locate total row (Q = SUM(Q9:Qn))
    let totalRow = 0, lastRow = 0;
    for (const r of sx.rowNumbers()) {
      const f = sx.getFormula(`Q${r}`);
      const m = f ? /^SUM\(Q9:Q(\d+)\)$/.exec(f.replace(/\s/g, '')) : null;
      if (m) { totalRow = r; lastRow = Number(m[1]); break; }
    }
    if (!totalRow) {
      warnings.push('لم يُعثر على صف الإجمالي في «الزيارات الميدانية» — لم تُضف صفوف جديدة.');
    }
    const needed = Math.max(model.visits.length, 0);
    const have = totalRow ? lastRow - CAP.visitFirst + 1 : needed;
    if (totalRow && needed > have) {
      const k = needed - have;
      sx.shiftRowsFrom(totalRow, k);
      for (let i = 0; i < k; i++) {
        const nr = lastRow + 1 + i;
        sx.cloneRowEmpty(lastRow, nr, { Q: `SUM(E${nr}:P${nr})` });
      }
      const newLast = lastRow + k;
      sx.setFormula(`Q${totalRow + k}`, `SUM(Q9:Q${newLast})`);
      extra.set(name, (xml) => shiftSheetMeta(xml, totalRow, k));
      changed[name] = (changed[name] ?? 0) + k;
      lastRow = newLast;
    }
    const rowsToWrite = totalRow ? lastRow : CAP.visitTemplateLast;
    for (let r = CAP.visitFirst; r <= rowsToWrite; r++) {
      const v = model.visits[r - CAP.visitFirst];
      put(sx, name, `B${r}`, v ? nz(v.no) : null);
      put(sx, name, `C${r}`, v ? txt(v.name) : null);
      put(sx, name, `D${r}`, v ? txt(v.area) : null);
      for (let i = 0; i < 12; i++) put(sx, name, `${numToCol(5 + i)}${r}`, v ? nz(v.months[i]) : null);
    }
  }

  // ---- Leave log ----
  {
    const name = SHEET.leave;
    const sx = await open(name);
    for (let r = CAP.leaveFirst; r <= CAP.leaveLast; r++) {
      const l = model.leave[r - CAP.leaveFirst];
      put(sx, name, `A${r}`, l ? txt(l.name) : null);
      put(sx, name, `B${r}`, l ? txt(l.type) : null);
      put(sx, name, `C${r}`, l ? nz(l.start) : null);
      put(sx, name, `D${r}`, l ? nz(l.end) : null);
      put(sx, name, `E${r}`, l ? nz(l.days) : null);
    }
    // manual totals block (F): name, total, name, total …
    const flat: Raw[] = [];
    for (const t of model.leaveTotals) { flat.push(txt(t.name)); flat.push(nz(t.total)); }
    for (let r = CAP.leaveFirst; r <= CAP.leaveLast; r++) put(sx, name, `F${r}`, flat[r - CAP.leaveFirst] ?? null);
    if (flat.length > CAP.leaveLast - CAP.leaveFirst + 1) warnings.push('جدول إجماليات الإجازات تجاوز السعة وتم اقتطاعه.');
    // keep autofilter range covering all rows when the log grows past the template range
    const lastData = CAP.leaveFirst + model.leave.length - 1;
    if (lastData > 66) {
      extra.set(name, (xml) => xml.replace(/(<autoFilter\b[^>]*\bref="A2:F)\d+"/, `$1${lastData}"`));
      outXml.set('__filterdb', String(lastData));
    }
  }

  // ---- assemble ----
  const totalChanged = Object.values(changed).reduce((a, b) => a + b, 0);
  const anyChange = totalChanged > 0;
  if (anyChange) {
    for (const [name, sx] of sxs) {
      const needsStrip = name === SHEET.main || (changed[name] ?? 0) > 0;
      if (needsStrip) sx.stripFormulaCaches();
    }
  }
  for (const [name, sx] of sxs) {
    if (!sx.isDirty() && !extra.has(name)) continue;
    let xml = sx.toString();
    const ex = extra.get(name);
    if (ex) xml = ex(xml);
    outXml.set(pkg.sheet(name)!.path, xml);
  }
  for (const [path, xml] of outXml) if (path !== '__filterdb') pkg.zip.file(path, xml);

  if (anyChange) {
    let wb = (await pkg.text('xl/workbook.xml'))!;
    if (/<calcPr\b/.test(wb)) {
      wb = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a: string, sl: string) =>
        /fullCalcOnLoad=/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"${sl}>`);
    } else if (wb.includes('</definedNames>')) {
      wb = wb.replace('</definedNames>', '</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/>');
    } else wb = wb.replace('</sheets>', '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/>');
    const fdb = outXml.get('__filterdb');
    if (fdb) wb = wb.replace(/(_xlnm\._FilterDatabase[^>]*>[^<]*\$A\$2:\$F\$)\d+/, `$1${fdb}`);
    pkg.zip.file('xl/workbook.xml', wb);
  }

  const bytes = await pkg.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes, changedCells: changed, totalChanged, fileName: exportFileName(opts.originalName ?? 'workbook.xlsx', opts.now), warnings };
}
