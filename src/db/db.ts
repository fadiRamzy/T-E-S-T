import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import type { AppModel } from '../domain/types';

export interface TemplateRecord {
  bytes: Uint8Array;
  name: string;
  hash: string;
  importedAt: number;
}
interface KV {
  key: string;
  value: unknown;
}

class FieldRiskDB extends Dexie {
  kv!: Table<KV, string>;
  constructor() {
    super('field-risk-evaluation');
    this.version(1).stores({ kv: 'key' });
  }
}
let db: FieldRiskDB | null = null;
const getDb = () => (db ??= new FieldRiskDB());

export async function loadPersisted(): Promise<{ model: AppModel | null; template: TemplateRecord | null; lastSaved: number | null }> {
  try {
    const d = getDb();
    const [m, t, s] = await Promise.all([d.kv.get('model'), d.kv.get('template'), d.kv.get('lastSaved')]);
    return { model: (m?.value as AppModel) ?? null, template: (t?.value as TemplateRecord) ?? null, lastSaved: (s?.value as number) ?? null };
  } catch {
    return { model: null, template: null, lastSaved: null };
  }
}
export async function saveModel(model: AppModel): Promise<number> {
  const now = Date.now();
  await getDb().transaction('rw', getDb().kv, async () => {
    await getDb().kv.put({ key: 'model', value: model });
    await getDb().kv.put({ key: 'lastSaved', value: now });
  });
  return now;
}
export async function saveTemplate(t: TemplateRecord): Promise<void> {
  await getDb().kv.put({ key: 'template', value: t });
}
export async function clearAll(): Promise<void> {
  await getDb().kv.clear();
}

// ---- JSON backup (validated) ----
const rawS = z.union([z.number(), z.string(), z.null()]);
const modelSchema = z.object({
  lists: z.object({ sectors: z.array(z.string()), governorates: z.array(z.string()) }),
  months: z.array(z.object({ month: z.number().int().min(1).max(12), row: z.number().int(), sector: z.string(), gov: z.string(), name: z.string(), code: rawS, join: rawS, job: z.string(), visits: rawS, scores: z.array(rawS).length(8), notes: z.string() })),
  mainNotes: z.record(z.string()),
  visits: z.array(z.object({ row: z.number().int(), no: rawS, name: z.string(), area: z.string(), months: z.array(rawS).length(12) })),
  leave: z.array(z.object({ row: z.number().int(), name: z.string(), type: z.string(), start: rawS, startKind: z.enum(['date', 'text', 'empty']), end: rawS, endKind: z.enum(['date', 'text', 'empty']), days: rawS })),
  leaveTotals: z.array(z.object({ name: z.string(), total: rawS })),
  date1904: z.boolean(),
  appliedCorrections: z.array(z.object({ id: z.string(), code: z.number(), field: z.literal('join'), from: rawS, to: rawS, reason: z.string() })),
});
export const backupSchema = z.object({ app: z.literal('field-risk-evaluation'), version: z.literal(1), exportedAt: z.string(), model: modelSchema });

export function makeBackup(model: AppModel): string {
  return JSON.stringify({ app: 'field-risk-evaluation', version: 1, exportedAt: new Date().toISOString(), model }, null, 1);
}
export function parseBackup(text: string): AppModel {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error('ملف النسخة الاحتياطية ليس JSON صالحاً.'); }
  const r = backupSchema.safeParse(json);
  if (!r.success) throw new Error('ملف النسخة الاحتياطية غير مطابق للبنية المتوقعة: ' + r.error.issues[0]?.path.join('.'));
  return r.data.model as AppModel;
}
