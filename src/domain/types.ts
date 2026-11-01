/** A raw Excel cell value (number, text or empty). Raw values are kept so that
 *  text-in-numeric-cells survive import/export untouched. */
export type Raw = number | string | null;

export interface MonthRecord {
  month: number; // 1..12
  row: number; // sheet row (3..52)
  sector: string;
  gov: string;
  name: string;
  code: Raw; // numeric employee code (unique key)
  join: Raw; // Excel serial (1900 system) or raw text
  job: string;
  visits: Raw;
  scores: Raw[]; // 8 criteria
  notes: string;
}

export interface VisitRow {
  row: number; // sheet row (9..16 in the template)
  no: Raw;
  name: string;
  area: string;
  months: Raw[]; // 12
}

export interface LeaveRow {
  row: number; // 3..150
  name: string;
  type: string;
  start: Raw; // serial number (kind=date) or text (kind=text)
  startKind: 'date' | 'text' | 'empty';
  end: Raw;
  endKind: 'date' | 'text' | 'empty';
  days: Raw;
}

export interface LeaveTotal {
  name: string;
  total: Raw;
}

export interface Lists {
  sectors: string[];
  governorates: string[];
}

export interface AppModel {
  lists: Lists;
  months: MonthRecord[]; // all months flattened
  mainNotes: Record<string, string>; // by code (stringified)
  visits: VisitRow[];
  leave: LeaveRow[];
  leaveTotals: LeaveTotal[];
  date1904: boolean;
  /** corrections the user explicitly approved (applied on import) */
  appliedCorrections: Correction[];
}

export interface Correction {
  id: string;
  code: number;
  field: 'join';
  from: Raw;
  to: Raw;
  reason: string;
}

export interface EmployeeRow {
  index: number; // 1-based position (column A)
  code: number | string;
  sector: string;
  gov: string;
  name: string;
  join: Raw;
  job: string;
  visits: number;
  points: number;
  monthsSince: number; // K, fractional
  grade: Grade;
  firstMonth: number;
  notes: string;
}

export type Grade = 'ممتاز' | 'جيد جداً' | 'جيد' | 'مقبول' | 'ضعيف';

export type Severity = 'info' | 'warn' | 'error';
export interface QualityItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  where?: string;
}
