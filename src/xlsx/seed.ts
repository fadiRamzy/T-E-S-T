import { MONTH_NAMES } from '../domain/constants';
import { isoToSerial } from '../domain/dates';
import { emptyModel } from '../domain/model';
import type { AppModel, Raw } from '../domain/types';
import type { Seed } from './fixture';

/** Appendix-A seed → model (what a faithful import of the original workbook yields). */
export function seedToModel(seed: Seed): AppModel {
  const m = emptyModel();
  m.grid = { firstRow: 3, lastRow: 52 };
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
  return m;
}
