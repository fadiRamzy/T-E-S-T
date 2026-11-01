/**
 * Synthetic workbook generator. Builds a *structurally faithful* stand-in of the
 * original template (16 sheets, RTL, hidden Data, dynamic-array formulas with
 * cm="1" + metadata.xml, _xlfn formulas, x14 validations, CF, drawing + image,
 * printer settings, broken #REF! defined names …) from Appendix A seed data.
 * Used by the tests, CI and the "demo workbook" button.
 */
import JSZip from 'jszip';
import { MONTH_NAMES, REMOVED_SHEETS, SHEET } from '../domain/constants';
import { isoToSerial } from '../domain/dates';
import type { Raw } from '../domain/types';
import { escXml, numToCol } from './xml';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Seed {
  Data: { sectors: string[]; governorates: string[] };
  months: Record<string, any[]>;
  visits: any[];
  leave: any[];
  leave_manual_totals_F3_F15: Array<string | number>;
}

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

class Sst {
  list: string[] = [];
  map = new Map<string, number>();
  count = 0;
  idx(s: string) {
    this.count++;
    let i = this.map.get(s);
    if (i === undefined) { i = this.list.length; this.list.push(s); this.map.set(s, i); }
    return i;
  }
  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.count}" uniqueCount="${this.list.length}">${this.list
      .map((s) => `<si><t xml:space="preserve">${escXml(s)}</t></si>`).join('')}</sst>`;
  }
}

// style ids (cellXfs)
const S = { def: 0, band: 1, head: 2, text: 3, date14: 4, dateDM: 5, notes: 6, yellow: 7, total: 8, title: 9, num: 10, vname: 11 };

type Cell = { ref: string; s?: number; kind: 'n' | 's' | 'e' | 'f' | 'fa'; v?: any; cm?: boolean; cache?: any };
class Rows {
  rows = new Map<number, { ht?: number; cells: Map<number, Cell> }>();
  put(c: Cell, ht?: number) {
    const m = /^([A-Z]+)(\d+)$/.exec(c.ref)!;
    const r = Number(m[2]);
    let col = 0;
    for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
    if (!this.rows.has(r)) this.rows.set(r, { cells: new Map() });
    const row = this.rows.get(r)!;
    if (ht) row.ht = ht;
    row.cells.set(col, c);
  }
  ht(r: number, ht: number) {
    if (!this.rows.has(r)) this.rows.set(r, { cells: new Map() });
    this.rows.get(r)!.ht = ht;
  }
  xml(sst: Sst) {
    return [...this.rows.keys()].sort((a, b) => a - b).map((r) => {
      const row = this.rows.get(r)!;
      const cells = [...row.cells.keys()].sort((a, b) => a - b).map((k) => {
        const c = row.cells.get(k)!;
        const s = c.s !== undefined ? ` s="${c.s}"` : '';
        switch (c.kind) {
          case 'e': return `<c r="${c.ref}"${s}/>`;
          case 'n': return `<c r="${c.ref}"${s}><v>${c.v}</v></c>`;
          case 's': return `<c r="${c.ref}"${s} t="s"><v>${sst.idx(String(c.v))}</v></c>`;
          case 'f': return `<c r="${c.ref}"${s}><f>${escXml(c.v)}</f>${c.cache !== undefined ? `<v>${c.cache}</v>` : ''}</c>`;
          case 'fa': return `<c r="${c.ref}"${s}${c.cm ? ' cm="1"' : ''}><f t="array" ref="${(c as any).arrRef ?? c.ref}">${escXml(c.v)}</f>${c.cache !== undefined ? `<v>${c.cache}</v>` : ''}</c>`;
        }
      }).join('');
      const ht = row.ht ? ` ht="${row.ht}" customHeight="1"` : '';
      return `<row r="${r}"${ht}>${cells}</row>`;
    }).join('');
  }
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac" mc:Ignorable="x14ac"';

function x14Validations(): string {
  return `<extLst><ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:dataValidations xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main" count="2"><x14:dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"><x14:formula1><xm:f>Data!$J:$J</xm:f></x14:formula1><xm:sqref>B1:B1048576</xm:sqref></x14:dataValidation><x14:dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"><x14:formula1><xm:f>Data!$K:$K</xm:f></x14:formula1><xm:sqref>C1:C1048576</xm:sqref></x14:dataValidation></x14:dataValidations></ext></extLst>`;
}

