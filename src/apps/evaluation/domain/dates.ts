import type { Raw } from './types';

const MS_DAY = 86400000;
const EPOCH_1900 = Date.UTC(1899, 11, 30); // serial 0 (Excel 1900 system, valid for serial >= 61)
const EPOCH_1904 = Date.UTC(1904, 0, 1);

export function serialToISO(serial: number, date1904 = false): string {
  const base = date1904 ? EPOCH_1904 : EPOCH_1900;
  const d = new Date(base + Math.floor(serial) * MS_DAY);
  return d.toISOString().slice(0, 10);
}

export function isoToSerial(iso: string, date1904 = false): number {
  const [y, m, d] = iso.split('-').map(Number);
  const base = date1904 ? EPOCH_1904 : EPOCH_1900;
  return Math.round((Date.UTC(y, m - 1, d) - base) / MS_DAY);
}

/** Today at local midnight as an Excel serial (like TODAY()). */
export function todaySerial(asOf?: string | Date | number, date1904 = false): number {
  if (typeof asOf === 'number') return asOf;
  if (typeof asOf === 'string') return isoToSerial(asOf, date1904);
  const d = asOf ?? new Date();
  return isoToSerial(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, date1904);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** dd/mm/yyyy display */
export function fmtDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtSerial(v: Raw, date1904 = false): string {
  if (typeof v === 'number') return v > 0 ? fmtDMY(serialToISO(v, date1904)) : '';
  return v ?? '';
}

/** Parse the text form d/m/yyyy (also d-m-yyyy, d.m.yyyy). Returns ISO or null. */
export function parseDMY(text: string): string | null {
  const m = /^\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Interpret a leave-log date cell (real date or d/m/yyyy text) as ISO; null if unparsable. */
export function leaveDateToISO(v: Raw, kind: 'date' | 'text' | 'empty', date1904 = false): string | null {
  if (v === null || v === '' || kind === 'empty') return null;
  if (kind === 'date' && typeof v === 'number') return serialToISO(v, date1904);
  if (typeof v === 'string') return parseDMY(v);
  return null;
}

/** Swap day and month of an ISO date (returns null if the swap is not a valid date). */
export function swapDayMonth(iso: string): string | null {
  const [y, m, d] = iso.split('-').map(Number);
  if (d > 12) return null;
  return `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
}
