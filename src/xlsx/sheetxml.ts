import type { Raw } from '../domain/types';
import { colToNum, decodeXml, escAttr, escXml, parseAttrs, splitRef } from './xml';

export type SharedStrings = string[];

export function readSharedStrings(xml: string | null): SharedStrings {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const body = (m[1] ?? '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let text = '';
    const tre = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
    let t: RegExpExecArray | null;
    while ((t = tre.exec(body))) text += decodeXml(t[1] ?? '');
    out.push(text);
  }
  return out;
}

interface CellNode {
  col: number;
  xml: string;
}
interface RowNode {
  n: number;
  head: string; // opening tag text, without trailing "/" or ">"
  cells: CellNode[];
  original: string;
  dirty: boolean;
  spansStale: boolean;
}

export interface CellRead {
  value: Raw;
  hasFormula: boolean;
  style?: string;
  type?: string;
}

const ROW_RE = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;

function cellRef(xml: string): string {
  const m = /<c\b[^>]*?\br="([A-Z]+\d+)"/.exec(xml);
  if (!m) throw new Error('cell without r attribute');
  return m[1];
}

export function readCellXml(xml: string, sst: SharedStrings): CellRead {
  const m = /^<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)$/.exec(xml);
  if (!m) return { value: null, hasFormula: false };
  const attrs = new Map(parseAttrs(m[1]));
  const inner = m[3] ?? '';
  const t = attrs.get('t');
  const hasFormula = /<f\b/.test(inner);
  let value: Raw = null;
  const v = /<v\b[^>]*?>([\s\S]*?)<\/v>/.exec(inner);
  if (t === 'inlineStr') {
    let text = '';
    const tre = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
    let x: RegExpExecArray | null;
    const body = (/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    while ((x = tre.exec(body))) text += decodeXml(x[1] ?? '');
    value = text === '' ? null : text;
  } else if (v) {
    const raw = v[1];
    if (t === 's') value = sst[Number(raw)] ?? null;
    else if (t === 'str') value = decodeXml(raw);
    else if (t === 'b') value = raw === '1' ? 1 : 0;
    else if (t === 'e') value = decodeXml(raw);
    else {
      const n = Number(raw);
      value = raw.trim() === '' ? null : Number.isFinite(n) ? n : decodeXml(raw);
    }
    if (typeof value === 'string' && value === '') value = null;
  }
  return { value, hasFormula, style: attrs.get('s'), type: t };
}

export class SheetXml {
  private pre = '';
  private post = '';
  private rows: RowNode[] = [];
  private byRow = new Map<number, RowNode>();
  private emptySheetData = false;
  changed = 0;

  constructor(public xml: string, private sst: SharedStrings) {
    const sd = /<sheetData\b[^>]*?(\/>|>)/.exec(xml);
    if (!sd) throw new Error('sheetData not found');
    if (sd[1] === '/>') {
      this.emptySheetData = true;
      this.pre = xml.slice(0, sd.index);
      this.post = xml.slice(sd.index + sd[0].length);
      return;
    }
    const start = sd.index + sd[0].length;
    const end = xml.indexOf('</sheetData>', start);
    this.pre = xml.slice(0, start);
    this.post = xml.slice(end);
    const body = xml.slice(start, end);
    let m: RegExpExecArray | null;
    ROW_RE.lastIndex = 0;
    while ((m = ROW_RE.exec(body))) {
      const attrs = new Map(parseAttrs(m[1]));
      const n = Number(attrs.get('r'));
      const cells: CellNode[] = [];
      if (m[3]) {
        let c: RegExpExecArray | null;
        const cre = new RegExp(CELL_RE.source, 'g');
        while ((c = cre.exec(m[3]))) cells.push({ col: colToNum(splitRef(cellRef(c[0])).col), xml: c[0] });
      }
      const node: RowNode = { n, head: `<row${m[1]}`, cells, original: m[0], dirty: false, spansStale: false };
      this.rows.push(node);
      this.byRow.set(n, node);
    }
  }

  get(ref: string): CellRead | undefined {
    const { col, row } = splitRef(ref);
    const r = this.byRow.get(row);
    const c = r?.cells.find((x) => x.col === colToNum(col));
    return c ? readCellXml(c.xml, this.sst) : undefined;
  }

  rowNumbers(): number[] {
    return this.rows.map((r) => r.n);
  }

  private ensureRow(n: number): RowNode {
    let r = this.byRow.get(n);
    if (r) return r;
    r = { n, head: `<row r="${n}"`, cells: [], original: '', dirty: true, spansStale: false };
    const idx = this.rows.findIndex((x) => x.n > n);
    if (idx < 0) this.rows.push(r);
    else this.rows.splice(idx, 0, r);
    this.byRow.set(n, r);
    return r;
  }

  /** Build the replacement cell XML keeping every attribute but `t`. */
  private buildCell(ref: string, attrsStr: string | null, value: Raw, styleFallback?: string): string {
    const attrs = attrsStr ? parseAttrs(attrsStr).filter(([k]) => k !== 't') : ([['r', ref]] as Array<[string, string]>);
    if (!attrs.some(([k]) => k === 's') && styleFallback) attrs.push(['s', styleFallback]);
    const a = attrs.map(([k, v]) => `${k}="${v}"`).join(' ');
    if (value === null || value === '') return attrs.length > 1 ? `<c ${a}/>` : '';
    if (typeof value === 'number') return `<c ${a}><v>${Number.isInteger(value) ? value : repr(value)}</v></c>`;
    const sp = /^\s|\s$|\n|\s\s/.test(value) ? ' xml:space="preserve"' : '';
    return `<c ${a} t="inlineStr"><is><t${sp}>${escXml(value)}</t></is></c>`;
  }

