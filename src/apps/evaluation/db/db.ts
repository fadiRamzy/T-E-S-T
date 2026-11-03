import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { migrateModel } from '../domain/model';
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

/* ---------------------------------------------------------------------------
 * Persistent storage = IndexedDB (primary, via Dexie) + a localStorage mirror.
 * The mirror is written through on every save and is used ONLY as a fallback
 * when IndexedDB cannot be read (e.g. blocked storage): it migrates any saved
 * records back into IndexedDB on next start. It never overrides existing
 * IndexedDB data, and it is removed together with clearAll().
 * ------------------------------------------------------------------------- */
const MIRROR_KEY = 'field-risk-evaluation:mirror:v1';

interface MirrorPayload { model: AppModel | null; lastSaved: number | null }

function mirrorWrite(model: AppModel | null, lastSaved: number | null): void {
  try {
    if (model) localStorage.setItem(MIRROR_KEY, JSON.stringify({ model, lastSaved } satisfies MirrorPayload));
  } catch {
    /* quota or private mode — IndexedDB remains the source of truth */
  }
}

function mirrorRead(): MirrorPayload {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (!raw) return { model: null, lastSaved: null };
    const parsed = JSON.parse(raw) as Partial<MirrorPayload>;
    return {
      model: parsed.model ? migrateModel(parsed.model as AppModel & Record<string, unknown>) : null,
      lastSaved: typeof parsed.lastSaved === 'number' ? parsed.lastSaved : null,
    };
  } catch {
    return { model: null, lastSaved: null };
  }
}

export function clearMirror(): void {
  try {
    localStorage.removeItem(MIRROR_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadPersisted(): Promise<{ model: AppModel | null; template: TemplateRecord | null; lastSaved: number | null }> {
  let idb: { model: AppModel | null; template: TemplateRecord | null; lastSaved: number | null } | null = null;
  try {
    const d = getDb();
    const [m, t, s] = await Promise.all([d.kv.get('model'), d.kv.get('template'), d.kv.get('lastSaved')]);
    idb = { model: m?.value ? migrateModel(m.value as AppModel & Record<string, unknown>) : null, template: (t?.value as TemplateRecord) ?? null, lastSaved: (s?.value as number) ?? null };
  } catch {
    idb = null; // IndexedDB unreadable → fall back to the localStorage mirror below
  }
  if (idb && idb.model) return idb;
  // Migration path: records exist only in the mirror (or IndexedDB is blocked/empty) → adopt them and heal IndexedDB.
  const mirror = mirrorRead();
  if (mirror.model) {
    if (!idb || !idb.model) {
      try {
        await saveModel(mirror.model);
      } catch {
        /* IndexedDB still blocked — keep serving from the mirror for this session */
      }
    }
    return { model: mirror.model, template: idb?.template ?? null, lastSaved: mirror.lastSaved ?? idb?.lastSaved ?? null };
  }
  return idb ?? { model: null, template: null, lastSaved: null };
}
export async function saveModel(model: AppModel): Promise<number> {
  const now = Date.now();
  await getDb().transaction('rw', getDb().kv, async () => {
    await getDb().kv.put({ key: 'model', value: model });
    await getDb().kv.put({ key: 'lastSaved', value: now });
  });
  mirrorWrite(model, now); // write-through mirror: survives even if the tab closes mid-save
  return now;
}
export async function saveTemplate(t: TemplateRecord): Promise<void> {
  await getDb().kv.put({ key: 'template', value: t });
}
export async function clearAll(): Promise<void> {
  await getDb().kv.clear();
  clearMirror();
}

// ---- JSON backup (validated) ----
const rawS = z.union([z.number(), z.string(), z.null()]);
const modelSchema = z.object({
  lists: z.object({ sectors: z.array(z.string()), governorates: z.array(z.string()) }),
  months: z.array(z.object({ month: z.number().int().min(1).max(12), row: z.number().int(), sector: z.string(), gov: z.string(), name: z.string(), code: rawS, join: rawS, job: z.string(), visits: rawS, scores: z.array(rawS).length(8), notes: z.string() })),
  mainNotes: z.record(z.string()),
  date1904: z.boolean(),
  grid: z.object({ firstRow: z.number().int(), lastRow: z.number().int() }).optional(),
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
  return migrateModel(r.data.model as unknown as AppModel & Record<string, unknown>);
}
