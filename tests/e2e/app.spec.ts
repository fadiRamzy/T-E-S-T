import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

const FIXTURE = 'tests/fixtures/synthetic-template.xlsx';
const navTo = (page: Page, name: RegExp) => page.locator('.navbar').getByRole('button', { name }).click();

async function importFixture(page: Page) {
  await page.goto('/');
  await page.getByTestId('xlsx-input').setInputFiles(FIXTURE);
  await expect(page.getByRole('dialog')).toContainText('معاينة الاستيراد');
  await page.getByTestId('confirm-import').click();
  await expect(page.getByRole('heading', { name: 'لوحة المؤشرات' })).toBeVisible();
}
const rows = (page: Page) => page.locator('[data-testid=employees-table] tbody tr');

test('import shows a preview first and changes nothing until confirmed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('xlsx-input').setInputFiles(FIXTURE);
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('معاينة الاستيراد');
  await expect(dlg.locator('.stat', { hasText: 'موظف في الملف' })).toContainText('7');
  await expect(dlg).toContainText('الاجازات والاذونات');
  await expect(dlg).toContainText('تُحذف من ملف Excel');
  // cancel → still empty
  await dlg.getByRole('button', { name: 'إلغاء' }).click();
  await expect(page.getByRole('heading', { name: 'الملفات' })).toBeVisible();
  await expect(page.locator('.navbar .nav[disabled]')).toHaveCount(3);
  // confirm → data present
  await page.getByTestId('xlsx-input').setInputFiles(FIXTURE);
  await page.getByTestId('confirm-import').click();
  await expect(page.locator('.kpi').first()).toContainText('7');
});

test('removed sections are gone from the whole UI', async ({ page }) => {
  await importFixture(page);
  await expect(page.locator('.navbar .nav')).toHaveText(['لوحة المؤشرات', 'الموظفون', 'التقييم الشهري', 'الملفات']);
  for (const n of [/لوحة المؤشرات/, /الموظفون/, /التقييم الشهري/, /الملفات/]) {
    await navTo(page, n);
    const text = await page.locator('main').innerText();
    expect(text).not.toContain('الزيارات الميدانية');
    expect(text).not.toContain('الاجازات والاذونات');
    expect(text).not.toContain('القوائم');
  }
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
  await m.getByRole('button', { name: 'إضافة الموظف' }).click();
  await expect(rows(page)).toHaveCount(8);

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

test('second import: merge preview + strategies never overwrite unexpectedly', async ({ page }) => {
  await importFixture(page);
  // build a variant file with another tool: one changed score, one new employee, no visits/leave sheets
  const wb = XLSX.read(readFileSync(FIXTURE));
  const out = XLSX.utils.book_new();
  for (const n of wb.SheetNames) {
    if (n.startsWith('الاجازات') || n.startsWith('الزيارات')) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: null, raw: true });
    if (n === 'مارس') aoa[2][8] = (aoa[2][8] === 5 ? 4 : 5);
    if (n === 'ديسمبر') aoa.push([null, 'الصعيد', 'محافظه - المنيا .', 'موظف من الملف', 1008888, 46000, 'مسئول', 3, 3, 3, 3, 3, 3, 3, 3, 3, 27, null]);
    XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(aoa as never), n);
  }
  const buf = Buffer.from(XLSX.write(out, { bookType: 'xlsx', type: 'buffer' }));
  await navTo(page, /الملفات/);
  await page.getByTestId('xlsx-input').setInputFiles({ name: 'variant.xlsx', mimeType: 'application/octet-stream', buffer: buf });
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('دمج وتحديث');
  await expect(dlg.locator('.stat', { hasText: 'سجلات ستُحدَّث' })).toContainText('1');
  await expect(dlg.locator('.stat', { hasText: 'سجلات جديدة' })).toContainText('1');
  // add-only → nothing updated
  await dlg.getByText('إضافة الجديد فقط').click();
  await expect(dlg.locator('.stat', { hasText: 'سجلات ستُحدَّث' })).toContainText('0');
  await dlg.getByText('دمج وتحديث (موصى به)').click();
  await dlg.getByTestId('confirm-import').click();
  await navTo(page, /الموظفون/);
  await expect(rows(page)).toHaveCount(8);
  // undo restores the previous state (including the template)
  await page.getByRole('button', { name: 'تراجع', exact: true }).first().click();
  await expect(rows(page)).toHaveCount(7);
});

test('wrong file gets a specific message and nothing changes', async ({ page }) => {
  await page.goto('/');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]), 'Sheet1');
  await page.getByTestId('xlsx-input').setInputFiles({ name: 'other.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })) });
  await expect(page.getByRole('dialog')).toContainText('لا يمكن استيراد هذا الملف');
  await expect(page.getByRole('dialog')).toContainText('أي شيت شهري');
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
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-btn').click()]);
  expect(dl.suggestedFilename()).toMatch(/_updated_\d{8}\.xlsx$/);
  const zip = await JSZip.loadAsync(readFileSync(await dl.path()!));
  const wbx = await zip.file('xl/workbook.xml')!.async('string');
  expect(wbx).toContain('fullCalcOnLoad="1"');
  expect(wbx).not.toContain('الزيارات الميدانية');
  expect(wbx).not.toContain('الاجازات والاذونات');
  expect((wbx.match(/<sheet /g) ?? []).length).toBe(14);
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
    await page.getByTestId('xlsx-input').setInputFiles(FIXTURE);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: `test-results/wizard-${w}.png` });
  });
}
