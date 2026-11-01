import { CAP, MONTH_NAMES } from '../domain/constants';
import { isoToSerial } from '../domain/dates';
import { clone, emptyModel } from '../domain/model';
import { buildRoster, codeKey } from '../domain/roster';
import type { AppModel, Correction, MonthRecord, Raw } from '../domain/types';
import { detectLayout, hasBlockingIssues, type Issue, type Layout } from './layout';
import { readWorkbookGrid, ReadError, type Grid, type WorkbookGrid } from './reader';

export class ImportError extends Error {}

export interface IgnoredRow { sheet: string; row: number; reason: string; code?: string }
export interface Analysis {
  fileName: string;
  format: 'xlsx' | 'xls';
  hash: string;
  /** model exactly as read from the file, with the owner-approved corrections applied */
  model: AppModel;
  rawModel: AppModel;
  layout: Layout;
  issues: Issue[];
  ignored: IgnoredRow[];
  blocking: boolean;
  /** bytes to keep as the export template (.xls files are converted to .xlsx) */
  templateBytes: Uint8Array;
  counts: { month: number; records: number; employees: number }[];
}

const str = (v: Raw | undefined): string => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : v);

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // insecure context (plain http) — the hash is informational only
    let h = 2166136261;
    for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
    return `fnv-${h.toString(16)}`;
  }
}

/** Explicit user-approved corrections (decision recorded in the project brief). */
export const APPROVED_CORRECTIONS = [
  {
    id: 'join-1001523',
    code: 1001523,
    fromISO: '2026-01-08',
    toISO: '2026-08-01',
    reason: 'اليوم/الشهر معكوسان على الأرجح (أول شهر له بيانات هو اغسطس) — صُحِّح بموافقة المستخدم',
  },
] as const;

export function applyApprovedCorrections(model: AppModel): AppModel {
  const m = clone(model);
  for (const c of APPROVED_CORRECTIONS) {
    const from = isoToSerial(c.fromISO, m.date1904);
    const to = isoToSerial(c.toISO, m.date1904);
    let touched = 0;
    for (const r of m.months) if (codeKey(r.code) === String(c.code) && r.join === from) { r.join = to; touched++; }
    if (touched) {
      const corr: Correction = { id: c.id, code: c.code, field: 'join', from, to, reason: c.reason };
      m.appliedCorrections.push(corr);
    }
  }
  return m;
}

/** Numeric-looking codes ("1001877", " 1001877 ", 1001877.0) become numbers so matching is reliable. */
export function normalizeCode(v: Raw): Raw {
  if (typeof v === 'string') {
    const t = v.replace(/[\u200E\u200F\s]/g, '');
    if (/^\d+$/.test(t)) return Number(t);
    return t === '' ? null : v.trim();
  }
  return v;
}

function gridByName(wb: WorkbookGrid, name: string): Grid | undefined {
  return wb.sheets.find((s) => s.name === name);
}

/**
 * Reads ANY Excel workbook and maps it into the app model. Sheets are identified by name/content and columns by
 * their header text — never by file hash, internal XML, formatting or metadata. Nothing is applied to the app here.
 */
