import { useMemo, useState } from 'react';
import { LEAVE_TYPES } from '../domain/constants';
import { fmtDMY, isoToSerial, leaveDateToISO, parseDMY, serialToISO, swapDayMonth } from '../domain/dates';
import { addLeaveRow, clone, deleteLeaveRow, updateLeaveRow } from '../domain/model';
import { normName } from '../domain/quality';
import type { AppModel, LeaveRow, Raw } from '../domain/types';
import { validateLeave } from '../domain/validate';
import { CellInput, Empty, Field, Modal, TextCell } from './kit';
import { commit, confirmDialog, toast } from './store';

const showDate = (v: Raw, kind: string, d1904: boolean) => (v === null || kind === 'empty' ? '' : kind === 'date' && typeof v === 'number' ? fmtDMY(serialToISO(v, d1904)) : String(v));

export function LeavePage({ model }: { model: AppModel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [month, setMonth] = useState('');
  const [editing, setEditing] = useState<{ index: number; row: LeaveRow } | null>(null);
  const [norm, setNorm] = useState(false);

  const names = useMemo(() => [...new Set(model.leave.map((l) => l.name).filter(Boolean))], [model.leave]);
  const view = model.leave.map((l, index) => ({ l, index })).filter(({ l }) => {
    if (name && l.name !== name) return false;
    if (type && l.type !== type) return false;
    if (month) { const s = leaveDateToISO(l.start, l.startKind, model.date1904); if (!s || s.slice(5, 7) !== month) return false; }
    return true;
  });
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of model.leave) { const k = normName(l.name); c.set(k, (c.get(k) ?? 0) + 1); }
    return c;
  }, [model.leave]);

  const blank = (): LeaveRow => ({ row: 0, name: name || '', type: LEAVE_TYPES[0], start: null, startKind: 'empty', end: null, endKind: 'empty', days: 1 });
  const del = async (index: number) => {
    if (await confirmDialog('حذف هذا السجل؟', { danger: true, okLabel: 'حذف', detail: 'تُزاح الصفوف التالية لأعلى في Excel.' }))
      if (commit('حذف إجازة', (m) => deleteLeaveRow(m, index))) toast('تم الحذف', 'ok', true);
  };

  return (
    <>
      <div className="filters">
        <button className="btn primary" onClick={() => setEditing({ index: -1, row: blank() })}>+ إضافة سجل</button>
        <select value={name} onChange={(e) => setName(e.target.value)} aria-label="الموظف"><option value="">كل الموظفين</option>{names.map((n) => <option key={n}>{n}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="النوع"><option value="">كل الأنواع</option>{LEAVE_TYPES.map((n) => <option key={n}>{n}</option>)}</select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="الشهر"><option value="">كل الشهور</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>شهر {i + 1}</option>)}</select>
        <button className="btn" onClick={() => setNorm(true)}>توحيد التواريخ (اختياري)…</button>
        <span className="note">{view.length} / {model.leave.length} سجل · الحد الأقصى {148}</span>
      </div>
      <div className="tablewrap" style={{ marginBottom: 16 }}>
        {view.length === 0 ? <Empty>لا توجد سجلات مطابقة.</Empty> : (
          <table className="grid">
            <thead><tr><th>#</th><th>اسم الموظف</th><th>النوع</th><th>تاريخ البداية</th><th>تاريخ النهاية</th><th>عدد الأيام / السبب</th><th>تنبيهات</th><th /></tr></thead>
            <tbody>
              {view.map(({ l, index }) => {
                const issues = validateLeave(model, l);
                return (
                  <tr key={l.row}>
                    <td className="c">{index + 1}</td>
                    <td className="name">{l.name}</td>
                    <td>{l.type}{issues.some((i) => i.field === 'type') && <span className="warnchip">؟</span>}</td>
                    {[['start', 'startKind'], ['end', 'endKind']].map(([v, k]) => {
                      const kind = l[k as 'startKind'];
                      return <td key={v} className="c" title={kind === 'text' ? 'مخزن كنص في الملف' : kind === 'date' ? 'تاريخ فعلي' : ''}>{showDate(l[v as 'start'], kind, model.date1904)} {kind === 'text' && <span className="warnchip">نص</span>}</td>;
                    })}
                    <td className="c" style={{ minWidth: 110 }}><CellInput value={l.days} left width={110} onCommit={(v) => commit('تعديل إجازة', (m) => updateLeaveRow(m, index, { ...l, days: v }))} /></td>
                    <td style={{ fontSize: 12 }}>{issues.filter((i) => i.field !== 'name').map((i) => i.message).join(' · ')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => setEditing({ index, row: clone(l) })}>تعديل</button> <button className="btn sm danger" onClick={() => del(index)}>حذف</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>إجماليات الإجازات اليدوية (الخانة F في الشيت)</h2>
        <p className="note">أرقام مكتوبة يدوياً في الملف (بدون معادلات). لا يعدّلها التطبيق تلقائياً — العمود الأخير مقارنة إرشادية بعدد السجلات في السجل أعلاه فقط.</p>
        <table className="mini" style={{ maxWidth: 640 }}>
          <thead><tr><th>الموظف</th><th>الإجمالي اليدوي</th><th>عدد السجلات</th><th /></tr></thead>
          <tbody>
            {model.leaveTotals.map((t, i) => {
              const c = counts.get(normName(t.name)) ?? 0;
              return (
                <tr key={i}>
                  <td><TextCell value={t.name} width={200} onCommit={(v) => commit('تعديل إجمالي إجازات', (m) => { const x = clone(m); x.leaveTotals[i].name = v; return x; })} /></td>
                  <td><CellInput value={t.total} width={70} onCommit={(v) => commit('تعديل إجمالي إجازات', (m) => { const x = clone(m); x.leaveTotals[i].total = v; return x; })} /></td>
                  <td title="عدد صفوف السجل لنفس الاسم">{c}{typeof t.total === 'number' && t.total !== c && <span className="warnchip" style={{ marginInlineStart: 6 }}>≠</span>}</td>
                  <td><button className="btn sm danger" onClick={() => commit('حذف إجمالي إجازات', (m) => { const x = clone(m); x.leaveTotals.splice(i, 1); return x; })}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p><button className="btn sm" onClick={() => commit('إضافة إجمالي إجازات', (m) => { const x = clone(m); x.leaveTotals.push({ name: '', total: null }); return x; })}>+ إضافة سطر</button></p>
      </div>
      {editing && <LeaveModal model={model} init={editing.row} index={editing.index} onClose={() => setEditing(null)} />}
      {norm && <NormalizeModal model={model} onClose={() => setNorm(false)} />}
    </>
  );
}

function DateField({ label, value, kind, onChange, d1904 }: { label: string; value: Raw; kind: LeaveRow['startKind']; onChange: (v: Raw, k: LeaveRow['startKind']) => void; d1904: boolean }) {
  const iso = leaveDateToISO(value, kind, d1904) ?? '';
  return (
    <Field label={label}>
      <input type="date" value={iso} onChange={(e) => (e.target.value ? onChange(isoToSerial(e.target.value, d1904), 'date') : onChange(null, 'empty'))} />
      <input type="text" placeholder="أو اكتب d/m/yyyy" style={{ marginTop: 4 }} defaultValue={kind === 'text' ? String(value) : ''} key={String(kind) + String(value)}
        onBlur={(e) => { const t = e.target.value.trim(); if (!t) return; const p = parseDMY(t); if (p) onChange(isoToSerial(p, d1904), 'date'); else onChange(t, 'text'); }} />
      {kind === 'text' && <div className="issue warn">القيمة الحالية مخزنة كنص ({String(value)}). اختيار تاريخ يحوّلها إلى تاريخ فعلي.</div>}
    </Field>
  );
}

function LeaveModal({ model, init, index, onClose }: { model: AppModel; init: LeaveRow; index: number; onClose: () => void }) {
  const [r, setR] = useState<LeaveRow>(init);
  const issues = validateLeave(model, r);
  const names = [...new Set(model.leave.map((l) => l.name).concat(model.leaveTotals.map((t) => t.name)).filter(Boolean))];
  const save = () => {
    const ok = commit(index < 0 ? 'إضافة إجازة' : 'تعديل إجازة', (m) => (index < 0 ? addLeaveRow(m, r) : updateLeaveRow(m, index, r)));
    if (ok) { toast('تم الحفظ', 'ok', true); onClose(); }
  };
  return (
    <Modal title={index < 0 ? 'إضافة سجل إجازة / إذن' : 'تعديل السجل'} onClose={onClose}>
      <div className="form">
        <Field label="اسم الموظف" issues={issues.filter((i) => i.field === 'name')}><input list="dl-leave-names" type="text" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /><datalist id="dl-leave-names">{names.map((n) => <option key={n} value={n} />)}</datalist></Field>
        <Field label="النوع" issues={issues.filter((i) => i.field === 'type')}>
          <select value={r.type} onChange={(e) => setR({ ...r, type: e.target.value })}>{!(LEAVE_TYPES as readonly string[]).includes(r.type) && r.type && <option>{r.type}</option>}{LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <DateField label="تاريخ البداية" value={r.start} kind={r.startKind} d1904={model.date1904} onChange={(v, k) => setR({ ...r, start: v, startKind: k })} />
        <DateField label="تاريخ النهاية" value={r.end} kind={r.endKind} d1904={model.date1904} onChange={(v, k) => setR({ ...r, end: v, endKind: k })} />
        <Field label="عدد الأيام (رقم أو نص حر)"><input type="text" value={r.days === null ? '' : String(r.days)} onChange={(e) => { const t = e.target.value; setR({ ...r, days: t.trim() === '' ? null : /^\d+(\.\d+)?$/.test(t.trim()) ? Number(t) : t }); }} /></Field>
      </div>
      {issues.filter((i) => i.field === 'end' || i.field === 'start').map((i, k) => <div key={k} className="issue warn">{i.message}</div>)}
      <div className="actions"><button className="btn primary" disabled={!r.name.trim()} onClick={save}>حفظ</button><button className="btn" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

interface Proposal { index: number; kind: 'text→date' | 'swap'; field: 'start' | 'end'; label: string; apply: (l: LeaveRow) => LeaveRow }

function NormalizeModal({ model, onClose }: { model: AppModel; onClose: () => void }) {
  const props = useMemo(() => {
    const out: Proposal[] = [];
    model.leave.forEach((l, index) => {
      for (const f of ['start', 'end'] as const) {
        const kind = l[`${f}Kind` as 'startKind'];
        const v = l[f];
        if (kind === 'text' && typeof v === 'string') {
          const p = parseDMY(v);
          if (p) out.push({ index, kind: 'text→date', field: f, label: `صف ${index + 1} · ${l.name} · ${f === 'start' ? 'بداية' : 'نهاية'}: النص «${v}» ← تاريخ فعلي ${fmtDMY(p)}`, apply: (x) => ({ ...x, [f]: isoToSerial(p, model.date1904), [`${f}Kind`]: 'date' }) as LeaveRow });
        }
      }
      const s = leaveDateToISO(l.start, l.startKind, model.date1904), e = leaveDateToISO(l.end, l.endKind, model.date1904);
      if (s && e && e < s && l.startKind === 'date' && typeof l.start === 'number') {
        const sw = swapDayMonth(s);
        if (sw && sw <= e) out.push({ index, kind: 'swap', field: 'start', label: `صف ${index + 1} · ${l.name}: البداية ${fmtDMY(s)} بعد النهاية ${fmtDMY(e)} ← عكس اليوم/الشهر إلى ${fmtDMY(sw)}`, apply: (x) => ({ ...x, start: isoToSerial(sw, model.date1904) }) });
      }
    });
    return out;
  }, [model]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const apply = () => {
    commit('توحيد تواريخ الإجازات', (m) => {
      const x = clone(m);
      [...sel].forEach((pi) => { const p = props[pi]; x.leave[p.index] = p.apply(x.leave[p.index]); });
      return x;
    });
    toast(`تم تطبيق ${sel.size} تعديل`, 'ok', true);
    onClose();
  };
  return (
    <Modal title="توحيد تواريخ سجل الإجازات" onClose={onClose} wide>
      <p className="note">لا يتغير أي شيء إلا ما تحدده بنفسك. يمكن التراجع بعد التطبيق.</p>
      {props.length === 0 ? <Empty>لا توجد تعديلات مقترحة.</Empty> : (
        <>
          <p><button className="btn sm" onClick={() => setSel(new Set(props.map((_, i) => i)))}>تحديد الكل</button> <button className="btn sm" onClick={() => setSel(new Set())}>إلغاء التحديد</button></p>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            {props.map((p, i) => <label key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--line)' }}><input type="checkbox" checked={sel.has(i)} onChange={() => toggle(i)} /><span>{p.kind === 'swap' ? '🔁 ' : '📅 '}{p.label}</span></label>)}
          </div>
        </>
      )}
      <div className="actions"><button className="btn primary" disabled={!sel.size} onClick={apply}>تطبيق ({sel.size})</button><button className="btn" onClick={onClose}>إغلاق</button></div>
    </Modal>
  );
}
