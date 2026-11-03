/**
 * Persistence tests (fake-indexeddb stands in for the browser's IndexedDB,
 * which is exactly the store both apps use in production):
 *  - management app: a saved record survives a simulated browser reopen
 *    (close + reopen the same IndexedDB database), the localStorage mirror is
 *    written, and the mirror migrates records back if IndexedDB comes back empty.
 *  - evaluation app: the model round-trips through IndexedDB, a localStorage
 *    mirror is written on save, and IndexedDB always wins over the mirror
 *    (existing records are never overwritten by migration).
 */
import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { clearStore, closeDatabase, useDatabase } from '../src/apps/management/db/database';
import { listEmployees, saveEmployee } from '../src/apps/management/db/repo';
import { ENTITIES, migrateFromLocalMirror, readLocalMirror, writeLocalMirror } from '../src/apps/management/db/backup';
import { addMonthRecord, emptyModel } from '../src/apps/evaluation/domain/model';
import { loadPersisted, saveModel } from '../src/apps/evaluation/db/db';

const MIRROR_KEY_EVAL = 'field-risk-evaluation:mirror:v1';

test('management: records persist across a simulated browser reopen + mirror migration', async () => {
  await useDatabase('persist-test-mgmt');
  const saved = await saveEmployee({
    employeeNo: 1,
    name: 'أحمد اختبار',
    code: 'E1',
    sector: 'قطاع القاهرة',
    governorate: 'القاهرة',
    jobTitle: 'ضابط مخاطر',
    employmentDate: '2024-01-01',
  });

  // simulate closing the tab/browser and reopening: close the handle, open the same DB again
  await closeDatabase();
  await useDatabase('persist-test-mgmt');
  const rows = await listEmployees(true);
  expect(rows.some((r) => r.id === saved.id && r.name === 'أحمد اختبار')).toBe(true);

  // mirror is written and readable
  await writeLocalMirror();
  expect(readLocalMirror()?.data.employees.some((r) => r.id === saved.id)).toBe(true);

  // simulate IndexedDB coming back empty → safe migration restores from the mirror, nothing else is touched
  for (const entity of ENTITIES) await clearStore(entity);
  expect((await listEmployees(true)).length).toBe(0);
  expect(await migrateFromLocalMirror()).toBe(true);
  expect((await listEmployees(true)).some((r) => r.id === saved.id)).toBe(true);

  // with records present in IndexedDB, migration must NOT run (no overwrite)
  expect(await migrateFromLocalMirror()).toBe(false);

  await closeDatabase();
}, 30000);

test('evaluation: model persists in IndexedDB + mirror; IndexedDB has priority over the mirror', async () => {
  const record = {
    month: 1,
    sector: 'قطاع',
    gov: 'محافظة',
    name: 'موظف اختبار',
    code: 123,
    join: null,
    job: 'وظيفة',
    visits: 2,
    scores: [5, 5, 5, 5, 5, 5, 5, 5] as (number | null)[],
    notes: 'ملاحظة',
  };
  const model = addMonthRecord(emptyModel(), record);
  await saveModel(model);

  // simulated reopen: load again from the same persistent store
  const loaded = await loadPersisted();
  expect(loaded.model?.months.length).toBe(1);
  expect(loaded.model?.months[0].name).toBe('موظف اختبار');
  expect(loaded.lastSaved).toBeTruthy();

  // write-through mirror exists in localStorage
  expect(localStorage.getItem(MIRROR_KEY_EVAL)).toBeTruthy();

  // a conflicting mirror entry must never override existing IndexedDB records
  const other = addMonthRecord(emptyModel(), { ...record, name: 'اسم آخر' });
  localStorage.setItem(MIRROR_KEY_EVAL, JSON.stringify({ model: other, lastSaved: 1 }));
  const after = await loadPersisted();
  expect(after.model?.months[0].name).toBe('موظف اختبار');
}, 30000);
