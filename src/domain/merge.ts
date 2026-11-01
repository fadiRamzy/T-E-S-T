import { MONTH_NAMES } from './constants';
import { clone, firstFreeRow, gridOf } from './model';
import { buildRoster, codeKey } from './roster';
import type { AppModel, MonthRecord } from './types';

export type Strategy = 'merge' | 'add-only' | 'replace';
export interface MergeOptions { strategy: Strategy; removeMissing: boolean }

export interface RecordChange {
  month: number; code: string; name: string;
  kind: 'new' | 'updated' | 'removed' | 'kept';
  fields: string[];
}
export interface MergePlan {
  model: AppModel;
  stats: { added: number; updated: number; unchanged: number; kept: number; removed: number; dropped: number; newEmployees: number; removedEmployees: number };
  changes: RecordChange[];
}

const FIELD_LABELS: Array<[string, (r: MonthRecord) => unknown]> = [
  ['القطاع', (r) => r.sector], ['المحافظة', (r) => r.gov], ['الاسم', (r) => r.name], ['تاريخ الالتحاق', (r) => r.join],
  ['الوظيفة', (r) => r.job], ['الزيارات', (r) => r.visits],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i): [string, (r: MonthRecord) => unknown] => [`المعيار ${i}`, (r) => r.scores[i - 1]]),
  ['الملاحظات', (r) => r.notes],
];
const norm = (v: unknown) => (v === null || v === undefined || v === '' ? null : v);

export function diffRecords(a: MonthRecord, b: MonthRecord): string[] {
  return FIELD_LABELS.filter(([, f]) => norm(f(a)) !== norm(f(b))).map(([l]) => l);
}

/**
 * Pure planner used both for the preview and for applying an import.
 * Employee code (per month) is the matching key; a code can never end up twice in a month.
 */
export function planMerge(current: AppModel | null, incoming: AppModel, opts: MergeOptions): MergePlan {
  const stats = { added: 0, updated: 0, unchanged: 0, kept: 0, removed: 0, dropped: 0, newEmployees: 0, removedEmployees: 0 };
  const changes: RecordChange[] = [];
  const out = clone(incoming);
  out.months = [];

  const curCodes = new Set((current?.months ?? []).map((r) => codeKey(r.code)).filter(Boolean) as string[]);
  const incCodes = new Set(incoming.months.map((r) => codeKey(r.code)).filter(Boolean) as string[]);
  stats.newEmployees = [...incCodes].filter((c) => !curCodes.has(c)).length;

  for (let m = 1; m <= 12; m++) {
    const inc = incoming.months.filter((r) => r.month === m);
    const cur = (current?.months ?? []).filter((r) => r.month === m);
    const curByKey = new Map<string, MonthRecord>();
    for (const r of cur) { const k = codeKey(r.code); if (k !== null && !curByKey.has(k)) curByKey.set(k, r); }
    const matched = new Set<string>();

    for (const r of inc) {
      const k = codeKey(r.code);
      const prev = k !== null ? curByKey.get(k) : undefined;
      if (!prev) {
        out.months.push(clone(r));
        stats.added++;
        changes.push({ month: m, code: k ?? '—', name: r.name, kind: 'new', fields: [] });
        continue;
      }
      matched.add(k!);
      const keepApp = opts.strategy === 'add-only';
      const chosen = keepApp ? { ...clone(prev), row: r.row } : clone(r);
      const diff = diffRecords(prev, r);
      if (diff.length === 0) stats.unchanged++;
      else if (keepApp) stats.unchanged++;
      else { stats.updated++; changes.push({ month: m, code: k!, name: r.name || prev.name, kind: 'updated', fields: diff }); }
      out.months.push(chosen);
    }

    // records that exist only in the app
    const only = cur.filter((r) => { const k = codeKey(r.code); return k === null ? true : !matched.has(k); });
    const dropAll = opts.strategy === 'replace' || opts.removeMissing;
    for (const r of only) {
      if (dropAll) {
        stats.removed++;
        changes.push({ month: m, code: codeKey(r.code) ?? '—', name: r.name, kind: 'removed', fields: [] });
        continue;
      }
      const usedRows = new Set(out.months.filter((x) => x.month === m).map((x) => x.row));
      let row = r.row;
      if (usedRows.has(row)) {
        const f = firstFreeRow(out, m);
        if (f === null) { stats.dropped++; continue; }
        row = f;
      }
      out.months.push({ ...clone(r), row });
      stats.kept++;
      changes.push({ month: m, code: codeKey(r.code) ?? '—', name: r.name, kind: 'kept', fields: [] });
    }
  }

  // lists / notes / corrections
  if (current) {
    if (opts.strategy !== 'replace') {
      out.lists.sectors = [...new Set([...incoming.lists.sectors, ...current.lists.sectors])];
      out.lists.governorates = [...new Set([...incoming.lists.governorates, ...current.lists.governorates])];
      out.mainNotes = opts.strategy === 'add-only' ? { ...incoming.mainNotes, ...current.mainNotes } : { ...current.mainNotes, ...incoming.mainNotes };
      const ids = new Set(incoming.appliedCorrections.map((c) => c.id));
      out.appliedCorrections = [...incoming.appliedCorrections, ...current.appliedCorrections.filter((c) => !ids.has(c.id))];
    } else if (!incoming.lists.sectors.length && !incoming.lists.governorates.length) out.lists = clone(current.lists);
    if (!out.grid) out.grid = current.grid;
    out.grid = out.grid ?? gridOf(out);
  }
  const finalCodes = new Set(out.months.map((r) => codeKey(r.code)).filter(Boolean) as string[]);
  stats.removedEmployees = [...curCodes].filter((c) => !finalCodes.has(c)).length;
  // notes of removed employees are dropped with them
  for (const k of Object.keys(out.mainNotes)) if (!k.startsWith('#row') && !finalCodes.has(k)) delete out.mainNotes[k];
  void buildRoster; void MONTH_NAMES;
  return { model: out, stats, changes };
}