function sheetXml(o: {
  tab: string; dim: string; selected?: boolean; cols: Array<[number, number, number]>; rows: Rows; sst: Sst;
  merges?: string[]; afterData?: string; pageSetup?: string; drawing?: boolean; ext?: string; freeze?: boolean; rtl?: boolean; hdrRows?: number;
}): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet ${NS}><sheetPr><tabColor rgb="${o.tab}"/></sheetPr><dimension ref="${o.dim}"/><sheetViews><sheetView${o.rtl === false ? '' : ' rightToLeft="1"'}${o.selected ? ' tabSelected="1"' : ''} workbookViewId="0">${o.freeze === false ? '' : `<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/>`}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="14.4" x14ac:dyDescent="0.3"/><cols>${o.cols.map(([a, b, w]) => `<col min="${a}" max="${b}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${o.rows.xml(o.sst)}</sheetData>${o.afterData ?? ''}${o.merges?.length ? `<mergeCells count="${o.merges.length}">${o.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}${o.pageSetup ?? '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'}${o.drawing ? '<drawing r:id="rId1"/>' : ''}${o.ext ?? ''}</worksheet>`;
}

const MONTH_TABS = ['FF66C7EE', 'FFF4B183', 'FFFFFF00', 'FFD99AD3', 'FF66FFFF', 'FF6E7F94', 'FFB5521A', 'FFD99AD3', 'FF66FFFF', 'FF747474', 'FFB5521A', 'FF780F6B'];

const CHAIN_COLS = ['B', 'C', 'D', 'G'];

function mainFormulas(r: number) {
  const chainE = (() => {
    let f = '""';
    for (let i = 11; i >= 0; i--) {
      const m = MONTH_NAMES[i];
      f = `IFERROR(INDEX(${m}!$E:$E,_xlfn.AGGREGATE(15,6,ROW(${m}!$E$3:$E$200)/((${m}!$E$3:$E$200<>"")*(COUNTIF($E$2:$E${r - 1},${m}!$E$3:$E$200)=0)),1)),${f})`;
    }
    return f;
  })();
  const pull = (col: string, fallback: string) => {
    let f = fallback;
    for (let i = 11; i >= 0; i--) {
      const m = MONTH_NAMES[i];
      f = `IFERROR(INDEX(${m}!$${col}:$${col},MATCH($E${r},${m}!$E:$E,0)),${f})`;
    }
    return `IF($E${r}="","",${f})`;
  };
  const sumLookup = (col: string) => `SUM(${MONTH_NAMES.map((m) => `_xlfn.XLOOKUP(E${r},${m}!$E:$E,${m}!$${col}:$${col},0)`).join(',')})`;
  const J = `IF(OR(K${r}="",I${r}=""),"",_xlfn.LET(_xlpm.m,INT(K${r}),_xlpm.n,VALUE(I${r}),_xlpm.p,IF(_xlpm.m<=3,25%,IF(_xlpm.m<=6,50%,IF(_xlpm.m<=9,75%,100%))),IF(_xlpm.n<240*_xlpm.p,"ضعيف",IF(_xlpm.n<280*_xlpm.p,"مقبول",IF(_xlpm.n<330*_xlpm.p,"جيد",IF(_xlpm.n<430*_xlpm.p,"جيد جداً","ممتاز"))))))`;
  return { E: chainE, B: pull('B', '""'), C: pull('C', '""'), D: pull('D', '""'), G: pull('G', '""'), F: pull('F', '0'), H: sumLookup('H'), I: sumLookup('Q'), J, K: `(TODAY()-F${r})/30` };
}

export async function buildFixtureWorkbook(seed: Seed): Promise<Uint8Array> {
  const zip = new JSZip();
  const sst = new Sst();
  const sheetsOrder = [REMOVED_SHEETS[0], REMOVED_SHEETS[1], SHEET.main, ...MONTH_NAMES, SHEET.data];
  const files: Record<string, string> = {};

  // ---------- Leave ----------
  {
    const rows = new Rows();
    rows.put({ ref: 'A1', s: S.title, kind: 's', v: 'سجل الاجازات والاذونات عام 2026 - يدوي' }, 30);
    ['B', 'C', 'D', 'E', 'F'].forEach((c) => rows.put({ ref: `${c}1`, s: S.title, kind: 'e' }));
    ['اسم الموظف', 'النوع', 'تاريخ البداية', 'تاريخ النهاية', 'عدد الأيام', 'اجمالي اجازات الموظف'].forEach((h, i) => rows.put({ ref: `${numToCol(i + 1)}2`, s: S.head, kind: 's', v: h }, 30));
    for (let r = 3; r <= 150; r++) {
      for (const c of ['A', 'B', 'E', 'F']) rows.put({ ref: `${c}${r}`, s: S.text, kind: 'e' });
      for (const c of ['C', 'D']) rows.put({ ref: `${c}${r}`, s: S.date14, kind: 'e' });
    }
    seed.leave.forEach((l, i) => {
      const r = 3 + i;
      rows.put({ ref: `A${r}`, s: S.text, kind: 's', v: l.name });
      rows.put({ ref: `B${r}`, s: S.text, kind: 's', v: l.type });
      for (const [c, k] of [['C', 'start'], ['D', 'end']] as const) {
        if (l[`${k}_kind`] === 'date') rows.put({ ref: `${c}${r}`, s: S.date14, kind: 'n', v: isoToSerial(l[k]) });
        else rows.put({ ref: `${c}${r}`, s: S.text, kind: 's', v: l[k] });
      }
      if (typeof l.days === 'number') rows.put({ ref: `E${r}`, s: S.text, kind: 'n', v: l.days });
      else if (l.days !== null && l.days !== undefined) rows.put({ ref: `E${r}`, s: S.text, kind: 's', v: l.days });
    });
    // manual totals block: the brief lists 13 cells (F3:F15); the 7th total (5) is stated in section 2.5
    const flat = [...seed.leave_manual_totals_F3_F15];
    if (flat.length === 13) flat.push(5);
    flat.forEach((v, i) => rows.put({ ref: `F${3 + i}`, s: S.text, kind: typeof v === 'number' ? 'n' : 's', v }));
    files['xl/worksheets/sheet1.xml'] = sheetXml({
      tab: 'FFC00000', dim: 'A1:F150', sst, rows, merges: ['A1:F1'],
      cols: [[1, 1, 22.55], [2, 2, 13.55], [3, 3, 15.33], [4, 4, 15.78], [5, 5, 13.66], [6, 6, 17]],
      afterData: '<autoFilter ref="A2:F66"/>',
      ext: undefined,
      pageSetup: '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait"/>',
    }).replace('</mergeCells>', '</mergeCells><dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="B3:B150"><formula1>"اجازه اعتيادي,اجازه مرضي,اجازه بخصم,اذن ساعه,اذن ساعتين,مامورية"</formula1></dataValidation></dataValidations>');
  }

  // ---------- Visits ----------
  {
    const rows = new Rows();
    rows.put({ ref: 'B5', s: S.title, kind: 's', v: 'لوحة متابعة الأداء - محافظة بني سويف والفيوم 2026' }, 28);
    for (let c = 3; c <= 17; c++) rows.put({ ref: `${numToCol(c)}5`, s: S.title, kind: 'e' });
    rows.put({ ref: 'B6', s: S.vname, kind: 's', v: 'المدير المباشر: فادي عادل' });
    rows.put({ ref: 'B7', s: S.vname, kind: 's', v: 'ملخص زيارات الموظفين' });
    rows.put({ ref: 'C8', s: S.head, kind: 's', v: 'اسم الموظف' }, 30);
    rows.put({ ref: 'D8', s: S.head, kind: 's', v: 'المنطقة' });
    MONTH_NAMES.forEach((m, i) => rows.put({ ref: `${numToCol(5 + i)}8`, s: S.head, kind: 's', v: m }));
    rows.put({ ref: 'Q8', s: S.head, kind: 's', v: 'إجمالي الزيارات' });
    seed.visits.forEach((v, i) => {
      const r = 9 + i;
      rows.put({ ref: `B${r}`, s: S.num, kind: 'n', v: v.no });
      rows.put({ ref: `C${r}`, s: S.vname, kind: 's', v: v.name });
      rows.put({ ref: `D${r}`, s: S.text, kind: 's', v: v.area });
      v.months.forEach((x: Raw, j: number) => {
        const ref = `${numToCol(5 + j)}${r}`;
        if (x === null) rows.put({ ref, s: S.num, kind: 'e' });
        else if (typeof x === 'number') rows.put({ ref, s: S.num, kind: 'n', v: x });
        else rows.put({ ref, s: S.num, kind: 's', v: x });
      });
      rows.put({ ref: `Q${r}`, s: S.total, kind: 'f', v: `SUM(E${r}:P${r})`, cache: v.total });
    });
    const last = 8 + seed.visits.length;
    rows.put({ ref: 'K17', s: S.vname, kind: 's', v: 'اجمالي الزيارات عن العام' });
    for (const c of ['L', 'M', 'N', 'O', 'P']) rows.put({ ref: `${c}17`, s: S.vname, kind: 'e' });
    rows.put({ ref: 'Q17', s: S.total, kind: 'f', v: `SUM(Q9:Q${last})`, cache: seed.visits.reduce((a, v) => a + v.total, 0) });
    files['xl/worksheets/sheet2.xml'] = sheetXml({
      tab: 'FF3A5A82', dim: 'B1:R17', sst, rows, freeze: false, drawing: true,
      merges: ['B5:Q5', 'B6:Q6', 'B7:Q7', 'K17:P17'],
      cols: [[1, 1, 9.11], [2, 2, 3], [3, 3, 21.78], [4, 4, 9.11], [5, 11, 5.78], [12, 12, 6.33], [13, 16, 5.78], [17, 17, 11.55], [18, 18, 11], [19, 19, 35.89]],
      pageSetup: '<printOptions horizontalCentered="1" verticalCentered="1"/><pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.3" footer="0.3"/><pageSetup paperSize="9" scale="80" orientation="landscape"/>',
    });
    files['xl/worksheets/_rels/sheet2.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
    files['xl/drawings/drawing1.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>10</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:srcRect t="30278" b="27889"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
    files['xl/drawings/_rels/drawing1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`;
  }

  // ---------- Main ----------
  {
    const rows = new Rows();
    rows.put({ ref: 'A1', s: S.band, kind: 's', v: 'البيانات الوظيفية' }, 25.2);
    for (const c of ['B', 'C', 'D', 'E', 'F', 'G']) rows.put({ ref: `${c}1`, s: S.band, kind: 'e' });
    rows.put({ ref: 'H1', s: S.band, kind: 's', v: ' تقييم الاداء السنوي' });
    for (const c of ['I', 'J', 'K']) rows.put({ ref: `${c}1`, s: S.band, kind: 'e' });
    const H = ['الرقم', 'القطاع', 'المحافظة', 'اسم الموظف ', 'الكود', 'تاريخ الالتحاق', 'الوظيفة', 'عدد الزيارات السنوي', 'اجمالي تقييم الاداء الشهري بالنقاط خلال السنة', ' درجة التقيم', 'عدد اشهرالالتحاق', 'ملاحظات'];
    H.forEach((h, i) => rows.put({ ref: `${numToCol(i + 1)}2`, s: S.head, kind: 's', v: h }, 47.4));
    rows.put({ ref: 'P2', s: S.yellow, kind: 's', v: 'درجات التقييم السنوي' });
    rows.put({ ref: 'Q2', s: S.yellow, kind: 'e' });
    [['> 430', 'ممتاز'], ['330 : 429', 'جيدجدا'], ['280 : 329', 'جيد'], ['240 : 279', 'مقبول']].forEach(([a, b], i) => {
      rows.put({ ref: `P${3 + i}`, s: S.text, kind: 's', v: a });
      rows.put({ ref: `Q${3 + i}`, s: S.text, kind: 's', v: b });
    });
    for (let r = 3; r <= 102; r++) {
      const f = mainFormulas(r);
      if (r === 3) rows.put({ ref: 'A3', s: S.num, kind: 'fa', v: 'SEQUENCE(100)', cm: true, cache: 1, ...({ arrRef: 'A3:A102' } as object) } as Cell);
      else rows.put({ ref: `A${r}`, s: S.num, kind: 'n', v: r - 2 });
      rows.put({ ref: `E${r}`, s: S.num, kind: 'fa', v: f.E });
      for (const c of CHAIN_COLS) rows.put({ ref: `${c}${r}`, s: S.text, kind: 'f', v: (f as any)[c] });
      rows.put({ ref: `F${r}`, s: S.dateDM, kind: 'f', v: f.F });
      rows.put({ ref: `G${r}`, s: S.text, kind: 'f', v: f.G });
      rows.put({ ref: `H${r}`, s: S.num, kind: 'f', v: f.H });
      rows.put({ ref: `I${r}`, s: S.num, kind: 'f', v: f.I });
      rows.put({ ref: `J${r}`, s: S.num, kind: 'f', v: f.J });
      rows.put({ ref: `K${r}`, s: S.num, kind: 'f', v: f.K });
      rows.put({ ref: `L${r}`, s: S.notes, kind: 'e' });
    }
    const cf = (id: number, pri: number, txt: string) => `<cfRule type="cellIs" dxfId="${id}" priority="${pri}" operator="equal"><formula>"${txt}"</formula></cfRule>`;
    files['xl/worksheets/sheet3.xml'] = sheetXml({
      tab: 'FF5BA566', dim: 'A1:Q102', sst, rows, selected: true, merges: ['H1:K1', 'P2:Q2'],
      cols: [[1, 1, 6.44], [2, 2, 16.11], [3, 3, 15.66], [4, 4, 30.22], [5, 5, 10.78], [6, 6, 13.78], [7, 7, 14.66], [8, 8, 15.66], [9, 9, 15.11], [10, 10, 14.55], [11, 11, 14.66], [12, 12, 29.22], [16, 16, 12], [17, 17, 13.2]],
      afterData: '<sheetProtection selectLockedCells="1" selectUnlockedCells="1"/>',
      pageSetup: '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" r:id="rId1"/>',
      ext: x14Validations(),
    }).replace('<pageMargins', `<conditionalFormatting sqref="J1:J1048576">${cf(0, 1, 'ممتاز')}${cf(1, 2, 'جيد جدا')}${cf(2, 3, 'جيد')}${cf(3, 4, 'مقبول')}${cf(4, 5, 'ضعيف')}</conditionalFormatting><pageMargins`);
    files['xl/worksheets/_rels/sheet3.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" Target="../printerSettings/printerSettings2.bin"/></Relationships>`;
  }

  // ---------- Months ----------
  MONTH_NAMES.forEach((mn, mi) => {
    const rows = new Rows();
    rows.put({ ref: 'A1', s: S.band, kind: 's', v: 'البيانات الوظيفية' }, 27.6);
    for (const c of ['B', 'C', 'D', 'E', 'F', 'G']) rows.put({ ref: `${c}1`, s: S.band, kind: 'e' });
    rows.put({ ref: 'H1', s: S.band, kind: 's', v: 'عدد الزيارات ' });
    rows.put({ ref: 'I1', s: S.band, kind: 's', v: 'تقييم الاداء الشهري من 1 : 5  ( التقييم 5 اكثر اداء فعال للموظف - التقييم 1 اقل اداء للموظف )' });
    for (const c of ['J', 'K', 'L', 'M', 'N', 'O', 'P']) rows.put({ ref: `${c}1`, s: S.band, kind: 'e' });
    const H = ['الرقم', 'القطاع', 'المحافظة', 'اسم الموظف ', 'الكود', 'تاريخ الالتحاق', 'الوظيفة', mn,
      ' دقة الفحص والمتابعة واتمام الزيارة من جميع الاركان', 'دقة وجودة التقاريرالمرسلة وسرعة الرد بالتقييم', 'متابعة الفروع والمحاضر اليومية ',
      'الالتزام بإتمام الزيارات او الفحص العشوائي و سرعة الرد بالتقيم في الوقت المحدد', 'الالتزام بالسياسات والإجراءات التشغيلية والقرارات الادارية',
      'الالتزام بمواعيد الحضور والانصراف', 'التطويرالذاتي و تنمية المهارات', 'التعاون والعمل بروح الفريق', 'الاجمالي', 'ملاحظات'];
    H.forEach((h, i) => rows.put({ ref: `${numToCol(i + 1)}2`, s: i === 16 ? S.yellow : S.head, kind: 's', v: h }, 73.8));
    const lastRow = mi === 0 ? 198 : 52;
    for (let r = 3; r <= lastRow; r++) {
      if (r <= 52) {
        if (r === 3) rows.put({ ref: 'A3', s: S.num, kind: 'fa', v: 'SEQUENCE(50)', cm: true, cache: 1, ...({ arrRef: 'A3:A52' } as object) } as Cell);
        else rows.put({ ref: `A${r}`, s: S.num, kind: 'n', v: r - 2 });
        for (const c of ['B', 'C', 'D', 'E', 'G']) rows.put({ ref: `${c}${r}`, s: S.text, kind: 'e' });
        rows.put({ ref: `F${r}`, s: S.date14, kind: 'e' });
        for (let k = 8; k <= 16; k++) rows.put({ ref: `${numToCol(k)}${r}`, s: S.num, kind: 'e' });
        rows.put({ ref: `R${r}`, s: S.notes, kind: 'e' });
      }
      rows.put({ ref: `Q${r}`, s: S.total, kind: 'f', v: `SUM(H${r}:P${r})` });
    }
    (seed.months[mn] ?? []).forEach((rec: any) => {
      const r = rec.row;
      const put = (c: string, v: Raw, s: number) => {
        if (v === null || v === undefined || v === '') return;
        rows.put({ ref: `${c}${r}`, s, kind: typeof v === 'number' ? 'n' : 's', v });
      };
      put('B', rec.sector, S.text); put('C', rec.gov, S.text); put('D', rec.name, S.text); put('E', rec.code, S.text);
      put('F', rec.join ? isoToSerial(rec.join) : null, S.date14); put('G', rec.job, S.text);
      put('H', rec.visits, S.num);
      rec.scores.forEach((s: Raw, i: number) => put(numToCol(9 + i), s, S.num));
      put('R', rec.notes, S.notes);
    });
    const n = mi + 4;
    files[`xl/worksheets/sheet${n}.xml`] = sheetXml({
      tab: MONTH_TABS[mi], dim: `A1:R${lastRow}`, sst, rows, merges: ['I1:P1'],
      cols: [[1, 1, 8.89], [2, 2, 13], [3, 3, 13.66], [4, 4, 17.55], [5, 5, 8.89], [6, 6, 11.11], [7, 7, 9.89], [8, 8, 14.11], [9, 9, 16.66], [10, 10, 12.78], [11, 11, 10.44], [12, 12, 18.44], [13, 13, 15.66], [14, 14, 12.55], [15, 15, 11.11], [16, 17, 8.89], [18, 18, 100.78]],
      ext: x14Validations(),
    });
  });

  // ---------- Data ----------
  {
    const rows = new Rows();
    rows.put({ ref: 'J1', kind: 's', v: 'القطاع' });
    rows.put({ ref: 'K1', kind: 's', v: 'المحافظة' });
    seed.Data.sectors.forEach((s, i) => rows.put({ ref: `J${i + 2}`, kind: 's', v: s }));
    seed.Data.governorates.forEach((s, i) => rows.put({ ref: `K${i + 2}`, kind: 's', v: s }));
    files['xl/worksheets/sheet16.xml'] = sheetXml({ tab: 'FF00FF00', dim: 'J1:K19', sst, rows, freeze: false, cols: [[10, 11, 22]] });
  }

  // ---------- package parts ----------
  const sheetsXml = sheetsOrder.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}"${n === SHEET.data ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('');
  const q = (n: string) => `'${n}'`;
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook ${NS}><workbookPr defaultThemeVersion="164011"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="23040" windowHeight="9360" activeTab="2"/></bookViews><sheets>${sheetsXml}</sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${q(REMOVED_SHEETS[0])}!$A$2:$F$66</definedName><definedName name="_xlnm.Print_Area" localSheetId="1">${q(REMOVED_SHEETS[1])}!#REF!</definedName><definedName name="_xlnm.Print_Titles" localSheetId="1">${q(REMOVED_SHEETS[1])}!#REF!</definedName></definedNames><calcPr calcId="191029"/></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetsOrder.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId101" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId102" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId103" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/><Relationship Id="rId104" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>`;
  files['xl/metadata.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray"><metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes><futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata><cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>`;
  files['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy;;"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font><font><sz val="10"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="12"/><color rgb="FF1B3A6B"/><name val="Arial"/><family val="2"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1B3A6B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E75B6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F7E9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="5">${['FF66B26F', 'FFC4E3C8', 'FFFFC000', 'FFFFFF00', 'FFFF0000'].map((c) => `<dxf><fill><patternFill><bgColor rgb="${c}"/></patternFill></fill></dxf>`).join('')}</dxfs></styleSheet>`;
  files['xl/sharedStrings.xml'] = '__SST__';
  files['customXml/item1.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<fixture xmlns="urn:field-risk-fixture">synthetic</fixture>`;
  files['docProps/core.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>fixture</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created></cp:coreProperties>`;
  files['docProps/app.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetsOrder.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

  files['xl/sharedStrings.xml'] = sst.xml();
  for (const [p, c] of Object.entries(files)) zip.file(p, c);
  zip.file('xl/media/image1.png', PNG_1x1, { base64: true });
  zip.file('xl/printerSettings/printerSettings2.bin', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
