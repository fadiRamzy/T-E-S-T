import { CAP, LEAVE_TYPES, MONTH_NAMES, SHEET, SHEET_ORDER } from '../domain/constants';
import { isoToSerial } from '../domain/dates';
import { clone, emptyModel } from '../domain/model';
import { buildRoster, codeKey } from '../domain/roster';
import type { AppModel, Correction, LeaveRow, MonthRecord, Raw, VisitRow } from '../domain/types';
import { XlsxPackage } from './package';
import { SheetXml } from './sheetxml';
import { numToCol } from './xml';

export class ImportError extends Error {}

export interface ImportResult {
  model: AppModel;
  /** model exactly as read from the file, before approved corrections */
  rawModel: AppModel;
  hash: string;
  warnings: string[];
}

function str(v: Raw | undefined): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'number' ? String(v) : v;
}
const rawOrNull = (v: Raw | undefined): Raw => (v === undefined || v === '' ? null : v);

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

export async function importWorkbook(bytes: Uint8Array, opts: { applyCorrections?: boolean; fileName?: string } = {}): Promise<ImportResult> {
  if (opts.fileName && !/\.xlsx$/i.test(opts.fileName)) throw new ImportError('يُقبل ملف بصيغة .xlsx فقط.');
  const pkg = await XlsxPackage.open(bytes).catch((e) => {
    throw new ImportError(e.message);
  });
  const missing = SHEET_ORDER.filter((n) => !pkg.sheet(n));
  if (missing.length) throw new ImportError(`الملف لا يطابق القالب المتوقع — شيتات مفقودة أو متغيّرة الاسم: ${missing.join('، ')}`);

  const warnings: string[] = [];
  const model = emptyModel();
  model.date1904 = pkg.date1904;
  const open = async (name: string) => new SheetXml(await pkg.sheetText(name), pkg.sst);
  const val = (sx: SheetXml, ref: string): Raw => rawOrNull(sx.get(ref)?.value ?? null);

  // --- header sanity checks (loose: trimmed substring) ---
  const expect = (sx: SheetXml, sheet: string, ref: string, needle: string) => {
    const got = str(val(sx, ref)).trim();
    if (!got.includes(needle)) throw new ImportError(`الشيت «${sheet}» لا يطابق القالب: الخلية ${ref} يجب أن تحتوي «${needle}» لكن وُجد «${got}».`);
  };

  // --- Data ---
  const data = await open(SHEET.data);
  expect(data, SHEET.data, 'J1', 'القطاع');
  expect(data, SHEET.data, 'K1', 'المحافظة');
  for (let r = 2; r <= 200; r++) {
    const s = str(val(data, `J${r}`));
    if (s.trim()) model.lists.sectors.push(s);
    const g = str(val(data, `K${r}`));
    if (g.trim()) model.lists.governorates.push(g);
  }

  // --- Month sheets ---
  for (let mi = 0; mi < 12; mi++) {
    const name = MONTH_NAMES[mi];
    const sx = await open(name);
    expect(sx, name, 'E2', 'الكود');
    expect(sx, name, 'Q2', 'الاجمالي');
    for (let r = CAP.monthFirstRow; r <= CAP.monthScanLast; r++) {
      const cols: Record<string, Raw> = {};
      for (const c of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'R']) cols[c] = val(sx, `${c}${r}`);
      if (Object.values(cols).every((v) => v === null)) continue;
      const code = cols.E;
      const rec: MonthRecord = {
        month: mi + 1,
        row: r,
        sector: str(cols.B),
        gov: str(cols.C),
        name: str(cols.D),
        code: typeof code === 'string' && /^\s*\d+\s*$/.test(code) ? code.trim() : code,
        join: cols.F,
        job: str(cols.G),
        visits: cols.H,
        scores: ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'].map((c) => cols[c]),
        notes: str(cols.R),
      };
      model.months.push(rec);
    }
  }

  // --- Main sheet notes (L) — mapped by roster position ---
  const main = await open(SHEET.main);
  expect(main, SHEET.main, 'E2', 'الكود');
  const roster = buildRoster(model).rows;
  for (let r = 3; r <= 2 + CAP.main; r++) {
    const note = str(val(main, `L${r}`));
    if (!note) continue;
    const e = roster[r - 3];
    if (e) model.mainNotes[String(e.code)] = note;
    else model.mainNotes[`#row${r}`] = note;
  }

  // --- Visits ---
  const vs = await open(SHEET.visits);
  expect(vs, SHEET.visits, 'C8', 'اسم الموظف');
  let lastVisit: number = CAP.visitTemplateLast;
  for (const r of [...vs.rowNumbers()].sort((a, b) => a - b)) {
    const f = vs.getFormula(`Q${r}`);
    const m = f ? /^SUM\(Q9:Q(\d+)\)$/.exec(f.replace(/\s/g, '')) : null;
    if (m) { lastVisit = Number(m[1]); break; }
  }
  const visits: VisitRow[] = [];
  for (let r = CAP.visitFirst; r <= lastVisit; r++) {
    const months = Array.from({ length: 12 }, (_, i) => val(vs, `${numToCol(5 + i)}${r}`));
    const row: VisitRow = { row: r, no: val(vs, `B${r}`), name: str(val(vs, `C${r}`)), area: str(val(vs, `D${r}`)), months };
    if (row.no === null && !row.name && !row.area && months.every((x) => x === null)) continue;
    visits.push(row);
  }
  model.visits = visits.map((v, i) => ({ ...v, row: CAP.visitFirst + i }));

  // --- Leave log ---
  const lv = await open(SHEET.leave);
  expect(lv, SHEET.leave, 'A2', 'اسم الموظف');
  const kind = (v: Raw): 'date' | 'text' | 'empty' => (v === null ? 'empty' : typeof v === 'number' ? 'date' : 'text');
  const leave: LeaveRow[] = [];
  for (let r = CAP.leaveFirst; r <= CAP.leaveLast; r++) {
    const a = val(lv, `A${r}`), b = val(lv, `B${r}`), c = val(lv, `C${r}`), d = val(lv, `D${r}`), e = val(lv, `E${r}`);
    if ([a, b, c, d, e].every((x) => x === null)) continue;
    leave.push({ row: r, name: str(a), type: str(b), start: c, startKind: kind(c), end: d, endKind: kind(d), days: e });
    if (b !== null && !(LEAVE_TYPES as readonly string[]).includes(str(b))) warnings.push(`الإجازات صف ${r}: نوع غير معروف «${str(b)}»`);
  }
  model.leave = leave.map((l, i) => ({ ...l, row: CAP.leaveFirst + i }));
  const fcells: Raw[] = [];
  for (let r = CAP.leaveFirst; r <= CAP.leaveLast; r++) {
    const v = val(lv, `F${r}`);
    if (v !== null) fcells.push(v);
  }
  for (let i = 0; i < fcells.length; i += 2) model.leaveTotals.push({ name: str(fcells[i]), total: i + 1 < fcells.length ? fcells[i + 1] : null });

  const rawModel = clone(model);
  const finalModel = opts.applyCorrections === false ? model : applyApprovedCorrections(model);
  return { model: finalModel, rawModel, hash: await sha256Hex(bytes), warnings };
}
