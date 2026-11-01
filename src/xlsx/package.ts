import JSZip from 'jszip';
import { decodeXml, parseAttrs } from './xml';
import { readSharedStrings, type SharedStrings } from './sheetxml';

export interface SheetRef {
  name: string;
  sheetId: string;
  rid: string;
  state: string;
  path: string; // zip path
}

export class XlsxPackage {
  sheets: SheetRef[] = [];
  sst: SharedStrings = [];
  date1904 = false;
  constructor(public zip: JSZip) {}

  static async open(bytes: Uint8Array | ArrayBuffer): Promise<XlsxPackage> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(bytes);
    } catch {
      throw new Error('الملف تالف أو ليس بصيغة xlsx صالحة (تعذّر فتح الأرشيف).');
    }
    const pkg = new XlsxPackage(zip);
    const wbXml = await pkg.text('xl/workbook.xml');
    if (!wbXml) throw new Error('الملف لا يحتوي على xl/workbook.xml — ليس مصنف Excel صالحاً.');
    const relsXml = (await pkg.text('xl/_rels/workbook.xml.rels')) ?? '';
    const rels = new Map<string, string>();
    for (const m of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const a = new Map(parseAttrs(m[1]));
      const id = a.get('Id');
      let target = a.get('Target');
      if (!id || !target) continue;
      target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      rels.set(id, target);
    }
    for (const m of wbXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
      const a = new Map(parseAttrs(m[1]));
      const rid = a.get('r:id') ?? '';
      pkg.sheets.push({
        name: decodeXml(a.get('name') ?? ''),
        sheetId: a.get('sheetId') ?? '',
        rid,
        state: a.get('state') ?? 'visible',
        path: rels.get(rid) ?? '',
      });
    }
    pkg.date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(wbXml);
    pkg.sst = readSharedStrings(await pkg.text('xl/sharedStrings.xml'));
    return pkg;
  }

  async text(path: string): Promise<string | null> {
    const f = this.zip.file(path);
    return f ? f.async('string') : null;
  }

  sheet(name: string): SheetRef | undefined {
    return this.sheets.find((s) => s.name === name);
  }

  async sheetText(name: string): Promise<string> {
    const s = this.sheet(name);
    if (!s) throw new Error(`الشيت «${name}» غير موجود`);
    const t = await this.text(s.path);
    if (t === null) throw new Error(`تعذّر قراءة الشيت «${name}»`);
    return t;
  }
}
