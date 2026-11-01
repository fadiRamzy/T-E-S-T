import { XlsxPackage, resolvePath } from './package';
import { decodeXml, parseAttrs } from './xml';

/**
 * Removes whole sheets from the package and cleans EVERYTHING that points at them
 * (workbook entry, rels, content types, definedNames, bookViews, calcChain, app.xml titles, orphaned drawings/media).
 * Other parts are left byte-identical.
 */
export async function removeSheets(pkg: XlsxPackage, names: string[]): Promise<{ removed: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const targets = pkg.sheets.filter((s) => names.includes(s.name));
  if (!targets.length) return { removed: [], warnings };
  const zip = pkg.zip;

  let wb = (await pkg.text(pkg.workbookPath))!;
  const removedIdx = new Set(targets.map((t) => pkg.sheets.indexOf(t)));
  const newIndex = new Map<number, number>();
  let k = 0;
  pkg.sheets.forEach((_, i) => { if (!removedIdx.has(i)) newIndex.set(i, k++); });
  if (!newIndex.size) throw new Error('لا يمكن حذف كل الشيتات من المصنف.');

  // <sheet> entries
  wb = wb.replace(/<((?:\w+:)?)sheet\b([^>]*?)\/>/g, (m, _p, attrs: string) => {
    const nm = decodeXml(new Map(parseAttrs(attrs)).get('name') ?? '');
    return names.includes(nm) ? '' : m;
  });

  // definedNames: drop the ones scoped to / pointing at removed sheets, renumber the other localSheetIds
  const refsRemoved = (text: string) => names.some((n) => { const d = decodeXml(text); return d.includes(`'${n}'!`) || d.includes(`${n}!`); });
  wb = wb.replace(/<definedName\b([^>]*?)>([\s\S]*?)<\/definedName>|<definedName\b([^>]*?)\/>/g, (m, a1: string | undefined, text: string | undefined, a2: string | undefined) => {
    const attrs = new Map(parseAttrs(a1 ?? a2 ?? ''));
    const ls = attrs.get('localSheetId');
    if (ls !== undefined) {
      const ni = newIndex.get(Number(ls));
      if (ni === undefined) return '';
      if (refsRemoved(text ?? '')) return '';
      return ni === Number(ls) ? m : m.replace(/localSheetId="\d+"/, `localSheetId="${ni}"`);
    }
    if (refsRemoved(text ?? '')) return '';
    return m;
  });
  wb = wb.replace(/<definedNames>\s*<\/definedNames>/, '');

  // bookViews: activeTab / firstSheet must stay valid
  wb = wb.replace(/<workbookView\b([^>]*?)\/?>/, (m) => {
    const fix = (attr: string, s: string) => s.replace(new RegExp(`${attr}="(\\d+)"`), (_x, v: string) => `${attr}="${newIndex.get(Number(v)) ?? 0}"`);
    return fix('firstSheet', fix('activeTab', m));
  });
  zip.file(pkg.workbookPath, wb);

  // workbook rels (+ collect the sheet parts to delete)
  const rels = (await pkg.text(pkg.workbookRelsPath)) ?? '';
  const dead = new Set<string>();
  const wbDir = pkg.workbookPath.includes('/') ? pkg.workbookPath.slice(0, pkg.workbookPath.lastIndexOf('/') + 1) : '';
  const rids = new Set(targets.map((t) => t.rid));
  let newRels = rels.replace(/<Relationship\b([^>]*?)\/>/g, (m, attrs: string) => {
    const a = new Map(parseAttrs(attrs));
    if (rids.has(a.get('Id') ?? '')) { const t = a.get('Target'); if (t) dead.add(resolvePath(wbDir, t)); return ''; }
    if ((a.get('Type') ?? '').endsWith('/calcChain')) { const t = a.get('Target'); if (t) dead.add(resolvePath(wbDir, t)); return ''; }
    return m;
  });
  zip.file(pkg.workbookRelsPath, newRels);
  for (const t of targets) if (t.path) dead.add(t.path);
  for (const p of Object.keys(zip.files)) if (/(^|\/)calcChain\.xml$/i.test(p)) dead.add(p);

  // delete the parts, then everything that became orphaned (drawings, media, printer settings, comments …)
  const relsOf = (p: string) => { const i = p.lastIndexOf('/'); return `${p.slice(0, i + 1)}_rels/${p.slice(i + 1)}.rels`; };
  const queue = [...dead];
  const deleted = new Set<string>();
  const referencedByOthers = async (part: string): Promise<boolean> => {
    for (const rp of Object.keys(zip.files)) {
      if (!rp.endsWith('.rels') || deleted.has(rp)) continue;
      const owner = rp.replace(/_rels\/([^/]+)\.rels$/, '$1');
      if (deleted.has(owner)) continue;
      const base = rp.replace(/_rels\/[^/]+$/, '');
      const x = (await zip.file(rp)?.async('string')) ?? '';
      for (const m of x.matchAll(/<Relationship\b([^>]*?)\/>/g)) {
        const a = new Map(parseAttrs(m[1]));
        if (a.get('TargetMode') === 'External') continue;
        const t = a.get('Target');
        if (t && resolvePath(base, t) === part) return true;
      }
    }
    return false;
  };
  while (queue.length) {
    const p = queue.shift()!;
    if (deleted.has(p) || !zip.file(p)) continue;
    deleted.add(p);
    const rp = relsOf(p);
    const rx = (await zip.file(rp)?.async('string')) ?? '';
    zip.remove(p);
    if (zip.file(rp)) { deleted.add(rp); zip.remove(rp); }
    const base = p.slice(0, p.lastIndexOf('/') + 1);
    for (const m of rx.matchAll(/<Relationship\b([^>]*?)\/>/g)) {
      const a = new Map(parseAttrs(m[1]));
      if (a.get('TargetMode') === 'External') continue;
      const t = a.get('Target');
      if (!t) continue;
      const tp = resolvePath(base, t);
      if (!(await referencedByOthers(tp))) queue.push(tp);
    }
  }

  // [Content_Types].xml
  const ctx = await pkg.text('[Content_Types].xml');
  if (ctx) {
    zip.file('[Content_Types].xml', ctx.replace(/<Override\b([^>]*?)\/>/g, (m, attrs: string) => {
      const pn = new Map(parseAttrs(attrs)).get('PartName');
      return pn && deleted.has(pn.replace(/^\//, '')) ? '' : m;
    }));
  }

  // docProps/app.xml: sheet titles list is optional metadata — drop it so it can never disagree with the workbook
  const app = await pkg.text('docProps/app.xml');
  if (app) zip.file('docProps/app.xml', app.replace(/<HeadingPairs>[\s\S]*?<\/HeadingPairs>/, '').replace(/<TitlesOfParts>[\s\S]*?<\/TitlesOfParts>/, ''));

  // make sure one visible sheet is selected
  const remaining = pkg.sheets.filter((_, i) => !removedIdx.has(i));
  const sel = await Promise.all(remaining.map(async (s) => /<sheetView\b[^>]*\btabSelected="(1|true)"/.test((await pkg.text(s.path)) ?? '')));
  if (!sel.some(Boolean)) {
    const first = remaining.find((s) => s.state === 'visible') ?? remaining[0];
    const x = await pkg.text(first.path);
    if (x && /<sheetView\b/.test(x)) zip.file(first.path, x.replace(/<sheetView\b/, '<sheetView tabSelected="1"'));
  }

  // anything left that still points at the removed sheets (never rewritten silently)
  for (const s of remaining) {
    const x = (await pkg.text(s.path)) ?? '';
    for (const f of x.matchAll(/<f\b[^>]*>([\s\S]*?)<\/f>/g)) {
      const t = decodeXml(f[1]);
      if (names.some((n) => t.includes(`${n}!`))) { warnings.push(`الشيت «${s.name}» يحتوي معادلة تشير إلى شيت محذوف — ستظهر #REF! في Excel.`); break; }
    }
  }
  await pruneSharedStrings(pkg, remaining.map((r) => r.path));
  pkg.sheets = remaining;
  void newRels;
  return { removed: targets.map((t) => t.name), warnings };
}

/**
 * After sheets are removed their text (titles, leave notes …) would still sit in sharedStrings.xml.
 * Unused entries are emptied IN PLACE (indices never change), so no remaining sheet has to be rewritten.
 */
async function pruneSharedStrings(pkg: XlsxPackage, sheetPaths: string[]): Promise<void> {
  const sstXml = await pkg.text('xl/sharedStrings.xml');
  if (!sstXml) return;
  const head = /^[\s\S]*?<sst\b[^>]*>/.exec(sstXml);
  const end = sstXml.lastIndexOf('</sst>');
  if (!head || end < 0) return;
  const used = new Set<number>();
  const CELL = /<c\b[^>]*?\bt="s"[^>]*?>[\s\S]*?<\/c>/g;
  for (const p of sheetPaths) {
    const x = await pkg.text(p);
    if (x === null) return; // unknown structure: leave everything as it is
    for (const c of x.match(CELL) ?? []) { const m = /<v>(\d+)<\/v>/.exec(c); if (m) used.add(Number(m[1])); }
  }
  let i = 0;
  let changed = false;
  const body = sstXml.slice(head[0].length, end).replace(/<si\b[^>]*?\/>|<si\b[\s\S]*?<\/si>/g, (si) => {
    const idx = i++;
    if (used.has(idx) || si === '<si><t></t></si>') return si;
    changed = true;
    return '<si><t></t></si>';
  });
  if (changed) pkg.zip.file('xl/sharedStrings.xml', head[0] + body + sstXml.slice(end));
}
