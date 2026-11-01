import { useMemo, useState } from 'react';
import { monthTotal, num } from '../domain/calc';
import { GRADE_BASE, GRADE_COLORS, MONTH_NAMES } from '../domain/constants';
import { fmtSerial, isoToSerial, serialToISO } from '../domain/dates';
import { editIdentity, setMainNote } from '../domain/model';
import { buildRoster, recordIn } from '../domain/roster';
import type { AppModel, EmployeeRow, Grade } from '../domain/types';
import { Drawer, Empty, Field, GradeChip, Modal, TextCell } from './kit';
import { commit, toast, useStore } from './store';

type SortKey = keyof Pick<EmployeeRow, 'index' | 'sector' | 'gov' | 'name' | 'code' | 'join' | 'job' | 'visits' | 'points' | 'grade' | 'monthsSince'>;
const GRADE_ORDER: Grade[] = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'];

const COLS: Array<{ key: SortKey; label: string }> = [
  { key: 'index', label: 'الرقم' }, { key: 'sector', label: 'القطاع' }, { key: 'gov', label: 'المحافظة' }, { key: 'name', label: 'اسم الموظف' },
  { key: 'code', label: 'الكود' }, { key: 'join', label: 'تاريخ الالتحاق' }, { key: 'job', label: 'الوظيفة' }, { key: 'visits', label: 'عدد الزيارات السنوي' },
  { key: 'points', label: 'إجمالي النقاط' }, { key: 'grade', label: 'الدرجة' }, { key: 'monthsSince', label: 'عدد أشهر الالتحاق' },
];