  /** Set an *input* cell. Formula cells are never touched. Returns true when the XML changed. */
  set(ref: string, value: Raw, styleFallback?: string): boolean {
    const { col, row } = splitRef(ref);
    const cn = colToNum(col);
    const existing = this.byRow.get(row)?.cells.find((x) => x.col === cn);
    if (existing) {
      const cur = readCellXml(existing.xml, this.sst);
      if (cur.hasFormula) return false;
      if (sameRaw(cur.value, value)) return false;
    } else if (value === null || value === '') return false;
    const r = this.ensureRow(row);
    const idx = r.cells.findIndex((x) => x.col === cn);
    let attrsStr: string | null = null;
    if (idx >= 0) {
      const m = /^<c\b([^>]*?)(?:\/>|>)/.exec(r.cells[idx].xml);
      attrsStr = m ? m[1] : null;
    }
    const xml = this.buildCell(ref, attrsStr, value, styleFallback);
    if (idx >= 0) {
      if (xml === '') r.cells.splice(idx, 1);
      else r.cells[idx] = { col: cn, xml };
    } else {
      const pos = r.cells.findIndex((x) => x.col > cn);
      const node = { col: cn, xml };
      if (pos < 0) r.cells.push(node);
      else r.cells.splice(pos, 0, node);
      r.spansStale = true;
    }
    r.dirty = true;
    this.changed++;
    return true;
  }

  /** Remove stale cached results of formula cells (Excel recalculates on load). */
  stripFormulaCaches(): number {
    let n = 0;
    for (const r of this.rows) {
      r.cells.forEach((c, i) => {
        if (!/<f\b/.test(c.xml)) return;
        if (!/<v\b/.test(c.xml) && !/\bt="(str|e|b)"/.test(c.xml)) return;
        let x = c.xml.replace(/<v\b[^>]*?>[\s\S]*?<\/v>/, '').replace(/<v\b[^>]*?\/>/, '');
        x = x.replace(/^(<c\b[^>]*?)\s+t="(?:str|e|b|n)"/, '$1');
        if (x !== c.xml) {
          r.cells[i] = { col: c.col, xml: x };
          r.dirty = true;
          n++;
        }
      });
    }
    return n;
  }

  /** Rewrite the cached result of a formula cell (the formula itself is never touched). */
  setCached(ref: string, value: number | string): boolean {
    const { col, row } = splitRef(ref);
    const r = this.byRow.get(row);
    const i = r?.cells.findIndex((x) => x.col === colToNum(col)) ?? -1;
    if (!r || i < 0) return false;
    const xml = r.cells[i].xml;
    const m = /^<c\b([^>]*?)>([\s\S]*?)<\/c>$/.exec(xml);
    if (!m || !/<f\b/.test(m[2])) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    const hasV = /<v\b/.test(m[2]);
    if (hasV) {
      const cur = readCellXml(xml, this.sst).value;
      if (typeof value === 'number' ? typeof cur === 'number' && Math.abs(cur - value) < 1e-9 : (cur ?? '') === value && !/\bt="e"/.test(m[1])) return false;
    }
    const attrs = parseAttrs(m[1]).filter(([k]) => k !== 't');
    if (typeof value === 'string') attrs.push(['t', 'str']);
    const inner = m[2].replace(/<v\b[^>]*?>[\s\S]*?<\/v>/, '').replace(/<v\b[^>]*?\/>/, '');
    r.cells[i] = { col: r.cells[i].col, xml: `<c ${attrs.map(([k, v]) => `${k}="${v}"`).join(' ')}>${inner}<v>${typeof value === 'string' ? escXml(value) : String(value)}</v></c>` };
    r.dirty = true;
    return true;
  }

  getFormula(ref: string): string | null {
    const { col, row } = splitRef(ref);
    const c = this.byRow.get(row)?.cells.find((x) => x.col === colToNum(col));
    if (!c) return null;
    const m = /<f\b[^>]*?>([\s\S]*?)<\/f>/.exec(c.xml);
    return m ? decodeXml(m[1]) : null;
  }

  isDirty(): boolean {
    return this.rows.some((r) => r.dirty);
  }

  toString(): string {
    if (this.emptySheetData && !this.rows.length) return this.xml;
    const body = this.rows
      .map((r) => {
        if (!r.dirty) return r.original;
        let head = r.head;
        if (r.spansStale) head = head.replace(/\sspans="[^"]*"/, '');
        if (!r.cells.length) return `${head}/>`;
        return `${head}>${r.cells.map((c) => c.xml).join('')}</row>`;
      })
      .join('');
    if (this.emptySheetData) return `${this.pre}<sheetData>${body}</sheetData>${this.post}`;
    return this.pre + body + this.post;
  }
}

function repr(n: number): string {
  return String(n);
}

export function sameRaw(a: Raw, b: Raw): boolean {
  const ea = a === null || a === '';
  const eb = b === null || b === '';
  if (ea || eb) return ea && eb;
  return typeof a === typeof b && a === b;
}

export { escAttr };
