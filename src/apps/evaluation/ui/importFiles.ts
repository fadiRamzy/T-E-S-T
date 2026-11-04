import { combineModels } from '../domain/merge';
import type { AppModel } from '../domain/types';
import { analyzeWorkbook, type Analysis } from '../xlsx/import';
import { applyConsolidated, getState } from './store';

export interface FileOutcome {
  name: string;
  ok: boolean;
  /** why the file was rejected (specific missing sheet / column messages) */
  errors: string[];
  warnings: string[];
  added: number; updated: number; unchanged: number; newEmployees: number; dropped: number; ignoredDuplicates: number;
}
export interface ImportReport { files: FileOutcome[]; applied: boolean; undoable: boolean; employees: number }

const EXT = /\.(xlsx|xlsm|xls)$/i;
const blank = (name: string): FileOutcome => ({ name, ok: false, errors: [], warnings: [], added: 0, updated: 0, unchanged: 0, newEmployees: 0, dropped: 0, ignoredDuplicates: 0 });
const monthSheets = (a: Analysis) => a.layout.reports.filter((r) => r.kind === 'month' && r.status === 'ok').length;

/**
 * Import one or more workbooks and ACCUMULATE them into the app data (nothing is replaced or erased):
 * every file is validated with the usual import rules, then combined in selection order by employee code + month.
 * The export template is the first successfully imported workbook (or the one with the most monthly sheets when
 * several files are selected together on an empty app) and stays unchanged for later imports.
 */
export async function importFiles(files: File[]): Promise<ImportReport> {
  const outcomes: FileOutcome[] = [];
  const good: Array<{ a: Analysis; o: FileOutcome }> = [];
  for (const f of files) {
    const o = blank(f.name);
    outcomes.push(o);
    if (!EXT.test(f.name)) { o.errors.push('الصيغ المقبولة: .xlsx أو .xls'); continue; }
    try {
      const a = await analyzeWorkbook(new Uint8Array(await f.arrayBuffer()), f.name);
      o.warnings = a.issues.filter((i) => i.level === 'warn').map((i) => i.message);
      o.ignoredDuplicates = a.ignored.length;
      if (a.blocking) { o.errors = a.issues.filter((i) => i.level === 'error').map((i) => i.message); continue; }
      good.push({ a, o });
    } catch (e) { o.errors.push(e instanceof Error ? e.message : 'تعذّر قراءة الملف'); }
  }
  if (!good.length) return { files: outcomes, applied: false, undoable: false, employees: 0 };

  const before = getState().model;
  const hasTemplate = !!getState().template;
  let acc: AppModel | null = before && before.months.length ? before : null;
  for (const { a, o } of good) {
    if (!acc) {
      acc = a.model;
      o.ok = true; o.added = a.model.months.length;
      o.newEmployees = new Set(a.model.months.map((r) => String(r.code ?? '')).filter(Boolean)).size;
      continue;
    }
    const plan = combineModels(acc, a.model);
    acc = plan.model;
    Object.assign(o, { ok: true, added: plan.stats.added, updated: plan.stats.updated, unchanged: plan.stats.unchanged, newEmployees: plan.stats.newEmployees, dropped: plan.stats.dropped });
  }

  let tpl = null;
  if (!hasTemplate || !before) {
    const best = good.reduce((b, c) => (monthSheets(c.a) > monthSheets(b.a) ? c : b), good[0]);
    tpl = { bytes: best.a.templateBytes, name: best.a.fileName, hash: best.a.hash, importedAt: Date.now() };
  }
  await applyConsolidated(acc!, tpl, 'استيراد ملفات Excel');
  const employees = new Set(acc!.months.map((r) => String(r.code ?? '')).filter(Boolean)).size;
  return { files: outcomes, applied: true, undoable: !!before, employees };
}
