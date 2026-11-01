import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

const FIXTURE = 'tests/fixtures/synthetic-template.xlsx';
const REMOVED = ['الزيارات الميدانية', 'الاجازات والاذونات'];
const navTo = (page: Page, name: RegExp) => page.locator('.navbar').getByRole('button', { name }).click();
type Buf = { name: string; mimeType: string; buffer: Buffer };

// ───────── helpers: branch files derived from the fixture (read/written with SheetJS — test inputs only) ─────────
type Aoa = unknown[][];
const fixtureWb = () => XLSX.read(readFileSync(FIXTURE));
const monthNames = (wb: XLSX.WorkBook) => wb.SheetNames.filter((n) => !n.startsWith('الاجازات') && !n.startsWith('الزيارات'));
function makeFile(name: string, edit: (sheet: string, aoa: Aoa) => Aoa | null): Buf {
  const wb = fixtureWb();
  const out = XLSX.utils.book_new();
  for (const n of monthNames(wb)) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: null, raw: true });
    const e = edit(n, aoa);
    if (e) XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(e as never), n);
  }
  return { name, mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write(out, { bookType: 'xlsx', type: 'buffer' })) };
}
const MONTHS = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
const CODES_A = [1001877, 1007355, 1007801, 1006567];
/** keep only the given employee codes in the monthly sheets (rows 1–2 are title + header) */
const onlyCodes = (codes: number[]) => (n: string, aoa: Aoa): Aoa | null =>
  MONTHS.includes(n) ? aoa.filter((r, i) => i < 2 || codes.includes(r[4] as number)) : null;
const newEmp = (code: number, name: string, visits: number | null, score: number | null) =>
  [null, 'الصعيد', 'محافظه - المنيا .', name, code, 46000, 'مسئول', visits, ...Array(8).fill(score), null, null];

async function importFiles(page: Page, ...files: Array<Buf | string>) {
  const payload = files.map((f): Buf => (typeof f === 'string' ? { name: f.split('/').pop()!, mimeType: 'application/octet-stream', buffer: readFileSync(f) } : f));
  await page.getByTestId('xlsx-input').setInputFiles(payload);
  await expect(page.getByTestId('import-report')).toBeVisible();
}
const closeReport = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'إغلاق' }).click();
async function importFixture(page: Page) {
  await page.goto('/');
  await importFiles(page, FIXTURE);
  await closeReport(page);
  await navTo(page, /لوحة المؤشرات/);
  await expect(page.getByRole('heading', { name: 'لوحة المؤشرات' })).toBeVisible();
}
const rows = (page: Page) => page.locator('[data-testid=employees-table] tbody tr');
const rowOf = (page: Page, code: number) => rows(page).filter({ hasText: String(code) });

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-btn').click()]);
  return { dl, buf: readFileSync(await dl.path()!) };
}
/** sheet name → xml text of a package */
async function sheetXml(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])![1], /Target="([^"]+)"/.exec(m[0])![1]]));
  const names: string[] = [];
  const xml: Record<string, string> = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = (/name="([^"]+)"/.exec(m[0])![1]).replace(/&amp;/g, '&');
    const rid = /r:id="([^"]+)"/.exec(m[0])![1];
    names.push(name);
    xml[name] = await zip.file(`xl/${target.get(rid)!.replace(/^\/?(xl\/)?/, '')}`)!.async('string');
  }
  return { zip, wb, names, xml };
}
const pick = (xml: string, tag: string) => (new RegExp(`<${tag}\\b[\\s\\S]*?(?:</${tag}>|/>)`).exec(xml)?.[0] ?? '');