export function AnnualPage({ model }: { model: AppModel }) {
  const asOf = useStore((s) => s.asOf);
  const roster = useMemo(() => buildRoster(model, asOf), [model, asOf]);
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [gov, setGov] = useState('');
  const [grade, setGrade] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'index', dir: 1 });
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const f = roster.rows.filter((r) =>
      (!q || r.name.includes(q.trim()) || String(r.code).includes(q.trim())) &&
      (!sector || r.sector === sector) && (!gov || r.gov === gov) && (!grade || r.grade === grade));
    const gi = (g: Grade) => GRADE_ORDER.indexOf(g);
    return [...f].sort((a, b) => {
      const k = sort.key;
      let c: number;
      if (k === 'grade') c = gi(a.grade) - gi(b.grade);
      else if (k === 'join') c = num(a.join as number) - num(b.join as number);
      else { const x = a[k], y = b[k]; c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ar'); }
      return c * sort.dir;
    });
  }, [roster, q, sector, gov, grade, sort]);

  const dist = GRADE_ORDER.map((g) => [g, roster.rows.filter((r) => r.grade === g).length] as const);
  const totalVisits = roster.rows.reduce((a, r) => a + r.visits, 0);
  const sectors = [...new Set(roster.rows.map((r) => r.sector).filter(Boolean))];
  const govs = [...new Set(roster.rows.map((r) => r.gov).filter(Boolean))];
  const openEmp = roster.rows.find((r) => String(r.code) === open);

  return (
    <>
      <div className="kpis">
        <div className="kpi"><small>عدد الموظفين</small><b>{roster.rows.length}</b><small>من أصل سعة {100}</small></div>
        <div className="kpi"><small>إجمالي الزيارات (سنوي)</small><b>{totalVisits}</b></div>
        <div className="kpi"><small>إجمالي النقاط</small><b>{roster.rows.reduce((a, r) => a + r.points, 0)}</b></div>
        <div className="kpi" style={{ gridColumn: 'span 2' }}><small>توزيع الدرجات</small><div className="dist">{dist.map(([g, n]) => <span key={g} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><GradeChip grade={g} /><b style={{ fontSize: 16 }}>{n}</b></span>)}</div></div>
      </div>
      {roster.overflow > 0 && <div className="banner err">تجاوز عدد الموظفين سعة الشيت ({roster.overflow} موظف لن يظهروا في ملف Excel).</div>}

      <div className="card">
        <h2>مفتاح الدرجات (كامل) <span className="note">— بتاريخ {asOf}</span></h2>
        <div className="legend">
          {[['ممتاز', `${GRADE_BASE.vgood} فأكثر`], ['جيد جداً', `من ${GRADE_BASE.good} إلى ${GRADE_BASE.vgood - 1}`], ['جيد', `من ${GRADE_BASE.ok} إلى ${GRADE_BASE.good - 1}`], ['مقبول', `من ${GRADE_BASE.poor} إلى ${GRADE_BASE.ok - 1}`], ['ضعيف', `أقل من ${GRADE_BASE.poor}`]].map(([g, r]) => (
            <div key={g}><GradeChip grade={g} /><span>{r} نقطة</span></div>
          ))}
        </div>
        <p className="note" style={{ marginBottom: 0 }}>تُضرب الحدود في نسبة مدة الخدمة: حتى 3 أشهر ×25٪ · حتى 6 أشهر ×50٪ · حتى 9 أشهر ×75٪ · بعدها ×100٪. شهر الخدمة = 30 يوماً: (تاريخ اليوم − تاريخ الالتحاق) ÷ 30 ثم الجزء الصحيح. هذا المفتاح أكمل من المفتاح المطبوع في الشيت (الذي ينقصه «ضعيف» ولا يوضح التدرج).</p>
      </div>

      <div className="filters">
        <input type="search" placeholder="بحث بالاسم أو الكود…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" style={{ minWidth: 220 }} />
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="القطاع"><option value="">كل القطاعات</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={gov} onChange={(e) => setGov(e.target.value)} aria-label="المحافظة"><option value="">كل المحافظات</option>{govs.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="الدرجة"><option value="">كل الدرجات</option>{GRADE_ORDER.map((s) => <option key={s}>{s}</option>)}</select>
        <span className="note">{rows.length} / {roster.rows.length}</span>
        <button className="btn sm" onClick={() => window.print()}>طباعة</button>
      </div>

      <div className="tablewrap">
        {rows.length === 0 ? <Empty>لا يوجد موظفون مطابقون. الموظفون يُستنتجون تلقائياً من الشيتات الشهرية.</Empty> : (
          <table className="grid cards">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} className="sortable" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    {c.label} {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}
                  </th>
                ))}
                <th style={{ minWidth: 200 }}>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.code)} className="clickable" onClick={() => setOpen(String(r.code))}>
                  <td className="c" data-label="الرقم">{r.index}</td>
                  <td data-label="القطاع">{r.sector}</td>
                  <td data-label="المحافظة" style={{ whiteSpace: 'nowrap' }}>{r.gov}</td>
                  <td className="name" data-label="الاسم">{r.name}</td>
                  <td className="c" data-label="الكود">{r.code}</td>
                  <td className="c" data-label="تاريخ الالتحاق">{fmtSerial(r.join, model.date1904)}</td>
                  <td data-label="الوظيفة">{r.job}</td>
                  <td className="c" data-label="الزيارات">{r.visits}</td>
                  <td className="c" data-label="النقاط"><b>{r.points}</b></td>
                  <td className="c" data-label="الدرجة"><GradeChip grade={r.grade} /></td>
                  <td className="c" data-label="أشهر الالتحاق" title={`${r.monthsSince.toFixed(2)} (مخزن كرقم عشري)`}>{Math.round(r.monthsSince)}</td>
                  <td data-label="ملاحظات" onClick={(e) => e.stopPropagation()}>
                    <TextCell value={r.notes} onCommit={(v) => commit('ملاحظة موظف', (m) => setMainNote(m, r.code, v))} width={200} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="note">«عدد أشهر الالتحاق» يُعرض كعدد صحيح (يقرّبه Excel للعرض فقط)، والدرجة تعتمد على الجزء الصحيح (INT) من القيمة العشرية.</p>
      {openEmp && <EmployeeDrawer model={model} emp={openEmp} onClose={() => setOpen(null)} />}
    </>
  );
}

