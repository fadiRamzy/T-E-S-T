import { MONTH_NAMES, REMOVED_SHEETS, SHEET } from '../domain/constants';
import type { Grid, WorkbookGrid } from './reader';
import { monthFromText, norm } from './names';

export type Level = 'error' | 'warn' | 'info';
export interface Issue { level: Level; sheet?: string; message: string }

export interface MonthCols {
  sector?: number; gov?: number; name: number; code: number; join?: number; job?: number;
  visits: number; scores: number[]; notes?: number; total?: number;
}
export interface MonthLayout { month: number; sheet: string; headerRow: number; firstRow: number; lastRow: number; cols: MonthCols; mapped: string[] }
export interface MainCols { no?: number; sector?: number; gov?: number; name?: number; code: number; join?: number; job?: number; visits?: number; points?: number; grade?: number; months?: number; notes?: number }
export interface MainLayout { sheet: string; headerRow: number; firstRow: number; cols: MainCols }
export interface DataLayout { sheet: string; headerRow: number; sectorCol?: number; govCol?: number }

export interface SheetReport {
  kind: 'month' | 'main' | 'data' | 'removed' | 'ignored';
  sheet: string;
  label: string;
  status: 'ok' | 'warn' | 'missing' | 'error';
  rows?: number;
  detail: string;
}

export interface Layout {
  months: Array<MonthLayout | undefined>; // index 0..11
  main?: MainLayout;
  data?: DataLayout;
  /** actual sheet names that are removed from every export (visits / leave) */
  removed: string[];
  reports: SheetReport[];
  issues: Issue[];
}

const HEADER_SCAN_ROWS = 15;

function rowCells(g: Grid, row: number): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  const maxC = Math.min(g.maxCol, 60);
  for (let c = 1; c <= maxC; c++) {
    const v = g.get(row, c);
    if (v !== null) out.push([c, norm(v)]);
  }
  return out;
}

function findHeaderRow(g: Grid, test: (cells: Array<[number, string]>) => boolean): number {
  for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, g.maxRow); r++) if (test(rowCells(g, r))) return r;
  return 0;
}

const isCode = (t: string) => t === 'الكود' || t === 'كود' || t === 'كود الموظف' || t === 'الكود الوظيفي';
const has = (cells: Array<[number, string]>, f: (t: string) => boolean) => cells.find(([, t]) => f(t))?.[0];

function monthColumns(cells: Array<[number, string]>, month: number): { cols?: MonthCols; mapped: string[]; problems: string[]; warns: string[] } {
  const problems: string[] = [];
  const warns: string[] = [];
  const mapped: string[] = [];
  const code = has(cells, isCode);
  const name = has(cells, (t) => t.startsWith('اسم الموظف') || t === 'الاسم' || t === 'اسم');
  const sector = has(cells, (t) => t === 'القطاع');
  const gov = has(cells, (t) => t === 'المحافظه');
  const join = has(cells, (t) => t.includes('تاريخ الالتحاق') || t.includes('تاريخ التعيين'));
  const job = has(cells, (t) => t === 'الوظيفه');
  const notes = has(cells, (t) => t === 'ملاحظات' || t === 'الملاحظات');
  const total = has(cells, (t) => t === 'الاجمالي' || t === 'اجمالي' || t === 'المجموع');
  const visits = has(cells, (t) => monthFromText(t) === month) ?? has(cells, (t) => monthFromText(t) > 0) ?? has(cells, (t) => t.includes('عدد الزيارات') || t === 'الزيارات');
  if (code === undefined) problems.push('عمود «الكود»');
  if (name === undefined) problems.push('عمود «اسم الموظف»');
  if (visits === undefined) problems.push(`عمود عدد الزيارات (عنوانه اسم الشهر «${MONTH_NAMES[month - 1]}»)`);
  let scores: number[] = [];
  if (visits !== undefined) {
    const end = total ?? notes ?? Infinity;
    const between = cells.map(([c]) => c).filter((c) => c > visits && c < end);
    if (total !== undefined || notes !== undefined) scores = between;
    else scores = Array.from({ length: 8 }, (_, i) => visits + 1 + i);
    if (scores.length > 8) { warns.push(`وُجد ${scores.length} عمود تقييم، سيُؤخذ أول 8 فقط`); scores = scores.slice(0, 8); }
    if (scores.length < 8) problems.push(`معايير التقييم الثمانية (وُجد ${scores.length} فقط بين عمود الزيارات والإجمالي)`);
  }
  if (problems.length) return { mapped, problems, warns };
  const opt: Array<[string, number | undefined]> = [['القطاع', sector], ['المحافظة', gov], ['تاريخ الالتحاق', join], ['الوظيفة', job], ['الإجمالي', total], ['الملاحظات', notes]];
  for (const [label, c] of opt) if (c === undefined) warns.push(`عمود «${label}» غير موجود — لن يُستورد/يُكتب`);
  mapped.push(`الكود=${code}`, `الاسم=${name}`, `الزيارات=${visits}`, `التقييمات=${scores[0]}…${scores[7]}`);
  return { cols: { sector, gov, name: name!, code: code!, join, job, visits: visits!, scores, notes, total }, mapped, problems, warns };
}