// ───────── Files page ─────────
test('Files page: exactly two buttons, nothing else; export disabled until data exists', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveTitle('تقييم مسئولي المخاطر');
  const btns = page.locator('main button');
  await expect(btns).toHaveText(['اختيار ملف', 'تنزيل ملف محدث']);
  await expect(page.getByTestId('export-btn')).toBeDisabled();
  await expect(page.locator('main p, main h1, main h2, main h3, main .note, main .card')).toHaveCount(0);
  expect((await page.locator('main').innerText()).replace(/\s+/g, ' ').trim()).toBe('اختيار ملف تنزيل ملف محدث');
  await expect(page.getByTestId('xlsx-input')).toHaveAttribute('multiple', '');
  // after an import the page is still just the two buttons
  await importFiles(page, FIXTURE);
  await closeReport(page);
  await expect(btns).toHaveText(['اختيار ملف', 'تنزيل ملف محدث']);
  await expect(page.getByTestId('export-btn')).toBeEnabled();
  expect((await page.locator('main').innerText()).replace(/\s+/g, ' ').trim()).toBe('اختيار ملف تنزيل ملف محدث');
});

// ───────── Dashboard / Employees / Monthly ─────────
test('dashboard: two cards, grade key without rules text, top employees sorted high→low', async ({ page }) => {
  await importFixture(page);
  await expect(page.locator('.kpi')).toHaveCount(2);
  await expect(page.locator('.kpi small')).toHaveText(['إجمالي الزيارات السنوي', 'عدد الموظفين']);
  await expect(page.locator('.kpi b').nth(1)).toHaveText('7');
  await expect(page.locator('.kpi b').first()).toHaveText('202');
  const text = await page.locator('main').innerText();
  for (const gone of ['توزيع الدرجات', 'الأقل نقاطاً', 'إجمالي النقاط', 'جودة البيانات', 'مدة الخدمة', '25', 'الحدود', 'ملخص', 'عرض كل الموظفين']) expect(text, gone).not.toContain(gone);
  await expect(page.locator('main h2')).toHaveText(['الأعلى نقاطاً', 'مفتاح الدرجات']);
  await expect(page.locator('.legend .chip')).toHaveText(['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف']);
  const pts = (await page.locator('.rank .pt').allInnerTexts()).map(Number);
  expect(pts.length).toBe(7);
  expect(pts).toEqual([...pts].sort((a, b) => b - a));
  expect(pts[0]).toBe(371);
  await expect(page.locator('.banner.warn')).toContainText('1001523'); // approved correction stays visible
});

test('removed sections and explanatory text are gone from every page', async ({ page }) => {
  await importFixture(page);
  await expect(page.locator('.navbar .nav')).toHaveText(['لوحة المؤشرات', 'الموظفون', 'التقييم الشهري', 'الملفات']);
  const banned = ['الزيارات الميدانية', 'الاجازات والاذونات', 'القوائم', 'المفتاح الأساسي', 'مدة الخدمة', 'الصفوف المتاحة', 'يُحسب 0', 'التقييمات المقبولة', 'الزيارات + 8', 'تاريخ احتساب'];
  for (const n of [/لوحة المؤشرات/, /الموظفون/, /التقييم الشهري/, /الملفات/]) {
    await navTo(page, n);
    const all = await page.locator('body').innerText();
    for (const b of banned) expect(all, b).not.toContain(b);
    await expect(page.locator('main .pagehead p, main > p, main .note')).toHaveCount(0);
  }
  // generic identity: no regional branding in the app chrome (governorate values in the data are still shown)
  await expect(page.locator('.sidebar .brand')).toHaveText('تقييم مسئولي المخاطر');
  await expect(page.locator('.sidebar')).not.toContainText(/بني سويف|الفيوم/);
  await navTo(page, /التقييم الشهري/);
  await expect(page.locator('main')).not.toContainText('44 من 50');
});