function EmployeeDrawer({ model, emp, onClose }: { model: AppModel; emp: EmployeeRow; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const key = String(emp.code);
  const monthly = MONTH_NAMES.map((_, i) => {
    const rec = recordIn(model, i + 1, key);
    return { present: !!rec, visits: rec ? num(rec.visits) : 0, total: rec ? monthTotal(rec) : 0, text: rec && typeof rec.visits === 'string' ? rec.visits : '' };
  });
  const max = Math.max(1, ...monthly.map((m) => m.total));
  return (
    <Drawer onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ flex: 1 }}>{emp.name}</h2>
        <GradeChip grade={emp.grade} />
        <button className="btn sm" onClick={onClose} aria-label="إغلاق">✕</button>
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
      <p><button className="btn sm" onClick={() => setEditing(true)}>تعديل بيانات الموظف</button></p>
      <h3 style={{ margin: '14px 0 6px' }}>إجمالي النقاط الشهري</h3>
      <svg viewBox="0 0 360 140" role="img" aria-label="مخطط الإجمالي الشهري" style={{ width: '100%', background: '#fafcff', border: '1px solid var(--line)', borderRadius: 8 }}>
        {monthly.map((m, i) => {
          const h = (m.total / max) * 90;
          const x = 355 - (i + 1) * 29;
          return (
            <g key={i}>
              <rect x={x} y={105 - h} width={20} height={h} rx={3} fill={m.present ? '#2E75B6' : '#cfd6e4'}><title>{MONTH_NAMES[i]}: {m.total}</title></rect>
              <text x={x + 10} y={100 - h} fontSize="9" textAnchor="middle" fill="#1B3A6B">{m.present ? m.total : ''}</text>
              <text x={x + 10} y={120} fontSize="8" textAnchor="middle" fill="#5b6577">{MONTH_NAMES[i].slice(0, 3)}</text>
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
      {editing && <IdentityModal model={model} emp={emp} onClose={() => setEditing(false)} />}
    </Drawer>
  );
}

export function IdentityModal({ model, emp, onClose }: { model: AppModel; emp: EmployeeRow; onClose: () => void }) {
  const [f, setF] = useState({
    sector: emp.sector, gov: emp.gov, name: emp.name, job: emp.job,
    join: typeof emp.join === 'number' ? serialToISO(emp.join, model.date1904) : '',
  });
  const [scope, setScope] = useState<'all' | 'first'>('all');
  const save = () => {
    if (!f.name.trim()) return toast('الاسم مطلوب', 'err');
    const ok = commit('تعديل بيانات موظف', (m) => editIdentity(m, emp.code, {
      sector: f.sector, gov: f.gov, name: f.name, job: f.job,
      join: f.join ? isoToSerial(f.join, m.date1904) : null,
    }, scope));
    if (ok) { toast('تم تحديث البيانات الوظيفية', 'ok', true); onClose(); }
  };
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  return (
    <Modal title={`تعديل بيانات: ${emp.name}`} onClose={onClose}>
      <div className="form">
        <Field label="القطاع"><input list="dl-sectors" value={f.sector} onChange={(e) => set('sector', e.target.value)} /></Field>
        <Field label="المحافظة"><input list="dl-govs" value={f.gov} onChange={(e) => set('gov', e.target.value)} /></Field>
        <Field label="اسم الموظف"><input type="text" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="الوظيفة"><input type="text" value={f.job} onChange={(e) => set('job', e.target.value)} /></Field>
        <Field label="تاريخ الالتحاق"><input type="date" value={f.join} onChange={(e) => set('join', e.target.value)} /></Field>
        <Field label="نطاق التعديل">
          <select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'first')}>
            <option value="all">كل الشهور التي ظهر فيها الكود (موصى به)</option>
            <option value="first">شهر أول ظهور فقط ({MONTH_NAMES[emp.firstMonth - 1]})</option>
          </select>
        </Field>
      </div>
      <p className="note">الشيت الرئيسي يأخذ البيانات الوظيفية من أول شهر ظهر فيه الكود؛ لذلك يُعاد كتابتها في خلايا الشيتات الشهرية عند التصدير.</p>
      <div className="actions"><button className="btn primary" onClick={save}>حفظ</button><button className="btn" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}
void GRADE_COLORS;
