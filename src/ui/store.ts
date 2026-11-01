import { useSyncExternalStore } from 'react';
import { loadPersisted, saveModel, saveTemplate, type TemplateRecord } from '../db/db';
import { OpError, clone } from '../domain/model';
import type { AppModel } from '../domain/types';
import { todayISO } from '../domain/dates';

interface TplSnap { bytes: Uint8Array | null; meta: State['template'] }
interface Snapshot { label: string; model: AppModel; tpl?: TplSnap }
export interface State {
  ready: boolean;
  model: AppModel | null;
  template: Omit<TemplateRecord, 'bytes'> | null;
  asOf: string; // as-of date for TODAY() — defaults to today
  lastSaved: number | null;
  saving: boolean;
  changesSinceExport: number;
  past: Snapshot[];
  future: Snapshot[];
}

let templateBytes: Uint8Array | null = null;
export const getTemplateBytes = () => templateBytes;

let state: State = { ready: false, model: null, template: null, asOf: todayISO(), lastSaved: null, saving: false, changesSinceExport: 0, past: [], future: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<State>) => { state = { ...state, ...p }; emit(); };

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => sel(state));
}
export const getState = () => state;

// ---- toasts ----
export interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string; undo?: boolean }
let toasts: Toast[] = [];
const tl = new Set<() => void>();
let tid = 1;
export function toast(text: string, kind: Toast['kind'] = 'ok', undo = false) {
  const t = { id: tid++, kind, text, undo };
  toasts = [...toasts, t];
  tl.forEach((l) => l());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); tl.forEach((l) => l()); }, kind === 'err' ? 7000 : 4500);
}
export function useToasts(): Toast[] {
  return useSyncExternalStore((cb) => { tl.add(cb); return () => tl.delete(cb); }, () => toasts);
}

// ---- confirm dialog ----
export interface ConfirmReq { message: string; detail?: string; okLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
let confirmReq: ConfirmReq | null = null;
const cl = new Set<() => void>();
export function confirmDialog(message: string, opts: { detail?: string; okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => { confirmReq = { message, ...opts, resolve }; cl.forEach((l) => l()); });
}
export function closeConfirm(v: boolean) { confirmReq?.resolve(v); confirmReq = null; cl.forEach((l) => l()); }
export function useConfirm(): ConfirmReq | null {
  return useSyncExternalStore((cb) => { cl.add(cb); return () => cl.delete(cb); }, () => confirmReq);
}

// ---- persistence ----
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  set({ saving: true });
  saveTimer = setTimeout(async () => {
    try {
      if (state.model) set({ lastSaved: await saveModel(state.model), saving: false });
    } catch {
      set({ saving: false });
      toast('تعذّر الحفظ في المتصفح (IndexedDB). صدّر نسخة احتياطية.', 'err');
    }
  }, 250);
}

export async function init() {
  const p = await loadPersisted();
  if (p.template) templateBytes = p.template.bytes;
  set({
    ready: true,
    model: p.model,
    template: p.template ? { name: p.template.name, hash: p.template.hash, importedAt: p.template.importedAt } : null,
    lastSaved: p.lastSaved,
  });
  try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
}

/** Apply a pure model operation (with undo snapshot, max 20). Returns false when the op was rejected. */
export function commit(label: string, fn: (m: AppModel) => AppModel): boolean {
  if (!state.model) return false;
  try {
    const next = fn(state.model);
    if (next === state.model) return true;
    set({
      model: next,
      past: [...state.past, { label, model: state.model }].slice(-20),
      future: [],
      changesSinceExport: state.changesSinceExport + 1,
    });
    scheduleSave();
    return true;
  } catch (e) {
    toast(e instanceof OpError ? e.message : `خطأ: ${(e as Error).message}`, 'err');
    return false;
  }
}

const curTpl = (): TplSnap => ({ bytes: templateBytes, meta: state.template });
async function restoreTpl(t: TplSnap) {
  templateBytes = t.bytes;
  if (t.bytes && t.meta) await saveTemplate({ bytes: t.bytes, ...t.meta });
}

export function undo() {
  const last = state.past[state.past.length - 1];
  if (!last || !state.model) return;
  const redoTpl = last.tpl ? curTpl() : undefined;
  if (last.tpl) { void restoreTpl(last.tpl); }
  set({ model: last.model, template: last.tpl ? last.tpl.meta : state.template, past: state.past.slice(0, -1), future: [...state.future, { label: last.label, model: state.model, tpl: redoTpl }], changesSinceExport: state.changesSinceExport + 1 });
  scheduleSave();
  toast(`تم التراجع عن: ${last.label}`, 'info');
}
export function redo() {
  const nx = state.future[state.future.length - 1];
  if (!nx || !state.model) return;
  const undoTpl = nx.tpl ? curTpl() : undefined;
  if (nx.tpl) { void restoreTpl(nx.tpl); }
  set({ model: nx.model, template: nx.tpl ? nx.tpl.meta : state.template, future: state.future.slice(0, -1), past: [...state.past, { label: nx.label, model: state.model, tpl: undoTpl }] });
  scheduleSave();
}

/**
 * Apply an import (already previewed + confirmed by the user). The model AND the export template are switched together
 * and the whole step is undoable (when there was data before).
 */
export async function applyImport(model: AppModel, tpl: TemplateRecord, label: string) {
  const prev = state.model;
  const snap: Snapshot | null = prev ? { label, model: prev, tpl: curTpl() } : null;
  templateBytes = tpl.bytes;
  await saveTemplate(tpl);
  set({
    model: clone(model),
    template: { name: tpl.name, hash: tpl.hash, importedAt: tpl.importedAt },
    past: snap ? [...state.past, snap].slice(-20) : [],
    future: [],
    changesSinceExport: 0,
  });
  scheduleSave();
}
export function replaceModel(label: string, model: AppModel) {
  commit(label, () => model);
}
export function markExported() { set({ changesSinceExport: 0 }); }
export function setAsOf(asOf: string) { set({ asOf }); }