test('employees: search, add (duplicate blocked), edit, delete with undo', async ({ page }) => {
  await importFixture(page);
  await navTo(page, /الموظفون/);
  await expect(rows(page)).toHaveCount(7);
  await expect(page.locator('.pager')).toContainText('عرض 1–7 من 7');
  await page.getByPlaceholder(/بحث/).fill('1007801');
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().click();
  await expect(page.getByRole('dialog')).toContainText('حجازي عبدالرحمن محمد');
  await page.keyboard.press('Escape');
  await page.getByPlaceholder(/بحث/).fill('');

  await page.getByRole('button', { name: /إضافة موظف/ }).click();
  const m = page.locator('.modal');
  await m.getByLabel('الكود', { exact: true }).fill('1001877');
  await m.getByLabel('اسم الموظف').fill('مكرر');
  await expect(m).toContainText('مسجل بالفعل');
  await expect(m.getByRole('button', { name: 'إضافة الموظف' })).toBeDisabled();
  await m.getByLabel('الكود', { exact: true }).fill('1009999');
  await m.getByLabel('اسم الموظف').fill('موظف اختبار');
  await m.getByLabel('المحافظة').fill('محافظه - الأقصر');
  await m.getByRole('button', { name: 'إضافة الموظف' }).click();
  await expect(rows(page)).toHaveCount(8);
  await expect(rowOf(page, 1009999)).toContainText('الأقصر');

  await page.getByRole('button', { name: 'تعديل موظف اختبار' }).click();
  await page.locator('.modal').getByLabel('الوظيفة').fill('مسئول مخاطر جديد');
  await page.locator('.modal').getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(rows(page).filter({ hasText: 'موظف اختبار' })).toContainText('مسئول مخاطر جديد');

  await page.getByRole('button', { name: 'حذف موظف اختبار' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'حذف الموظف' }).click();
  await expect(rows(page)).toHaveCount(7);
  await page.getByRole('button', { name: 'تراجع', exact: true }).first().click();
  await expect(rows(page)).toHaveCount(8);
});

// ───────── Multi-file import / consolidation ─────────
test('several files in one selection combine into one dataset (first import on an empty app)', async ({ page }) => {
  await page.goto('/');
  const a = makeFile('branch-a.xlsx', onlyCodes(CODES_A));
  const b = makeFile('branch-b.xlsx', onlyCodes([1002185, 1003603, 1001523]));
  await importFiles(page, a, b);
  const rep = page.getByTestId('import-report');
  await expect(rep).toContainText('تم استيراد 2 ملفات');
  await expect(rep).toContainText('إجمالي الموظفين الآن 7');
  await closeReport(page);
  await navTo(page, /الموظفون/);
  await expect(rows(page)).toHaveCount(7);
  // identical totals to the original single workbook (332 / 36 etc.)
  await expect(rowOf(page, 1001877)).toContainText('332');
  await expect(rowOf(page, 1001877)).toContainText('36');
  await expect(rowOf(page, 1006567)).toContainText('371');
  await expect(rowOf(page, 1001523)).toContainText('77');
});

