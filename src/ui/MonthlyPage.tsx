import { useMemo, useState } from 'react';
import { monthTotal } from '../domain/calc';
import { CAP, MONTH_NAMES, SCORE_SHORT, SCORE_HEADERS } from '../domain/constants';
import { isoToSerial, serialToISO } from '../domain/dates';
import { addMonthRecord, blankRecord, copyRosterFromPrevious, deleteMonthRecord, gridOf, updateMonthRecord } from '../domain/model';
import { buildRoster, codeKey } from '../domain/roster';
import type { AppModel, MonthRecord, Raw } from '../domain/types';
import { isIntInRange, validateMonthRecord } from '../domain/validate';
import { Icon } from './icons';
import { CellInput, Empty, Field, Modal, Pagination, TextCell, parseCell, slicePage } from './kit';
import { commit, confirmDialog, toast, useStore } from './store';

export function MonthlyPage({ model }: { model: AppModel }) {
  const [month, setMonth] = useState(1);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MonthRecord | null>(null);
  const recs = useMemo(() => model.months.filter((r) => r.month === month).sort((a, b) => a.row - b.row), [model, month]);
  const free = CAP.monthRows - recs.length;
  const paged = slicePage(recs, page, size);
  const base = gridOf(model).firstRow - 1;

  const upd = (r: MonthRecord, patch: Partial<MonthRecord>) =>
    commit('تعديل تقييم شهري', (m) => updateMonthRecord(m, r.month, r.row, { ...r, ...patch }));

  const del = async (r: MonthRecord) => {
    if (await confirmDialog(`حذف «${r.name || r.code}» من شهر ${MONTH_NAMES[month - 1]}؟`, { detail: 'لن يُحذف الموظف من الشهور الأخرى. تبقى تنسيقات الصف في Excel.', danger: true, okLabel: 'حذف' }))
      if (commit('حذف صف شهري', (m) => deleteMonthRecord(m, r.month, r.row))) toast('تم حذف الصف', 'ok', true);
  };

  const copyPrev = async () => {
    if (month === 1) return;
    if (!(await confirmDialog(`نسخ بيانات الموظفين (الهوية فقط) من ${MONTH_NAMES[month - 2]} إلى ${MONTH_NAMES[month - 1]}؟`, { detail: 'الدرجات والزيارات تبقى فارغة، ولا يُكرَّر أي كود موجود.' }))) return;
    let added = 0;
    if (commit('نسخ الموظفين من الشهر السابق', (m) => { const r = copyRosterFromPrevious(m, month); added = r.added; return r.model; })) toast(`تمت إضافة ${added} موظف`, 'ok', true);
  };

  return (
    <>
      <div className="pagehead"><div><h1>التقييم الشهري</h1><p>إدخال الزيارات والمعايير الثمانية لكل موظف حسب الشهر</p></div></div>
      <div className="tabs" role="tablist">
        {MONTH_NAMES.map((n, i) => {
          const c = model.months.filter((r) => r.month === i + 1).length;
          return <button key={n} role="tab" aria-selected={month === i + 1} className={`tab ${month === i + 1 ? 'active' : ''}`} onClick={() => { setMonth(i + 1); setPage(1); }}>{n}<small>{c}</small></button>;
        })}
      </div>
      <div className="filters">
        <button className="btn primary" onClick={() => setAdding(true)} disabled={free <= 0}><Icon name="plus" /> إضافة موظف لشهر {MONTH_NAMES[month - 1]}</button>
        <button className="btn" onClick={copyPrev} disabled={month === 1 || free <= 0}>نسخ الموظفين من الشهر السابق</button>
        <span className="note">الصفوف المتاحة: {free} من {CAP.monthRows} · إجمالي الصف = الزيارات + 8 تقييمات (كما في العمود Q)</span>
      </div>
      <div className="tablewrap">
        {recs.length === 0 ? <Empty>لا توجد بيانات في هذا الشهر. أضف موظفاً أو انسخ الموظفين من الشهر السابق.</Empty> : (
          <table className="grid">
            <thead>
              <tr>
                <th>صف</th><th className="sticky1">اسم الموظف</th><th>الكود</th><th>القطاع</th><th>المحافظة</th><th>الوظيفة</th><th>تاريخ الالتحاق</th>
                <th>{MONTH_NAMES[month - 1]} (زيارات)</th>
                {SCORE_SHORT.map((s, i) => <th key={i} title={SCORE_HEADERS[i]} style={{ minWidth: 64, whiteSpace: 'normal' }}>{s}</th>)}
                <th>الإجمالي</th><th style={{ minWidth: 240 }}>ملاحظات</th><th />
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const issues = validateMonthRecord(model, r, r);
                return (
                  <tr key={r.row}>
                    <td className="c">{r.row - base}</td>
                    <td className="name sticky1">{r.name || <i className="note">بدون اسم</i>}</td>
                    <td className="c">{String(r.code ?? '')}</td>
                    <td>{r.sector}</td><td>{r.gov.replace('محافظه - ', '')}</td><td>{r.job}</td>
                    <td className="c">{typeof r.join === 'number' ? serialToISO(r.join, model.date1904).split('-').reverse().join('/') : r.join}</td>
                    <td><CellInput value={r.visits} bad={r.visits !== null && !isIntInRange(r.visits, 0)} title={typeof r.visits === 'string' ? 'نص — يُحسب 0 وتُحفظ القيمة كما هي' : 'عدد الزيارات'} onCommit={(v) => upd(r, { visits: v })} /></td>
                    {r.scores.map((s, i) => (
                      <td key={i}><CellInput value={s} bad={s !== null && !isIntInRange(s, 1, 5)} title={`${SCORE_HEADERS[i]} (1–5)`} onCommit={(v) => {
                        if (typeof v === 'number' && !isIntInRange(v, 1, 5)) toast('التقييم يجب أن يكون رقماً صحيحاً من 1 إلى 5 (تم الحفظ مع تنبيه)', 'info');
                        upd(r, { scores: r.scores.map((x, j) => (j === i ? v : x)) });
                      }} /></td>
                    ))}
                    <td className="c" style={{ background: '#e6f4f4', fontWeight: 700 }}>{monthTotal(r)}</td>
                    <td><TextCell value={r.notes} onCommit={(v) => upd(r, { notes: v })} width={240} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {issues.some((i) => i.field === 'code') && <span className="warnchip" title={issues.find((i) => i.field === 'code')!.message}>كود</span>}{' '}
                      <button className="rowbtn" onClick={() => setEditing(r)} aria-label="تعديل" title="تعديل"><Icon name="edit" /></button>
                      <button className="rowbtn danger" onClick={() => del(r)} aria-label="حذف" title="حذف"><Icon name="trash" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination total={recs.length} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }} />
      <p className="note">نص مكتوب في خانة رقمية (مثل «تدريب») يُحفظ كما هو ويُحسب 0 — تمامًا كما تفعل SUM في Excel. التقييمات المقبولة: أعداد صحيحة 1–5.</p>
      {adding && <AddModal model={model} month={month} onClose={() => setAdding(false)} />}
      {editing && <RecordModal model={model} initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecordForm({ model, rec, setRec, original, hideIdentity }: { model: AppModel; rec: MonthRecord; setRec: (r: MonthRecord) => void; original?: MonthRecord; hideIdentity?: boolean }) {
  const issues = validateMonthRecord(model, rec, original);
  const of = (f: string) => issues.filter((i) => i.field === f);
  const text = (k: 'name' | 'job' | 'notes') => <input type="text" value={rec[k]} onChange={(e) => setRec({ ...rec, [k]: e.target.value })} />;
  return (
    <>
      <div className="form">
        {!hideIdentity && (<>
        <Field label="الكود (أرقام فقط)" issues={of('code')}>
          <input type="text" inputMode="numeric" value={rec.code === null ? '' : String(rec.code)} onChange={(e) => setRec({ ...rec, code: e.target.value.trim() === '' ? null : /^\d+$/.test(e.target.value.trim()) ? Number(e.target.value.trim()) : e.target.value })} />
        </Field>
        <Field label="اسم الموظف" issues={of('name')}>{text('name')}</Field>
        <Field label="القطاع" issues={of('sector')}><input list="dl-sectors" value={rec.sector} onChange={(e) => setRec({ ...rec, sector: e.target.value })} /></Field>
        <Field label="المحافظة" issues={of('gov')}><input list="dl-govs" value={rec.gov} onChange={(e) => setRec({ ...rec, gov: e.target.value })} /></Field>
        <Field label="الوظيفة">{text('job')}</Field>
        <Field label="تاريخ الالتحاق" issues={of('join')}>
          <input type="date" value={typeof rec.join === 'number' ? serialToISO(rec.join, model.date1904) : ''} onChange={(e) => setRec({ ...rec, join: e.target.value ? isoToSerial(e.target.value, model.date1904) : null })} />
        </Field>
        </>)}
        <Field label={`عدد الزيارات في ${MONTH_NAMES[rec.month - 1]}`} issues={of('visits')}>
          <input type="text" inputMode="numeric" value={rec.visits === null ? '' : String(rec.visits)} onChange={(e) => setRec({ ...rec, visits: parseCell(e.target.value) })} />
        </Field>
      </div>
      <h3 style={{ margin: '14px 0 8px', fontSize: 14 }}>معايير التقييم (1 – 5)</h3>
      <div className="scores">
        {rec.scores.map((s, i) => (
          <Field key={i} label={`${i + 1}. ${SCORE_SHORT[i]}`} issues={of(`s${i + 1}`)}>
            <input type="number" min={1} max={5} step={1} value={typeof s === 'number' ? s : ''} placeholder={typeof s === 'string' ? s : ''}
              onChange={(e) => setRec({ ...rec, scores: rec.scores.map((x, j) => (j === i ? (e.target.value === '' ? null : Number(e.target.value)) : x)) })} />
          </Field>
        ))}
      </div>
      <div className="form" style={{ marginTop: 12 }}>
        <Field label="ملاحظات" full><textarea rows={3} value={rec.notes} onChange={(e) => setRec({ ...rec, notes: e.target.value })} /></Field>
      </div>
      <p className="note">إجمالي الصف (Q): <b>{monthTotal(rec)}</b> = الزيارات + مجموع التقييمات</p>
    </>
  );
}

function AddModal({ model, month, onClose }: { model: AppModel; month: number; onClose: () => void }) {
  const roster = buildRoster(model).rows;
  const inMonth = new Set(model.months.filter((r) => r.month === month).map((r) => codeKey(r.code)));
  const candidates = roster.filter((e) => !inMonth.has(String(e.code)));
  const [mode, setMode] = useState<'existing' | 'new'>(candidates.length ? 'existing' : 'new');
  const [pick, setPick] = useState(candidates[0] ? String(candidates[0].code) : '');
  const [rec, setRec] = useState<MonthRecord>({ ...blankRecord(month, 0), row: 0 });

  const base = (): MonthRecord => {
    if (mode === 'new') return rec;
    const e = roster.find((x) => String(x.code) === pick);
    return e ? { ...rec, code: e.code, sector: e.sector, gov: e.gov, name: e.name, join: e.join, job: e.job } : rec;
  };
  const cur = base();
  const issues = validateMonthRecord(model, cur);
  const blocked = issues.some((i) => i.level === 'error') || (mode === 'existing' && !pick);
  const save = () => {
    const { row: _r, ...rest } = cur;
    void _r;
    if (commit('إضافة موظف لشهر', (m) => addMonthRecord(m, rest))) { toast('تمت الإضافة', 'ok', true); onClose(); }
  };
  return (
    <Modal title={`إضافة موظف — ${MONTH_NAMES[month - 1]}`} onClose={onClose} wide>
      <div className="tabs">
        <button className={`tab ${mode === 'existing' ? 'active' : ''}`} onClick={() => setMode('existing')} disabled={!candidates.length}>موظف موجود في القائمة</button>
        <button className={`tab ${mode === 'new' ? 'active' : ''}`} onClick={() => setMode('new')}>موظف جديد</button>
      </div>
      {mode === 'existing' ? (
        <>
          <Field label="اختر الموظف (تُنسخ بياناته الوظيفية)">
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              {candidates.map((e) => <option key={String(e.code)} value={String(e.code)}>{e.name} — {e.code}</option>)}
            </select>
          </Field>
          <RecordForm model={model} rec={cur} hideIdentity setRec={(r) => setRec({ ...rec, visits: r.visits, scores: r.scores, notes: r.notes })} />
        </>
      ) : <RecordForm model={model} rec={rec} setRec={setRec} />}
      <div className="actions"><button className="btn primary" disabled={blocked} onClick={save}>إضافة</button><button className="btn" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

function RecordModal({ model, initial, onClose }: { model: AppModel; initial: MonthRecord; onClose: () => void }) {
  const [rec, setRec] = useState<MonthRecord>(structuredClone(initial));
  const blocked = validateMonthRecord(model, rec, initial).some((i) => i.level === 'error');
  const save = () => { if (commit('تعديل صف شهري', (m) => updateMonthRecord(m, initial.month, initial.row, rec))) { toast('تم الحفظ', 'ok', true); onClose(); } };
  return (
    <Modal title={`تعديل — ${MONTH_NAMES[initial.month - 1]} (صف ${initial.row})`} onClose={onClose} wide>
      <RecordForm model={model} rec={rec} setRec={setRec} original={initial} />
      <p className="note">تعديل الهوية هنا يخص هذا الشهر فقط. لتعديل بيانات الموظف في كل الشهور استخدم «تعديل بيانات الموظف» من لوحة التقييم السنوي.</p>
      <div className="actions"><button className="btn primary" disabled={blocked} onClick={save}>حفظ</button><button className="btn" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}
void useStore;
export type { Raw };
