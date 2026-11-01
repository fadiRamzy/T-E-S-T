import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

async function loadDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /تجربة بمصنف تجريبي/ }).click();
  await expect(page.locator('table.grid tbody tr').first()).toBeVisible();
}
async function goto(page: Page, name: RegExp) {
  if ((page.viewportSize()?.width ?? 1280) < 860) await page.getByLabel('القائمة').click();
  await page.getByRole('button', { name }).click();
}

test('demo import → annual table, filters, drawer', async ({ page }) => {
  await loadDemo(page);
  await page.locator('input[type=date]').first(); // exists
  await expect(page.locator('table.grid tbody tr')).toHaveCount(7);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByPlaceholder('بحث بالاسم أو الكود…').fill('1007801');
  await expect(page.locator('table.grid tbody tr')).toHaveCount(1);
  await page.locator('table.grid tbody tr').first().click();
  await expect(page.getByRole('dialog')).toContainText('حجازي عبدالرحمن محمد');
  await page.keyboard.press('Escape');
});

test('upload xlsx, edit score, persistence after reload, export', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file][accept=".xlsx"]').setInputFiles('tests/fixtures/synthetic-template.xlsx');
  await expect(page.locator('table.grid tbody tr').first()).toBeVisible();
  await goto(page, /التقييم الشهري/);
  await page.getByRole('tab', { name: /^مارس/ }).click();
  const cell = page.locator('table.grid tbody tr').first().locator('input.cellin').nth(1);
  const old = Number(await cell.inputValue());
  const nv = old === 5 ? '4' : '5';
  await cell.fill(nv);
  await cell.press('Enter');
  await page.waitForTimeout(600);
  await page.reload();
  await goto(page, /التقييم الشهري/);
  await page.getByRole('tab', { name: /^مارس/ }).click();
  await expect(page.locator('table.grid tbody tr').first().locator('input.cellin').nth(1)).toHaveValue(nv);
  await goto(page, /استيراد \/ تصدير/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /تصدير Excel/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/_updated_\d{8}\.xlsx$/);
  const zip = await JSZip.loadAsync(readFileSync(await dl.path()!));
  expect(Object.keys(zip.files)).toContain('xl/metadata.xml');
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  expect(wb).toContain('fullCalcOnLoad="1"');
});

test('add employee to month, duplicate code blocked, delete with undo', async ({ page }) => {
  await loadDemo(page);
  await goto(page, /التقييم الشهري/);
  await page.getByRole('tab', { name: /^ديسمبر/ }).click();
  await page.getByRole('button', { name: /إضافة موظف لشهر/ }).click();
  await page.getByRole('button', { name: 'موظف جديد' }).click();
  await page.locator('.modal input[inputmode=numeric]').first().fill('1001877');
  await expect(page.locator('.modal')).toContainText('موجود بالفعل');
  await page.locator('.modal input[inputmode=numeric]').first().fill('1009999');
  await page.locator('.modal .field:has(label:text-is("اسم الموظف")) input').fill('موظف اختبار');
  await page.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(page.locator('table.grid tbody tr')).toHaveCount(7);
  await page.locator('table.grid tbody tr').last().getByRole('button', { name: 'حذف' }).click();
  await page.getByRole('button', { name: 'حذف', exact: true }).last().click();
  await expect(page.locator('table.grid tbody tr')).toHaveCount(6);
});

for (const w of [375, 768, 1280]) {
  test(`RTL layout smoke @${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await loadDemo(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `test-results/annual-${w}.png` });
  });
}
