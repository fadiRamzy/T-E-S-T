import { useMemo, useState } from 'react';
import { monthTotal, num } from '../domain/calc';
import { MONTH_NAMES } from '../domain/constants';
import { fmtSerial, isoToSerial, serialToISO } from '../domain/dates';
import { addEmployee, changeEmployeeCode, deleteEmployee, editIdentity, setMainNote } from '../domain/model';
import { buildRoster, recordIn } from '../domain/roster';
import type { AppModel, EmployeeRow, Grade } from '../domain/types';
import { Icon } from './icons';
import { Drawer, Empty, Field, GradeChip, Modal, Pagination, slicePage } from './kit';
import { commit, confirmDialog, toast, useStore } from './store';

type SortKey = 'index' | 'name' | 'code' | 'sector' | 'gov' | 'job' | 'join' | 'visits' | 'points' | 'grade';
const GRADE_ORDER: Grade[] = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'];
const COLS: Array<{ key: SortKey; label: string; cls?: string }> = [
  { key: 'index', label: 'م', cls: 'num' }, { key: 'name', label: 'اسم الموظف' }, { key: 'code', label: 'الكود', cls: 'num' }, { key: 'sector', label: 'القطاع' },
  { key: 'gov', label: 'المحافظة' }, { key: 'job', label: 'الوظيفة' }, { key: 'join', label: 'تاريخ الالتحاق', cls: 'num' },
  { key: 'visits', label: 'الزيارات', cls: 'num' }, { key: 'points', label: 'النقاط', cls: 'num' }, { key: 'grade', label: 'الدرجة', cls: 'num' },
];

