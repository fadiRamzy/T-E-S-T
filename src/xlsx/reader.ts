import type { Raw } from '../domain/types';

/** A worksheet reduced to values (formula cells give their cached result). */
export interface Grid {
  name: string;
  hidden: boolean;
  maxRow: number;
  maxCol: number;
  /** 1-based row/col */
  get(row: number, col: number): Raw;
}
export interface WorkbookGrid {
  sheets: Grid[];
  date1904: boolean;
  kind: 'xlsx' | 'xls';
  /** only for .xls: the same workbook converted to .xlsx so it can be used as the export template */
  converted?: Uint8Array;
}

export class ReadError extends Error {}

function magic(bytes: Uint8Array): 'zip' | 'ole' | 'other' {
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  if (bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'ole';
  return 'other';
}

/**
 * Reads any Excel workbook (.xlsx/.xlsm via ZIP, legacy .xls via OLE2) with SheetJS.
 * Nothing about the internal XML layout, styles, metadata or hash matters here.
 */
export async function readWorkbookGrid(bytes: Uint8Array): Promise<WorkbookGrid> {
  const kind = magic(bytes);
  if (kind === 'other') throw new ReadError('الملف ليس مصنف Excel (يجب أن يكون .xlsx أو .xls). إذا كان الملف بصيغة CSV أو PDF فاحفظه من Excel بصيغة xlsx.');
  const XLSX = await import('xlsx');
  let wb;
  try {
    wb = XLSX.read(bytes, { type: 'array', cellDates: false, cellFormula: false, cellStyles: false, cellNF: false, sheetStubs: false });
  } catch (e) {
    throw new ReadError(`تعذّر قراءة الملف — قد يكون تالفاً أو محمياً بكلمة مرور (${(e as Error).message}).`);
  }
  if (!wb.SheetNames?.length) throw new ReadError('الملف لا يحتوي على أي شيت.');
  const sheets: Grid[] = wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name];
    const ref = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    const hidden = (wb.Workbook?.Sheets?.[i]?.Hidden ?? 0) !== 0;
    return {
      name,
      hidden,
      maxRow: ref ? ref.e.r + 1 : 0,
      maxCol: ref ? ref.e.c + 1 : 0,
      get(row: number, col: number): Raw {
        const c = ws[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })];
        if (!c || c.v === undefined || c.v === null) return null;
        if (c.t === 'e') return null;
        if (c.t === 'n') return Number.isFinite(c.v) ? (c.v as number) : null;
        if (c.t === 'b') return c.v ? 1 : 0;
        if (c.t === 'd') return null;
        const s = String(c.v);
        return s.trim() === '' ? null : s;
      },
    };
  });
  const out: WorkbookGrid = { sheets, date1904: !!wb.Workbook?.WBProps?.date1904, kind: kind === 'ole' ? 'xls' : 'xlsx' };
  if (kind === 'ole') {
    // Re-read with formulas/styles kept, so the converted copy is as faithful as SheetJS allows.
    const full = XLSX.read(bytes, { type: 'array', cellFormula: true, cellStyles: true, cellNF: true });
    out.converted = new Uint8Array(XLSX.write(full, { bookType: 'xlsx', type: 'array', cellStyles: true }) as ArrayBuffer);
  }
  return out;
}