test('later imports accumulate; overlaps never erase or duplicate; invalid files are reported but do not block the valid ones', async ({ page }) => {
  await importFixture(page);
  await navTo(page, /الملفات/);

  // branch B: a new employee (Dec) + an overlapping March row of 1001877 with EMPTY cells; branch C: another new one (Nov)
  const overlap = (n: string, aoa: Aoa) => {
    if (n === 'ديسمبر') return [...aoa.filter((r, i) => i < 2), newEmp(1008881, 'موظف الفرع ب', 4, 4)];
    if (n === 'مارس') return [...aoa.filter((r, i) => i < 2), [null, null, null, null, 1001877, null, null, null, ...Array(8).fill(null), null, null]];
    return MONTHS.includes(n) ? aoa.filter((r, i) => i < 2) : null;
  };
  const fileB = makeFile('branch-b.xlsx', overlap);
  const fileC = makeFile('branch-c.xlsx', (n, aoa) => (n === 'نوفمبر' ? [...aoa.filter((r, i) => i < 2), newEmp(1008882, 'موظف الفرع ج', 2, 5)] : MONTHS.includes(n) ? aoa.filter((r, i) => i < 2) : null));
  const bad = { name: 'other.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write((() => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]), 'Sheet1'); return w; })(), { bookType: 'xlsx', type: 'buffer' })) };

  await importFiles(page, fileB, fileC, bad);
  const rep = page.getByTestId('import-report');
  await expect(rep).toContainText('تم استيراد 2 ملفات');
  await expect(rep).toContainText('إجمالي الموظفين الآن 9');
  await expect(rep).toContainText('لم يُستورد: other.xlsx');
  await expect(rep).toContainText('أي شيت شهري');
  await closeReport(page);

  await navTo(page, /الموظفون/);
  await expect(rows(page)).toHaveCount(9);
  await expect(rowOf(page, 1001877)).toContainText('332'); // empty overlap cells did not erase anything
  await expect(rowOf(page, 1008881)).toContainText('موظف الفرع ب');

  // importing the original workbook again changes nothing and creates no duplicates
  await navTo(page, /الملفات/);
  await importFiles(page, FIXTURE);
  await expect(page.getByTestId('import-report')).toContainText('إجمالي الموظفين الآن 9');
  await closeReport(page);
  await navTo(page, /الموظفون/);
  await expect(rows(page)).toHaveCount(9);
  await expect(rowOf(page, 1001877)).toContainText('332');

  // undo of the last import is a no-op for the data (nothing changed) — the previous accumulation is intact
  await navTo(page, /التقييم الشهري/);
  await page.getByRole('tab', { name: /^ديسمبر/ }).click();
  await expect(page.locator('table.grid tbody tr').filter({ hasText: '1008881' })).toHaveCount(1);
});

test('wrong file alone: specific message, nothing changes', async ({ page }) => {
  await page.goto('/');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]), 'Sheet1');
  await importFiles(page, { name: 'other.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })) });
  await expect(page.getByRole('dialog')).toContainText('لم يُستورد: other.xlsx');
  await expect(page.getByRole('dialog')).toContainText('أي شيت شهري');
  await closeReport(page);
  await expect(page.locator('.navbar .nav[disabled]')).toHaveCount(3);
  await expect(page.getByTestId('export-btn')).toBeDisabled();
});

// ───────── Export ─────────
test('consolidated download keeps the template structure/format and contains all accumulated data', async ({ page }) => {
  await importFixture(page);
  await navTo(page, /الملفات/);
  const fileB = makeFile('b.xlsx', (n, aoa) => (n === 'ديسمبر' ? [...aoa.filter((r, i) => i < 2), newEmp(1008881, 'موظف الفرع ب', 4, 4)] : MONTHS.includes(n) ? aoa.filter((r, i) => i < 2) : null));
  const fileC = makeFile('c.xlsx', (n, aoa) => (n === 'مارس' ? [...aoa.filter((r, i) => i < 2), newEmp(1008882, 'موظف الفرع ج', 2, 5)] : MONTHS.includes(n) ? aoa.filter((r, i) => i < 2) : null));
  await importFiles(page, fileB, fileC);
  await closeReport(page);

  const { dl, buf } = await download(page);
  expect(dl.suggestedFilename()).toMatch(/_updated_\d{8}\.xlsx$/);
  const out = await sheetXml(buf);
  const tpl = await sheetXml(readFileSync(FIXTURE));

  // same sheets, same order; removed sheets are gone
  expect(out.names).toEqual(tpl.names.filter((n) => !REMOVED.includes(n)));
  expect(out.names.length).toBe(14);
  for (const r of REMOVED) { expect(out.wb).not.toContain(r); expect(out.names).not.toContain(r); }
  expect(out.wb).toContain('fullCalcOnLoad="1"');

  // formatting: styles/theme byte-identical; per-sheet columns, views (RTL), merges, print setup unchanged
  for (const part of ['xl/styles.xml', 'xl/theme/theme1.xml']) {
    const a = tpl.zip.file(part), b = out.zip.file(part);
    if (a) expect(await b!.async('string'), part).toBe(await a.async('string'));
  }
  for (const n of out.names) {
    for (const tag of ['cols', 'sheetViews', 'sheetFormatPr', 'mergeCells', 'pageMargins', 'pageSetup', 'printOptions', 'headerFooter', 'conditionalFormatting']) {
      expect(pick(out.xml[n], tag), `${n} <${tag}>`).toBe(pick(tpl.xml[n], tag));
    }
  }
  expect(pick(out.xml['مارس'], 'sheetViews')).toContain('rightToLeft="1"');
  // formulas of the annual sheet are preserved
  const f = (x: string) => [...x.matchAll(/<f\b[^>]*>[\s\S]*?<\/f>/g)].length;
  expect(f(out.xml['التقييم السنوي 2026'])).toBe(f(tpl.xml['التقييم السنوي 2026']));

  // data: re-read with an independent parser — every accumulated employee is present once
  const wb = XLSX.read(buf);
  const col = (sheet: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: null }).map((r) => r[4]);
  expect(col('ديسمبر').filter((c) => c === 1008881)).toHaveLength(1);
  expect(col('مارس').filter((c) => c === 1008882)).toHaveLength(1);
  const all = MONTHS.flatMap((m) => col(m).filter((c): c is number => typeof c === 'number'));
  expect(new Set(all).size).toBe(9);
  for (const m of MONTHS) { const c = col(m).filter((x) => typeof x === 'number'); expect(new Set(c).size, m).toBe(c.length); }
});