export async function analyzeWorkbook(bytes: Uint8Array, fileName = 'workbook.xlsx'): Promise<Analysis> {
  let wb: WorkbookGrid;
  try {
    wb = await readWorkbookGrid(bytes);
  } catch (e) {
    throw new ImportError(e instanceof ReadError ? e.message : `تعذّر قراءة الملف: ${(e as Error).message}`);
  }
  const layout = detectLayout(wb);
  const issues = [...layout.issues];
  const ignored: IgnoredRow[] = [];
  const model = emptyModel();
  model.date1904 = wb.date1904;

  // ---- monthly sheets ----
  let firstRow = Infinity, lastRow = 0;
  for (const ml of layout.months) {
    if (!ml) continue;
    const g = gridByName(wb, ml.sheet)!;
    const c = ml.cols;
    firstRow = Math.min(firstRow, ml.firstRow);
    const seen = new Map<string, number>();
    let noCode = 0;
    const end = Math.min(g.maxRow, ml.headerRow + 2000);
    for (let r = ml.firstRow; r <= end; r++) {
      const get = (col?: number): Raw => (col === undefined ? null : g.get(r, col));
      const vals = [c.sector, c.gov, c.name, c.code, c.join, c.job, c.visits, ...c.scores, c.notes].map(get);
      if (vals.every((v) => v === null)) continue;
      const code = normalizeCode(get(c.code));
      const rec: MonthRecord = {
        month: ml.month, row: r, sector: str(get(c.sector)), gov: str(get(c.gov)), name: str(get(c.name)), code,
        join: get(c.join), job: str(get(c.job)), visits: get(c.visits), scores: c.scores.map((x) => get(x)), notes: str(get(c.notes)),
      };
      const key = codeKey(code);
      if (key === null) {
        noCode++;
        model.months.push(rec);
        continue;
      }
      if (seen.has(key)) {
        ignored.push({ sheet: ml.sheet, row: r, code: key, reason: `كود مكرر في نفس الشهر (يُحتفظ بالصف ${seen.get(key)} فقط)` });
        continue;
      }
      seen.set(key, r);
      model.months.push(rec);
      lastRow = Math.max(lastRow, r);
    }
    if (noCode) issues.push({ level: 'warn', sheet: ml.sheet, message: `شيت «${ml.sheet}»: ${noCode} صف به بيانات بدون كود — يُحتفظ به لكنه لا يدخل في الحسابات السنوية.` });
    const rep = layout.reports.find((x) => x.sheet === ml.sheet);
    if (rep) rep.rows = model.months.filter((x) => x.month === ml.month).length;
  }
  if (isFinite(firstRow)) model.grid = { firstRow, lastRow: Math.max(firstRow + CAP.monthRows - 1, lastRow) };
  const dupCount = ignored.length;
  if (dupCount) issues.push({ level: 'warn', message: `${dupCount} صفاً مكرر الكود داخل نفس الشهر تم تجاهله (يُحتفظ بأول ظهور) لمنع تكرار الموظفين.` });

  // ---- lists ----
  if (layout.data) {
    const g = gridByName(wb, layout.data.sheet)!;
    const col = (c: number | undefined) => {
      const out: string[] = [];
      if (c === undefined) return out;
      for (let r = layout.data!.headerRow + 1; r <= Math.min(g.maxRow, 500); r++) {
        const v = str(g.get(r, c));
        if (v.trim() && !out.includes(v)) out.push(v);
      }
      return out;
    };
    model.lists.sectors = col(layout.data.sectorCol);
    model.lists.governorates = col(layout.data.govCol);
  }
  if (!model.lists.sectors.length) model.lists.sectors = [...new Set(model.months.map((r) => r.sector).filter(Boolean))];
  if (!model.lists.governorates.length) model.lists.governorates = [...new Set(model.months.map((r) => r.gov).filter(Boolean))];

  // ---- annual sheet notes (mapped by roster position, like the sheet's own formulas) ----
  if (layout.main?.cols.notes !== undefined) {
    const g = gridByName(wb, layout.main.sheet)!;
    const roster = buildRoster(model).rows;
    for (let r = layout.main.firstRow; r < layout.main.firstRow + CAP.main && r <= g.maxRow; r++) {
      const note = str(g.get(r, layout.main.cols.notes));
      if (!note) continue;
      const e = roster[r - layout.main.firstRow];
      if (e) model.mainNotes[String(e.code)] = note;
      else model.mainNotes[`#row${r}`] = note;
    }
  }

  const rawModel = clone(model);
  const finalModel = applyApprovedCorrections(model);
  const roster = buildRoster(finalModel);
  if (roster.overflow) issues.push({ level: 'warn', message: `${roster.overflow} موظفاً يتجاوزون سعة الشيت الرئيسي (${CAP.main}).` });

  const counts = MONTH_NAMES.map((_, i) => {
    const recs = finalModel.months.filter((r) => r.month === i + 1);
    return { month: i + 1, records: recs.length, employees: new Set(recs.map((r) => codeKey(r.code)).filter(Boolean)).size };
  });

  return {
    fileName,
    format: wb.kind,
    hash: await sha256Hex(bytes),
    model: finalModel,
    rawModel,
    layout,
    issues,
    ignored,
    blocking: hasBlockingIssues(layout),
    templateBytes: wb.converted ?? bytes,
    counts,
  };
}

export interface ImportResult { model: AppModel; rawModel: AppModel; hash: string; warnings: string[]; analysis: Analysis }

/** Convenience: analyse + fail on blocking problems (used by tests and the demo loader). */
export async function importWorkbook(bytes: Uint8Array, opts: { applyCorrections?: boolean; fileName?: string } = {}): Promise<ImportResult> {
  const a = await analyzeWorkbook(bytes, opts.fileName);
  if (a.blocking) throw new ImportError(a.issues.filter((i) => i.level === 'error').map((i) => i.message).join('\n'));
  return { model: opts.applyCorrections === false ? a.rawModel : a.model, rawModel: a.rawModel, hash: a.hash, warnings: a.issues.filter((i) => i.level !== 'info').map((i) => i.message), analysis: a };
}
