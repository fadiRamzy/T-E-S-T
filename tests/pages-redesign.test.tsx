/**
 * Tests for the page-level redesigns:
 *  - Visit timings: employee filter buttons in ONE horizontal row above the
 *    list/controls, each showing name + visit count; filtering still works.
 *  - Employee profile: all four activity indicators render together in the
 *    profile-stats row, and the profile keeps its data sections + actions.
 *  - Notes page: notes hidden by default (covered in site-switch-notes too).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import App from '../src/App';
import { ensureSettings, openDatabase } from '../src/apps/management/db/database';
import { saveEmployee, saveEmployeeNote, saveLeavePermission, saveVisitTiming } from '../src/apps/management/db/repo';



afterEach(() => cleanup());

const setHash = (hash: string) => {
  window.location.hash = hash;
};

let e1: { id: string; name: string };

beforeAll(async () => {
  localStorage.clear(); // start from a clean mirror so migration does not leak between tests
  await openDatabase();
  await ensureSettings();
  e1 = await saveEmployee({
    employeeNo: 1, name: 'أحمد محمد', code: 'E1', sector: 'قطاع القاهرة', governorate: 'القاهرة', jobTitle: 'ضابط مخاطر', employmentDate: '2024-01-01',
  }) as { id: string; name: string };
  const e2 = await saveEmployee({
    employeeNo: 2, name: 'سارة علي', code: 'E2', sector: 'قطاع الدلتا', governorate: 'الغربية', jobTitle: 'مسؤول مخاطر', employmentDate: '2024-02-01',
  });
  await saveVisitTiming({ employeeId: e1.id, visitDate: '2026-01-05', branch: 'فرع مدينة نصر', clientName: 'عميل 1', location: 'مدينة نصر', departureTime: '09:00', returnTime: '11:00', notes: '' });
  await saveVisitTiming({ employeeId: e1.id, visitDate: '2026-01-07', branch: 'فرع مدينة نصر', clientName: 'عميل 2', location: 'مدينة نصر', departureTime: '10:00', returnTime: '12:30', notes: '' });
  await saveVisitTiming({ employeeId: e2.id, visitDate: '2026-01-06', branch: 'فرع طنطا', clientName: 'عميل 3', location: 'طنطا', departureTime: '08:00', returnTime: '09:00', notes: '' });
  await saveEmployeeNote({ employeeId: e1.id, note: 'ملاحظة اختبار محفوظة' });
});

test('visit timings: employee filter buttons — one row, name+count, filtering works', async () => {
  setHash('#/mgmt/visit-times');
  render(<App />);

  await waitFor(() => expect(document.querySelector('.emp-filter-row')).toBeTruthy(), { timeout: 10000 });
  await waitFor(() => expect(document.querySelector('#visits-records tbody tr')).toBeTruthy(), { timeout: 10000 });

  const row = document.querySelector('.emp-filter-row') as HTMLElement;
  const buttons = Array.from(row.querySelectorAll('.emp-filter-btn'));
  // «كل الموظفين» + موظفان
  expect(buttons.length).toBe(3);
  // each button shows the employee name and his recorded visit count
  const allBtn = buttons[0];
  expect(allBtn.textContent).toContain('كل الموظفين');
  expect(allBtn.querySelector('.emp-count')?.textContent).toBe('3');
  const empBtn = buttons.find((b) => b.textContent?.includes('أحمد محمد'))!;
  expect(empBtn).toBeTruthy();
  expect(empBtn.querySelector('.emp-count')?.textContent).toBe('2');
  expect(buttons.find((b) => b.textContent?.includes('سارة علي'))?.querySelector('.emp-count')?.textContent).toBe('1');
  // «الكل» selected by default
  expect(allBtn.className).toContain('is-active');
  // all 3 visits listed
  expect(document.querySelectorAll('#visits-records tbody tr').length).toBe(3);

  // filter by employee → only his visits remain, button gets the active state
  fireEvent.click(empBtn);
  await waitFor(() => expect(document.querySelectorAll('#visits-records tbody tr').length).toBe(2), { timeout: 10000 });
  expect(empBtn.className).toContain('is-active');
  expect(allBtn.className).not.toContain('is-active');
  expect(document.body.textContent).toContain('أحمد محمد');

  // back to all
  fireEvent.click(allBtn);
  await waitFor(() => expect(document.querySelectorAll('#visits-records tbody tr').length).toBe(3), { timeout: 10000 });
  expect(e1.id).toBeTruthy();
}, 60000);

test('employee profile: four activity indicators in one stats row + all sections/actions intact', async () => {
  setHash(`#/mgmt/employees/${e1.id}`);
  render(<App />);

  await waitFor(() => expect(document.querySelector('.profile-hero')).toBeTruthy(), { timeout: 10000 });
  // identity header
  expect(document.querySelector('.profile-hero__avatar')?.textContent).toBe('أم');
  expect(document.querySelector('.profile-hero__name')?.textContent).toBe('أحمد محمد');
  expect(document.querySelectorAll('.profile-hero__actions .btn').length).toBe(3);

  // all four activity indicators in the single profile-stats row
  const stats = document.querySelector('.profile-stats') as HTMLElement;
  expect(stats).toBeTruthy();
  expect(stats.querySelectorAll('.stat').length).toBe(4);
  const labels = Array.from(stats.querySelectorAll('.stat__label')).map((el) => el.textContent);
  expect(labels).toEqual(['عدد المحاضر اليومية', 'عدد الزيارات', 'إجمالي مدة الزيارات', 'محاضر متأخرة']);
  // visit count reflects the 2 seeded visits
  expect(stats.textContent).toContain('2');

  // functionality preserved: notes manager, details, minutes, visits, permissions sections + PDF action
  expect(document.querySelector('.employee-note-form')).toBeTruthy();
  expect(document.querySelector('#profile-details')).toBeTruthy();
  expect(document.querySelector('#profile-minutes')).toBeTruthy();
  expect(document.querySelector('#profile-visits')).toBeTruthy();
  expect(document.querySelector('#profile-leave-permission-records')).toBeTruthy();
  expect(document.body.textContent).toContain('استخراج ملف الموظف PDF');
}, 60000);

test('notes page: saved note survives hide/show (hiding never deletes records)', async () => {
  setHash('#/mgmt/notes');
  render(<App />);

  await waitFor(() => expect(document.querySelector('.employee-note-toggle button')).toBeTruthy(), { timeout: 10000 });
  const toggle = document.querySelector('.employee-note-toggle button') as HTMLButtonElement;
  const list = document.getElementById('employee-notes-list') as HTMLElement;

  expect(list.hidden).toBe(true); // hidden by default
  fireEvent.click(toggle); // إظهار الملاحظات
  expect(list.hidden).toBe(false);
  expect(list.textContent).toContain('ملاحظة اختبار محفوظة');
  fireEvent.click(toggle); // إخفاء الملاحظات
  expect(list.hidden).toBe(true);
  fireEvent.click(toggle); // re-show — record still there
  expect(list.textContent).toContain('ملاحظة اختبار محفوظة');
  expect(e1.id).toBeTruthy();
}, 60000);

test('navigation has no separate follow-up register; employees page summary renders compactly', async () => {
  setHash('#/mgmt/employees');
  render(<App />);
  await waitFor(() => expect(document.querySelector('.employees-summary')).toBeTruthy(), { timeout: 10000 });
  // summary cards present (layout compaction is CSS; structure verified here)
  expect(document.querySelectorAll('.employees-summary .stat').length).toBe(3);
  expect(document.querySelector('.employees-summary')?.textContent).toContain('إجمالي الموظفين');
  // no «سجل المتابعة» nav item / route link anywhere
  expect(document.querySelector('a[href="#/mgmt/observations"]')).toBeNull();
  const navText = document.querySelector('.sidebar__nav')?.textContent ?? '';
  expect(navText).not.toContain('سجل المتابعة');
  expect(navText).toContain('الملاحظات والمتابعة');
}, 60000);

test('leave/permission monthly summary table: structure identical (11 columns), totals cell present, values readable', async () => {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await saveLeavePermission({ employeeId: e1.id, requestType: 'leave', category: 'إجازة اعتيادي', date: iso, durationHours: null, notes: '' });
  await saveLeavePermission({ employeeId: e1.id, requestType: 'permission', category: 'إذن انصرف', date: iso, durationHours: 2, notes: '' });

  setHash('#/mgmt/leave-permissions');
  render(<App />);
  await waitFor(() => expect(document.querySelector('.leave-summary-table')).toBeTruthy(), { timeout: 10000 });

  const table = document.querySelector('.leave-summary-table') as HTMLElement;
  // exact existing structure: header row + 11 columns, unchanged
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
  expect(headers).toEqual([
    'الموظف', 'اعتيادي', 'عارضة', 'بخصم', 'إجمالي الإجازات',
    'إذن انصراف', 'إذن حضور', 'إجمالي الأذونات', 'ساعات مستخدمة',
    'أذونات متبقية للشهر', 'ساعات متبقية للشهر',
  ]);
  const row = table.querySelector('tbody tr') as HTMLElement;
  expect(row).toBeTruthy();
  // totals cell keeps its dedicated class and shows the computed total (1 leave)
  const totalCell = row.querySelector('.leave-summary-total') as HTMLElement;
  expect(totalCell).toBeTruthy();
  expect(totalCell.textContent?.trim()).toBe('1');
  // permission hours cell shows 2 — value still present and readable
  const hoursCell = row.querySelector('.leave-summary-hours') as HTMLElement;
  expect(hoursCell.textContent?.trim()).toBe('2');
  // 11 body cells per row (name + 10 numbers)
  expect(row.querySelectorAll('th, td').length).toBe(11);
}, 60000);

test('leave summary uses the standard toolbar filter layout (matches attendance summary), no legacy filter panel', async () => {
  setHash('#/mgmt/leave-permissions');
  render(<App />);
  await waitFor(() => expect(document.querySelector('.leave-summary-table')).toBeTruthy(), { timeout: 10000 });
  // legacy filter panel wrapper is gone; the 3 filters sit in a plain Toolbar inside the summary card
  expect(document.querySelector('.leave-filter-panel')).toBeNull();
  const wrap = document.querySelector('.leave-summary-wrap') as HTMLElement;
  const card = wrap.closest('.card') as HTMLElement;
  expect(card).toBeTruthy();
  expect(card.querySelectorAll('.toolbar select').length).toBe(3);
  // table structure still intact
  expect(document.querySelectorAll('.leave-summary-table thead th').length).toBe(11);
}, 60000);