test('edit score → persists after reload → export has only supported sheets', async ({ page }) => {
  await importFixture(page);
  await navTo(page, /التقييم الشهري/);
  await page.getByRole('tab', { name: /^مارس/ }).click();
  const cell = page.locator('table tbody tr').first().locator('input.cellin').nth(1);
  const old = Number(await cell.inputValue());
  const nv = old === 5 ? '4' : '5';
  await cell.fill(nv);
  await cell.press('Enter');
  await page.waitForTimeout(700);
  await page.reload();
  await navTo(page, /التقييم الشهري/);
  await page.getByRole('tab', { name: /^مارس/ }).click();
  await expect(page.locator('table tbody tr').first().locator('input.cellin').nth(1)).toHaveValue(nv);
  await navTo(page, /الملفات/);
  const { dl, buf } = await download(page);
  expect(dl.suggestedFilename()).toMatch(/_updated_\d{8}\.xlsx$/);
  const o = await sheetXml(buf);
  expect(o.names.length).toBe(14);
  for (const r of REMOVED) expect(o.wb).not.toContain(r);
});

// ───────── Layout ─────────
test('desktop: slim navigation sidebar on the RIGHT, RTL, no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await importFixture(page);
  const side = await page.locator('.sidebar').boundingBox();
  const vw = page.viewportSize()!.width;
  expect(side!.x + side!.width).toBeGreaterThan(vw - 2); // flush with the right edge
  expect(side!.width).toBeLessThan(260);
  expect(side!.height).toBeGreaterThan(780);
  await expect(page.locator('.sidebar .nav')).toHaveText(['لوحة المؤشرات', 'الموظفون', 'التقييم الشهري', 'الملفات']);
  const main = await page.locator('.container').boundingBox();
  expect(main!.x + main!.width).toBeLessThanOrEqual(side!.x + 1);
  await expect(page.locator('.sidebar .nav.active')).toHaveText('لوحة المؤشرات');
});

for (const w of [375, 768, 1280]) {
  test(`RTL layout @${w}: no horizontal overflow, screenshots`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 820 });
    await importFixture(page);
    for (const [n, shot] of [[/لوحة المؤشرات/, 'dashboard'], [/الموظفون/, 'employees'], [/التقييم الشهري/, 'monthly'], [/الملفات/, 'files']] as const) {
      await navTo(page, n);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), `${shot}@${w}`).toBe(false);
      await page.screenshot({ path: `test-results/${shot}-${w}.png` });
    }
    if (w <= 768) {
      // phones/tablets: bottom tab bar, touch-friendly targets
      const nav = await page.locator('.navbar').boundingBox();
      expect(nav!.y + nav!.height).toBeGreaterThan(800);
      for (const b of await page.locator('.navbar .nav').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    }
    await importFiles(page, FIXTURE);
    await page.screenshot({ path: `test-results/report-${w}.png` });
  });
}