const colLetter = (n: number) => { let s = ''; while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Recognises sheets by NAME first and by CONTENT (header texts) second. No fixed cell positions. */
export function detectLayout(wb: WorkbookGrid): Layout {
  const issues: Issue[] = [];
  const reports: SheetReport[] = [];
  const months: Array<MonthLayout | undefined> = Array(12).fill(undefined);
  const removed: string[] = [];
  const used = new Set<string>();

  const removedNorm = REMOVED_SHEETS.map(norm);
  for (const g of wb.sheets) {
    const n = norm(g.name);
    if (removedNorm.includes(n) || removedNorm.some((r) => n.includes(r))) {
      removed.push(g.name); used.add(g.name);
      reports.push({ kind: 'removed', sheet: g.name, label: 'قسم غير مدعوم', status: 'ok', detail: 'يُتجاهل عند الاستيراد ويُحذف من ملف التصدير.' });
    }
  }

  const candidatesFor = (m: number): Grid[] => {
    const byName = wb.sheets.filter((g) => !used.has(g.name) && monthFromText(g.name) === m);
    if (byName.length) return byName;
    // content fallback: a sheet whose header row has a code column and this month name as a header
    return wb.sheets.filter((g) => {
      if (used.has(g.name) || monthFromText(g.name) > 0) return false;
      const hr = findHeaderRow(g, (cs) => !!has(cs, isCode) && cs.some(([, t]) => monthFromText(t) === m));
      return hr > 0;
    });
  };

  for (let m = 1; m <= 12; m++) {
    const label = `شهر ${MONTH_NAMES[m - 1]}`;
    const cands = candidatesFor(m);
    if (!cands.length) {
      reports.push({ kind: 'month', sheet: MONTH_NAMES[m - 1], label, status: 'missing', detail: `لم يُعثر على شيت «${MONTH_NAMES[m - 1]}» — سيُعامل الشهر كأنه فارغ.` });
      issues.push({ level: 'warn', message: `شيت «${MONTH_NAMES[m - 1]}» غير موجود في الملف (الشهر بلا بيانات).` });
      continue;
    }
    const g = cands[0];
    used.add(g.name);
    const hr = findHeaderRow(g, (cs) => !!has(cs, isCode));
    if (!hr) {
      const msg = `شيت «${g.name}»: لم يُعثر على عمود «الكود» في أول ${HEADER_SCAN_ROWS} صفاً — لا يمكن تحديد الأعمدة.`;
      issues.push({ level: 'error', sheet: g.name, message: msg });
      reports.push({ kind: 'month', sheet: g.name, label, status: 'error', detail: msg });
      continue;
    }
    const r = monthColumns(rowCells(g, hr), m);
    if (!r.cols) {
      const msg = `شيت «${g.name}»: أعمدة مطلوبة غير موجودة في صف العناوين (${hr}): ${r.problems.join('، ')}.`;
      issues.push({ level: 'error', sheet: g.name, message: msg });
      reports.push({ kind: 'month', sheet: g.name, label, status: 'error', detail: msg });
      continue;
    }
    for (const w of r.warns) issues.push({ level: 'warn', sheet: g.name, message: `شيت «${g.name}»: ${w}.` });
    months[m - 1] = { month: m, sheet: g.name, headerRow: hr, firstRow: hr + 1, lastRow: Math.max(g.maxRow, hr + 1), cols: r.cols, mapped: r.mapped };
    reports.push({
      kind: 'month', sheet: g.name, label, status: r.warns.length ? 'warn' : 'ok',
      detail: `صف العناوين ${hr} · الكود ${colLetter(r.cols.code)} · الاسم ${colLetter(r.cols.name)} · الزيارات ${colLetter(r.cols.visits)} · التقييمات ${colLetter(r.cols.scores[0])}–${colLetter(r.cols.scores[7])}${r.warns.length ? ' · ' + r.warns.join('، ') : ''}`,
    });
  }

  // ---- main (annual) sheet ----
  let main: MainLayout | undefined;
  {
    const byName = wb.sheets.find((g) => !used.has(g.name) && norm(g.name).includes('التقييم السنوي'));
    const isMainHeader = (cs: Array<[number, string]>) => !!has(cs, isCode) && cs.some(([, t]) => t.includes('درجه') || t.includes('عدد الزيارات السنوي') || t.includes('اشهر'));
    const g = byName ?? wb.sheets.find((x) => !used.has(x.name) && findHeaderRow(x, isMainHeader) > 0);
    if (g) {
      used.add(g.name);
      const hr = findHeaderRow(g, (cs) => !!has(cs, isCode));
      if (hr) {
        const cs = rowCells(g, hr);
        main = {
          sheet: g.name, headerRow: hr, firstRow: hr + 1,
          cols: {
            no: has(cs, (t) => t === 'الرقم' || t === 'م'), sector: has(cs, (t) => t === 'القطاع'), gov: has(cs, (t) => t === 'المحافظه'),
            name: has(cs, (t) => t.startsWith('اسم الموظف')), code: has(cs, isCode)!, join: has(cs, (t) => t.includes('تاريخ الالتحاق')),
            job: has(cs, (t) => t === 'الوظيفه'), visits: has(cs, (t) => t.includes('عدد الزيارات')),
            points: has(cs, (t) => t.includes('اجمالي تقييم') || t.includes('بالنقاط')), grade: has(cs, (t) => t.includes('درجه')),
            months: has(cs, (t) => t.includes('عدد اشهر')), notes: has(cs, (t) => t === 'ملاحظات' || t === 'الملاحظات'),
          },
        };
        const miss = main.cols.notes === undefined ? 'عمود «ملاحظات» غير موجود (لن تُستورد/تُكتب الملاحظات)' : '';
        reports.push({ kind: 'main', sheet: g.name, label: 'الشيت الرئيسي (التقييم السنوي)', status: miss ? 'warn' : 'ok', detail: `صف العناوين ${hr}${miss ? ' · ' + miss : ''}` });
        if (miss) issues.push({ level: 'warn', sheet: g.name, message: `شيت «${g.name}»: ${miss}.` });
      } else {
        const msg = `شيت «${g.name}» (الرئيسي): لم يُعثر على عمود «الكود» — لن تُقرأ الملاحظات ولن تُحدَّث القيم المحسوبة.`;
        issues.push({ level: 'warn', sheet: g.name, message: msg });
        reports.push({ kind: 'main', sheet: g.name, label: 'الشيت الرئيسي (التقييم السنوي)', status: 'warn', detail: msg });
      }
    } else {
      issues.push({ level: 'warn', message: `الشيت الرئيسي «${SHEET.main}» غير موجود — لن تُقرأ الملاحظات السنوية، والموظفون يُستنتجون من الشيتات الشهرية.` });
      reports.push({ kind: 'main', sheet: SHEET.main, label: 'الشيت الرئيسي (التقييم السنوي)', status: 'missing', detail: 'غير موجود في الملف.' });
    }
  }

  // ---- Data (lists) ----
  let data: DataLayout | undefined;
  {
    const test = (cs: Array<[number, string]>) => cs.some(([, t]) => t === 'القطاع') && cs.some(([, t]) => t === 'المحافظه');
    const g = wb.sheets.find((x) => !used.has(x.name) && norm(x.name) === 'data') ?? wb.sheets.find((x) => !used.has(x.name) && x.hidden && findHeaderRow(x, test) > 0) ?? wb.sheets.find((x) => !used.has(x.name) && findHeaderRow(x, test) > 0 && x.maxCol <= 30 && x.maxRow < 200);
    if (g) {
      used.add(g.name);
      const hr = findHeaderRow(g, test);
      if (hr) {
        const cs = rowCells(g, hr);
        data = { sheet: g.name, headerRow: hr, sectorCol: has(cs, (t) => t === 'القطاع'), govCol: has(cs, (t) => t === 'المحافظه') };
        reports.push({ kind: 'data', sheet: g.name, label: 'قوائم القطاع والمحافظة (مرجعية)', status: 'ok', detail: `الأعمدة ${colLetter(data.sectorCol!)} و ${colLetter(data.govCol!)}` });
      } else {
        reports.push({ kind: 'data', sheet: g.name, label: 'قوائم القطاع والمحافظة (مرجعية)', status: 'warn', detail: 'لم تُوجد عناوين «القطاع/المحافظة» — ستُستنتج القوائم من بيانات الأشهر.' });
      }
    } else {
      reports.push({ kind: 'data', sheet: SHEET.data, label: 'قوائم القطاع والمحافظة (مرجعية)', status: 'missing', detail: 'شيت Data غير موجود — ستُستنتج القوائم من بيانات الأشهر.' });
      issues.push({ level: 'info', message: 'شيت Data غير موجود: القوائم المنسدلة ستُستنتج من القيم المستخدمة فعلاً.' });
    }
  }

  for (const g of wb.sheets) if (!used.has(g.name)) reports.push({ kind: 'ignored', sheet: g.name, label: 'شيت إضافي', status: 'ok', detail: 'غير معروف — يُتجاهل ويبقى كما هو في الملف.' });

  if (!months.some(Boolean)) issues.push({ level: 'error', message: 'لم يُعثر على أي شيت شهري (يناير … ديسمبر) صالح — لا توجد بيانات تقييم للاستيراد.' });
  return { months, main, data, removed, reports, issues };
}

export const hasBlockingIssues = (l: Layout) => l.issues.some((i) => i.level === 'error');
