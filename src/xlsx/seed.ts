import { MONTH_NAMES } from '../domain/constants';
import { isoToSerial } from '../domain/dates';
import { emptyModel } from '../domain/model';
import type { AppModel, Raw } from '../domain/types';
import type { Seed } from './fixture';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Appendix-A seed → model (what a faithful import of the original workbook yields). */
export function seedToModel(seed: Seed): AppModel {
  const m = emptyModel();
  m.lists = { sectors: [...seed.Data.sectors], governorates: [...seed.Data.governorates] };
  MONTH_NAMES.forEach((mn, mi) => {
    for (const r of seed.months[mn] ?? []) {
      m.months.push({
        month: mi + 1, row: r.row, sector: r.sector ?? '', gov: r.gov ?? '', name: r.name ?? '', code: r.code,
        join: r.join ? isoToSerial(r.join) : null, job: r.job ?? '', visits: r.visits ?? null,
        scores: (r.scores as Raw[]).map((x) => x ?? null), notes: r.notes ?? '',
      });
    }
  });
  m.visits = seed.visits.map((v: any, i: number) => ({ row: 9 + i, no: v.no, name: v.name, area: v.area, months: v.months.map((x: Raw) => x ?? null) }));
  m.leave = seed.leave.map((l: any, i: number) => ({
    row: 3 + i, name: l.name, type: l.type,
    start: l.start_kind === 'date' ? isoToSerial(l.start) : l.start, startKind: l.start_kind,
    end: l.end_kind === 'date' ? isoToSerial(l.end) : l.end, endKind: l.end_kind,
    days: l.days ?? null,
  }));
  const flat = [...seed.leave_manual_totals_F3_F15];
  if (flat.length === 13) flat.push(5);
  for (let i = 0; i < flat.length; i += 2) m.leaveTotals.push({ name: String(flat[i]), total: flat[i + 1] as number });
  return m;
}
