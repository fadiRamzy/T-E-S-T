import { useEffect, useState, type ReactNode } from 'react';
import { GRADE_COLORS } from '../domain/constants';
import type { Raw } from '../domain/types';
import { Icon } from './icons';
import { closeConfirm, undo, useConfirm, useStore, useToasts } from './store';

export function GradeChip({ grade }: { grade: string }) {
  const c = GRADE_COLORS[grade] ?? { bg: '#eee', fg: '#000' };
  return <span className="chip" style={{ background: c.bg, color: c.fg }}>{grade}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="overlay" style={{ background: 'rgba(15,25,50,.25)', zIndex: 39 }} onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">{children}</aside>
    </>
  );
}

export function ConfirmHost() {
  const req = useConfirm();
  if (!req) return null;
  return (
    <Modal title="تأكيد" onClose={() => closeConfirm(false)}>
      <p style={{ margin: 0, fontWeight: 600 }}>{req.message}</p>
      {req.detail && <p className="note">{req.detail}</p>}
      <div className="actions">
        <button className={`btn ${req.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => closeConfirm(true)}>{req.okLabel ?? 'تأكيد'}</button>
        <button className="btn" onClick={() => closeConfirm(false)}>إلغاء</button>
      </div>
    </Modal>
  );
}

export function ToastHost() {
  const ts = useToasts();
  const canUndo = useStore((s) => s.past.length > 0);
  return (
    <div className="toasts" aria-live="polite">
      {ts.map((t) => (
        <div key={t.id} className={`toastx ${t.kind}`}>
          <span>{t.text}</span>
          {t.undo && canUndo && <button className="btn sm" onClick={undo}>تراجع</button>}
        </div>
      ))}
    </div>
  );
}

export function parseCell(s: string): Raw {
  const t = s.trim();
  if (t === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return s;
}

/** Excel-like inline cell: commits on blur / Enter; numbers stay numbers, text stays raw text. */
export function CellInput({ value, onCommit, bad, left, title, min, max, width }: {
  value: Raw; onCommit: (v: Raw) => void; bad?: boolean; left?: boolean; title?: string; min?: number; max?: number; width?: number;
}) {
  const [txt, setTxt] = useState(value === null ? '' : String(value));
  useEffect(() => setTxt(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const v = parseCell(txt);
    if (v !== value && !(v === null && value === null)) onCommit(v);
  };
  return (
    <input
      className={`cellin ${bad ? 'bad' : ''} ${typeof value === 'string' && !left ? 'txt' : ''} ${left ? 'left' : ''}`}
      value={txt}
      title={title}
      inputMode={left ? 'text' : 'numeric'}
      aria-invalid={bad}
      data-min={min}
      data-max={max}
      style={width ? { width, minWidth: width } : undefined}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTxt(value === null ? '' : String(value)); (e.target as HTMLInputElement).blur(); } }}
    />
  );
}

export function TextCell({ value, onCommit, width }: { value: string; onCommit: (v: string) => void; width?: number }) {
  return <CellInput value={value === '' ? null : value} left width={width} onCommit={(v) => onCommit(v === null ? '' : String(v))} />;
}

export function Field({ label, children, full, issues }: { label: string; children: ReactNode; full?: boolean; issues?: Array<{ level: string; message: string }> }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
      {issues?.map((i, k) => <div key={k} className={`issue ${i.level}`}>{i.message}</div>)}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function downloadBlob(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Client-side pagination (RTL aware: "next" points left). */
export function Pagination({ total, page, size, onPage, onSize, sizes = [10, 25, 50] }: {
  total: number; page: number; size: number; onPage: (p: number) => void; onSize?: (s: number) => void; sizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages);
  if (total <= Math.min(...sizes) && !onSize) return null;
  const from = total === 0 ? 0 : (cur - 1) * size + 1;
  const to = Math.min(total, cur * size);
  const nums: number[] = [];
  for (let i = Math.max(1, cur - 2); i <= Math.min(pages, cur + 2); i++) nums.push(i);
  return (
    <nav className="pager" aria-label="التنقل بين الصفحات">
      <span>عرض {from}–{to} من {total}</span>
      <div className="pages">
        <button onClick={() => onPage(cur - 1)} disabled={cur <= 1} aria-label="السابق"><Icon name="chevR" /></button>
        {nums[0] > 1 && <><button onClick={() => onPage(1)}>1</button>{nums[0] > 2 && <span>…</span>}</>}
        {nums.map((n) => <button key={n} className={n === cur ? 'cur' : ''} aria-current={n === cur ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>)}
        {nums[nums.length - 1] < pages && <>{nums[nums.length - 1] < pages - 1 && <span>…</span>}<button onClick={() => onPage(pages)}>{pages}</button></>}
        <button onClick={() => onPage(cur + 1)} disabled={cur >= pages} aria-label="التالي"><Icon name="chevL" /></button>
      </div>
      {onSize && (
        <label>الصفوف في الصفحة: <select value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="عدد الصفوف في الصفحة">{sizes.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      )}
    </nav>
  );
}

export function slicePage<T>(rows: T[], page: number, size: number): T[] {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  return rows.slice((cur - 1) * size, cur * size);
}