export function EmployeesPage({ model }: { model: AppModel }) {
  const asOf = useStore((s) => s.asOf);
  const roster = useMemo(() => buildRoster(model, asOf), [model, asOf]);
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [gov, setGov] = useState('');
  const [grade, setGrade] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'index', dir: 1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ emp?: EmployeeRow } | null>(null);

  const rows = useMemo(() => {
    const t = q.trim();
    const f = roster.rows.filter((r) =>
      (!t || r.name.includes(t) || String(r.code).includes(t) || r.job.includes(t)) &&
      (!sector || r.sector === sector) && (!gov || r.gov === gov) && (!grade || r.grade === grade));
    return [...f].sort((a, b) => {
      const k = sort.key;
      let c: number;
      if (k === 'grade') c = GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade);
      else if (k === 'join') c = num(a.join) - num(b.join);
      else { const x = a[k], y = b[k]; c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ar'); }
      return c * sort.dir;
    });
  }, [roster, q, sector, gov, grade, sort]);
  const paged = slicePage(rows, page, size);
  const sectors = [...new Set(roster.rows.map((r) => r.sector).filter(Boolean))];
  const govs = [...new Set(roster.rows.map((r) => r.gov).filter(Boolean))];
  const openEmp = roster.rows.find((r) => String(r.code) === open);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  const remove = async (e: EmployeeRow) => {
    const n = model.months.filter((r) => String(r.code) === String(e.code)).length;
    if (!(await confirmDialog(`حذف الموظف «${e.name}» (${e.code}) نهائياً؟`, {
      detail: `سيُحذف من كل الشهور (${n} سجل شهري) ومن التقييم السنوي، ولن يظهر في ملف Excel المُصدَّر. يمكنك التراجع مباشرة بزر «تراجع».`,
      danger: true, okLabel: 'حذف الموظف',
    }))) return;
    if (commit('حذف موظف', (m) => deleteEmployee(m, e.code))) { setOpen(null); toast(`تم حذف ${e.name}`, 'ok', true); }
  };

  return (
    <>
      <div className="pagehead">
        <div><h1>الموظفون</h1><p>{roster.rows.length} موظفاً — الكود هو المفتاح الأساسي ولا يمكن تكراره</p></div>
        <button className="btn primary" onClick={() => setForm({})}><Icon name="plus" /> إضافة موظف</button>
      </div>
      {roster.overflow > 0 && <div className="banner err">تجاوز عدد الموظفين سعة الشيت الرئيسي ({roster.overflow} موظف لن يظهروا في ملف Excel).</div>}
      <div className="filters">
        <div className="search"><Icon name="search" /><input type="search" placeholder="بحث بالاسم أو الكود أو الوظيفة…" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="بحث" /></div>
        <select value={sector} onChange={(e) => reset(setSector)(e.target.value)} aria-label="القطاع"><option value="">كل القطاعات</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={gov} onChange={(e) => reset(setGov)(e.target.value)} aria-label="المحافظة"><option value="">كل المحافظات</option>{govs.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={grade} onChange={(e) => reset(setGrade)(e.target.value)} aria-label="الدرجة"><option value="">كل الدرجات</option>{GRADE_ORDER.map((s) => <option key={s}>{s}</option>)}</select>
      </div>

      <div className="tablewrap cardwrap">
        {rows.length === 0 ? <Empty>{roster.rows.length ? 'لا يوجد موظفون مطابقون للبحث.' : 'لا يوجد موظفون بعد — أضف موظفاً أو استورد ملف Excel.'}</Empty> : (
          <table className="cards" data-testid="employees-table">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} className={`sortable ${c.cls ?? ''}`} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    {c.label} {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={String(r.code)} className="clickable" onClick={() => setOpen(String(r.code))}>
                  <td className="num" data-label="م">{r.index}</td>
                  <td className="name" data-label="الاسم">{r.name}</td>
                  <td className="num" data-label="الكود">{r.code}</td>
                  <td data-label="القطاع">{r.sector}</td>
                  <td data-label="المحافظة">{r.gov}</td>
                  <td data-label="الوظيفة">{r.job}</td>
                  <td className="num" data-label="الالتحاق">{fmtSerial(r.join, model.date1904)}</td>
                  <td className="num" data-label="الزيارات">{r.visits}</td>
                  <td className="num" data-label="النقاط"><b>{r.points}</b></td>
                  <td className="num" data-label="الدرجة"><GradeChip grade={r.grade} /></td>
                  <td className="acts" onClick={(e) => e.stopPropagation()}>
                    <button className="rowbtn" aria-label={`تعديل ${r.name}`} title="تعديل" onClick={() => setForm({ emp: r })}><Icon name="edit" /></button>
                    <button className="rowbtn danger" aria-label={`حذف ${r.name}`} title="حذف" onClick={() => remove(r)}><Icon name="trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination total={rows.length} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }} />
      <p className="note">الدرجة تُحسب بنفس معادلة الشيت (الحدود × نسبة مدة الخدمة، شهر = 30 يوماً) بتاريخ {asOf}.</p>

      {openEmp && <EmployeeDrawer model={model} emp={openEmp} onClose={() => setOpen(null)} onEdit={() => setForm({ emp: openEmp })} onDelete={() => remove(openEmp)} />}
      {form && <EmployeeForm model={model} emp={form.emp} onClose={() => setForm(null)} />}
    </>
  );
}

function EmployeeDrawer({ model, emp, onClose, onEdit, onDelete }: { model: AppModel; emp: EmployeeRow; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const key = String(emp.code);
  const [note, setNote] = useState(emp.notes);
  const monthly = MONTH_NAMES.map((_, i) => {
    const rec = recordIn(model, i + 1, key);
    return { present: !!rec, visits: rec ? num(rec.visits) : 0, total: rec ? monthTotal(rec) : 0, text: rec && typeof rec.visits === 'string' ? rec.visits : '' };
  });
  const max = Math.max(1, ...monthly.map((m) => m.total));
  return (
    <Drawer onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ flex: 1, fontSize: 18 }}>{emp.name}</h2>
        <GradeChip grade={emp.grade} />
        <button className="rowbtn" onClick={onClose} aria-label="إغلاق"><Icon name="close" /></button>
      </div>
      <dl className="kv">
        <dt>الكود</dt><dd>{emp.code}</dd>
        <dt>القطاع</dt><dd>{emp.sector || '—'}</dd>
        <dt>المحافظة</dt><dd>{emp.gov || '—'}</dd>
        <dt>الوظيفة</dt><dd>{emp.job || '—'}</dd>
        <dt>تاريخ الالتحاق</dt><dd>{fmtSerial(emp.join, model.date1904) || '—'}</dd>
        <dt>أشهر الالتحاق</dt><dd>{emp.monthsSince.toFixed(2)} (الجزء الصحيح {Math.floor(emp.monthsSince)})</dd>
        <dt>إجمالي النقاط</dt><dd>{emp.points}</dd>
        <dt>إجمالي الزيارات</dt><dd>{emp.visits}</dd>
        <dt>أول ظهور</dt><dd>{MONTH_NAMES[emp.firstMonth - 1]}</dd>
      </dl>
      <div className="actions" style={{ marginTop: 0, marginBottom: 14 }}>
        <button className="btn sm" onClick={onEdit}><Icon name="edit" /> تعديل</button>
        <button className="btn sm danger" onClick={onDelete}><Icon name="trash" /> حذف</button>
      </div>
      <h3 style={{ marginBottom: 6 }}>إجمالي النقاط الشهري</h3>
      <svg viewBox="0 0 360 140" role="img" aria-label="مخطط الإجمالي الشهري" style={{ width: '100%', background: '#fafcfe', border: '1px solid var(--line)', borderRadius: 8 }}>
        {monthly.map((m, i) => {
          const h = (m.total / max) * 90;
          const x = 355 - (i + 1) * 29;
          return (
            <g key={i}>
              <rect x={x} y={105 - h} width={20} height={h} rx={3} fill={m.present ? '#0f8b8d' : '#d5dce8'}><title>{MONTH_NAMES[i]}: {m.total}</title></rect>
              <text x={x + 10} y={100 - h} fontSize="9" textAnchor="middle" fill="#0f2a4a">{m.present ? m.total : ''}</text>
              <text x={x + 10} y={120} fontSize="8" textAnchor="middle" fill="#5d6b82">{MONTH_NAMES[i].slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
      <table className="mini" style={{ marginTop: 10 }}>
        <thead><tr><th>الشهر</th><th>الزيارات</th><th>الإجمالي</th></tr></thead>
        <tbody>
          {monthly.map((m, i) => (
            <tr key={i} style={{ opacity: m.present ? 1 : 0.45 }}>
              <td>{MONTH_NAMES[i]}</td>
              <td>{m.present ? (m.text ? <span className="warnchip" title="نص في خانة رقمية — يُحسب 0">{m.text}</span> : m.visits) : '—'}</td>
              <td>{m.present ? m.total : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ margin: '14px 0 6px' }}>ملاحظات (التقييم السنوي)</h3>
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== emp.notes && commit('ملاحظة موظف', (m) => setMainNote(m, emp.code, note))} aria-label="ملاحظات الموظف" />
    </Drawer>
  );
}

/** Add / edit an employee. The code is the primary key: it can never duplicate another employee. */
export function EmployeeForm({ model, emp, onClose }: { model: AppModel; emp?: EmployeeRow; onClose: () => void }) {
  const asOf = useStore((s) => s.asOf);
  const editing = !!emp;
  const asOfMonth = Number(asOf.slice(5, 7)) || 1;
  const [f, setF] = useState({
    code: emp ? String(emp.code) : '', name: emp?.name ?? '', sector: emp?.sector ?? '', gov: emp?.gov ?? '', job: emp?.job ?? '',
    join: typeof emp?.join === 'number' ? serialToISO(emp.join, model.date1904) : '', month: emp?.firstMonth ?? asOfMonth,
  });
  const [scope, setScope] = useState<'all' | 'first'>('all');
  const set = (k: string, v: string | number) => setF({ ...f, [k]: v });

  const codeTxt = f.code.trim();
  const codeNum = /^\d+$/.test(codeTxt) ? Number(codeTxt) : NaN;
  const clash = !!codeTxt && model.months.some((r) => String(r.code).trim() === codeTxt && String(r.code) !== String(emp?.code));
  const errors: string[] = [];
  if (!codeTxt) errors.push('الكود مطلوب');
  else if (!Number.isInteger(codeNum) || codeNum <= 0) errors.push('الكود يجب أن يكون أرقاماً فقط');
  else if (clash) errors.push(`الكود ${codeTxt} مسجل بالفعل لموظف آخر`);
  if (!f.name.trim()) errors.push('اسم الموظف مطلوب');
  const joinWarn = f.join && f.join > new Date().toISOString().slice(0, 10) ? 'تاريخ الالتحاق في المستقبل' : '';

  const save = () => {
    if (errors.length) return;
    const join = f.join ? isoToSerial(f.join, model.date1904) : null;
    const ok = commit(editing ? 'تعديل موظف' : 'إضافة موظف', (m) => {
      if (!emp) return addEmployee(m, { code: codeNum, name: f.name, sector: f.sector, gov: f.gov, job: f.job, join, month: f.month });
      let x = editIdentity(m, emp.code, { sector: f.sector, gov: f.gov, name: f.name.trim(), job: f.job, join }, scope);
      if (String(emp.code) !== String(codeNum)) x = changeEmployeeCode(x, emp.code, codeNum);
      return x;
    });
    if (ok) { toast(editing ? 'تم حفظ بيانات الموظف' : `تمت إضافة ${f.name}`, 'ok', true); onClose(); }
  };

  return (
    <Modal title={editing ? `تعديل بيانات: ${emp!.name}` : 'إضافة موظف جديد'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="form">
          <Field label="الكود (المفتاح الأساسي)"><input type="text" inputMode="numeric" value={f.code} onChange={(e) => set('code', e.target.value)} autoFocus aria-label="الكود" /></Field>
          <Field label="اسم الموظف"><input type="text" value={f.name} onChange={(e) => set('name', e.target.value)} aria-label="اسم الموظف" /></Field>
          <Field label="القطاع"><input list="dl-sectors" value={f.sector} onChange={(e) => set('sector', e.target.value)} aria-label="القطاع" /></Field>
          <Field label="المحافظة"><input list="dl-govs" value={f.gov} onChange={(e) => set('gov', e.target.value)} aria-label="المحافظة" /></Field>
          <Field label="الوظيفة"><input type="text" value={f.job} onChange={(e) => set('job', e.target.value)} aria-label="الوظيفة" /></Field>
          <Field label="تاريخ الالتحاق" issues={joinWarn ? [{ level: 'warn', message: joinWarn }] : undefined}><input type="date" value={f.join} onChange={(e) => set('join', e.target.value)} aria-label="تاريخ الالتحاق" /></Field>
          {!editing ? (
            <Field label="يبدأ التقييم من شهر" full>
              <select value={f.month} onChange={(e) => set('month', Number(e.target.value))} aria-label="شهر البداية">{MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select>
            </Field>
          ) : (
            <Field label="نطاق التعديل" full>
              <select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'first')} aria-label="نطاق التعديل">
                <option value="all">كل الشهور التي ظهر فيها الموظف (موصى به)</option>
                <option value="first">شهر أول ظهور فقط ({MONTH_NAMES[emp!.firstMonth - 1]})</option>
              </select>
            </Field>
          )}
        </div>
        {errors.length > 0 && (codeTxt || f.name) && <ul className="issuelist" style={{ marginTop: 12 }}>{errors.map((e) => <li key={e} className="error">{e}</li>)}</ul>}
        <p className="note">{editing ? 'الشيت الرئيسي يأخذ البيانات الوظيفية من أول شهر ظهر فيه الكود، ولذلك تُكتب في الشهور عند التصدير.' : 'يُنشأ للموظف صف في الشهر المختار، وتُدخَل الزيارات والتقييمات من صفحة «التقييم الشهري».'}</p>
        <div className="actions">
          <button type="submit" className="btn primary" disabled={errors.length > 0}>{editing ? 'حفظ التعديلات' : 'إضافة الموظف'}</button>
          <button type="button" className="btn" onClick={onClose}>إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}
