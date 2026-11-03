/**
 * Tests for the two UI modifications:
 *  1. Dynamic website-switching button (replaces the old «البوابة الموحدة»):
 *     - in the follow-up site it shows «تقييمات الموظفين» → #/eval/dashboard
 *     - in the evaluations site it shows «موقع المتابعة» → #/mgmt/employees
 *  2. «الملاحظات والمتابعة» page is notes-only; the notes list is HIDDEN by
 *     default and toggles via «إظهار الملاحظات»/«إخفاء الملاحظات» without
 *     touching saved records.
 */
import 'fake-indexeddb/auto';
import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const setHash = (hash: string) => {
  window.location.hash = hash;
};

afterEach(() => cleanup());

test('dynamic website-switching button labels and navigation in both directions', async () => {
  setHash('#/mgmt/employees');
  render(<App />);

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
  await waitFor(() => expect(document.querySelector('.shell.scope-eval')).toBeTruthy(), { timeout: 10000 });
  // the eval app auto-redirects to its files page when empty — wait for it to settle
  await waitFor(() => expect(window.location.hash).toBe('#/eval/files'), { timeout: 10000 });

  // inside the Employee Evaluations site → button offers the follow-up site
  const toMgmt = (await screen.findByText('موقع المتابعة')).closest('a');
  expect(toMgmt).toBeTruthy();
  expect(toMgmt!.className).toContain('site-switch');
  expect(toMgmt!.getAttribute('href')).toBe('#/mgmt/employees');

  // click → back to the Risk Follow-up System
  fireEvent.click(toMgmt!);
  await waitFor(() => expect(window.location.hash).toBe('#/mgmt/employees'), { timeout: 10000 });
  await waitFor(() => expect(document.querySelector('.scope-mgmt .app-shell')).toBeTruthy(), { timeout: 10000 });
  await screen.findByText('تقييمات الموظفين');
}, 60000);

test('«الملاحظات والمتابعة» page is notes-only; notes HIDDEN by default, toggle works without touching data', async () => {
  setHash('#/mgmt/notes');
  render(<App />);

  // wait until the local data provider is ready and the page rendered
  await waitFor(
    () => expect(document.querySelector('.employee-note-toggle button')).toBeTruthy(),
    { timeout: 10000 },
  );

  const toggle = document.querySelector('.employee-note-toggle button') as HTMLButtonElement;
  const list = document.getElementById('employee-notes-list') as HTMLElement;
  expect(list).toBeTruthy();

  // page content contains ONLY employee notes — no follow-up/observations section anymore
  // (the sidebar nav entry «سجل المتابعة» is expected — it leads to the dedicated page)
  const pageText = document.querySelector('.scope-mgmt .page')?.textContent ?? '';
  expect(pageText).toContain('ملاحظات الموظفين');
  expect(pageText).not.toContain('سجل المتابعة');
  expect(pageText).not.toContain('الملاحظات المسجلة');
  expect(document.querySelector('.unified-records-stack')).toBeNull();

  // employee picker + note form stay visible; the notes LIST is hidden by default
  expect(document.querySelector('.employee-note-form')).toBeTruthy();
  expect(list.hidden).toBe(true);
  expect(toggle.textContent).toContain('إظهار الملاحظات');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');

  // show
  fireEvent.click(toggle);
  await waitFor(() => expect(list.hidden).toBe(false));
  expect(toggle.textContent).toContain('إخفاء الملاحظات');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');

  // hide again — records are never deleted by hiding
  fireEvent.click(toggle);
  await waitFor(() => expect(list.hidden).toBe(true));
  expect(toggle.textContent).toContain('إظهار الملاحظات');
}, 60000);
