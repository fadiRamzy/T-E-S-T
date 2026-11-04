/**
 * Merge smoke test — renders the unified app (portal + both original apps)
 * in jsdom with fake-indexeddb and verifies:
 *  1. the portal renders at #/
 *  2. the management app (fadiRamzy/test) renders, loads its local data,
 *     and its internal navigation works (#/mgmt/employees → #/mgmt/reports)
 *  3. the evaluation app (fadiRamzy/T-E-S-T) renders and forces its files page when empty
 *  4. legacy hashes from both original projects still route to the right app
 * Run with: npx vitest run
 */
import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const setHash = (hash: string) => {
  window.location.hash = hash;
};

const mgmtShell = () => document.querySelector('.scope-mgmt .app-shell');
const evalShell = () => document.querySelector('.shell.scope-eval');

test('unified app: portal, management app, evaluation app, legacy routes', async () => {
  setHash('');
  const { container } = render(<App />);

  // 1. Portal — title + exactly two buttons (no other links, no descriptions)
  expect(await screen.findByText('منظومة إدارة المخاطر الموحدة')).toBeTruthy();
  expect(document.querySelector('.portal')).toBeTruthy();
  const portalLinks = container.querySelectorAll('.portal a');
  expect(portalLinks.length).toBe(2);
  const buttons = container.querySelectorAll('.portal-btn');
  expect(buttons.length).toBe(2);
  expect(buttons[0].textContent).toBe('نظام المتابعة');
  expect(buttons[1].textContent).toBe('نظام التقييمات');
  expect(buttons[0].getAttribute('href')).toBe('#/mgmt/employees');
  expect(buttons[1].getAttribute('href')).toBe('#/eval/dashboard');
  expect(container.querySelector('.portal ul, .portal p')).toBeNull();

  // 2. Management app
  setHash('#/mgmt/employees');
  await waitFor(() => expect(mgmtShell()).toBeTruthy(), { timeout: 10000 });
  expect(document.querySelector('.sidebar__nav')).toBeTruthy();
  // the data provider finishes loading from IndexedDB and the page replaces the loading line
  await waitFor(
    () => expect(container.textContent).not.toContain('جارٍ فتح البيانات المحلية…'),
    { timeout: 10000 },
  );
  expect(container.textContent).toContain('توقيت الزيارات');
  expect(container.textContent).toContain('الموظفون');

  // management internal navigation → reports page
  setHash('#/mgmt/reports');
  await waitFor(
    () => expect(screen.queryAllByText('تنزيل آخر نسخة').length).toBeGreaterThan(0),
    { timeout: 10000 },
  );

  // 3. Evaluation app
  setHash('#/eval/dashboard');
  await waitFor(() => expect(evalShell()).toBeTruthy(), { timeout: 10000 });
  expect(document.querySelector('.sidebar .navbar')).toBeTruthy();
  // with no imported data the evaluation app stays on its files page
  await waitFor(
    () => expect(window.location.hash).toBe('#/eval/files'),
    { timeout: 10000 },
  );
  expect(container.textContent).toContain('الملفات');

  // 4. Legacy hashes from the original projects
  setHash('#/employees');
  await waitFor(() => expect(mgmtShell()).toBeTruthy(), { timeout: 10000 });

  setHash('#files');
  await waitFor(() => expect(evalShell()).toBeTruthy(), { timeout: 10000 });

  cleanup();
}, 60000);
