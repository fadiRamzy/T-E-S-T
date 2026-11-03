/**
 * Tests for the two UI modifications:
 *  1. Dynamic website-switching button (replaces the old «البوابة الموحدة»):
 *     - in the follow-up site it shows «تقييمات Employees» → #/eval/dashboard
 *     - in the evaluations site it shows «موقع المتابعة» → #/mgmt/employees
 *  2. Collapsible notes list in «الملاحظات والمتابعة» (visible by default,
 *     toggle switches between «إخفاء الملاحظات» / «إظهار الملاحظات»).
 */
import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const setHash = (hash: string) => {
  window.location.hash = hash;
};

test('dynamic website-switching button labels and navigation in both directions', async () => {
  setHash('#/mgmt/employees');
  const { container } = render(<App />);

  // the old «البوابة الموحدة» label is gone completely
  expect(document.body.textContent ?? '').not.toContain('البوابة الموحدة');

  // inside the Risk Follow-up System (management) → button offers the evaluations site
  await waitFor(() => expect(document.querySelector('.scope-mgmt .app-shell')).toBeTruthy(), { timeout: 10000 });
  const toEval = (await screen.findByText('تقييمات الموظفين')).closest('a');
  expect(toEval).toBeTruthy();
  expect(toEval!.className).toContain('site-switch');
  expect(toEval!.getAttribute('href')).toBe('#/eval/dashboard');

  // click → Employee Evaluations website
  fireEvent.click(toEval!);
  await waitFor(() => expect(window.location.hash).toBe('#/eval/dashboard'), { timeout: 10000 });
  await waitFor(() => expect(document.querySelector('.shell.scope-eval')).toBeTruthy(), { timeout: 10000 });

  // inside the Employee Evaluations site → button offers the follow-up site
  const toMgmt = (await screen.findByText('موقع المتابعة')).closest('a');
  expect(toMgmt).toBeTruthy();
  expect(toMgmt!.className).toContain('site-switch');
  expect(toMgmt!.getAttribute('href')).toBe('#/mgmt/employees');

  // click → back to the Risk Follow-up System
  fireEvent.click(toMgmt!);
  await waitFor(() => expect(window.location.hash).toBe('#/mgmt/employees'), { timeout: 10000 });
  await screen.findByText('تقييمات الموظفين');

  expect(container.querySelector('.portal')).toBeNull(); // never back at the portal landing
  cleanup();
}, 60000);

test('collapsible notes list in «الملاحظات والمتابعة» — visible by default, toggles without touching data', async () => {
  setHash('#/mgmt/notes');
  render(<App />);

  await waitFor(() => expect(document.querySelector('.scope-mgmt .app-shell')).toBeTruthy(), { timeout: 10000 });
  // wait until the local data provider is ready and the page rendered
  await waitFor(
    () => expect(document.querySelector('.employee-note-toggle button')).toBeTruthy(),
    { timeout: 10000 },
  );

  const toggle = document.querySelector('.employee-note-toggle button') as HTMLButtonElement;
  const list = document.getElementById('employee-notes-list') as HTMLElement;
  expect(list).toBeTruthy();

  // visible by default, label offers hiding
  expect(toggle.textContent).toContain('إخفاء الملاحظات');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(list.hidden).toBe(false);

  // hide
  fireEvent.click(toggle);
  expect(toggle.textContent).toContain('إظهار الملاحظات');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(list.hidden).toBe(true);

  // show again
  fireEvent.click(toggle);
  expect(toggle.textContent).toContain('إخفاء الملاحظات');
  expect(list.hidden).toBe(false);

  // section header + form remain accessible while hidden
  fireEvent.click(toggle);
  expect(document.querySelector('.employee-note-form')).toBeTruthy();
  expect(document.body.textContent ?? '').toContain('ملاحظات الموظفين');

  cleanup();
}, 60000);
