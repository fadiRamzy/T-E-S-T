import { useMemo } from 'react';
import { GRADE_BASE } from '../domain/constants';
import { fmtSerial } from '../domain/dates';
import { revertCorrection } from '../domain/model';
import { buildRoster } from '../domain/roster';
import type { AppModel } from '../domain/types';
import { Icon } from './icons';
import { CountUp, GradeChip } from './kit';
import { commit, useStore } from './store';

const TOP_N = 10;
const GRADE_KEY: Array<[string, string]> = [
  ['ممتاز', `${GRADE_BASE.vgood} فأكثر`], ['جيد جداً', `${GRADE_BASE.good} – ${GRADE_BASE.vgood - 1}`], ['جيد', `${GRADE_BASE.ok} – ${GRADE_BASE.good - 1}`],
  ['مقبول', `${GRADE_BASE.poor} – ${GRADE_BASE.ok - 1}`], ['ضعيف', `أقل من ${GRADE_BASE.poor}`],
];

export function DashboardPage({ model }: { model: AppModel }) {
  const asOf = useStore((s) => s.asOf);
  const roster = useMemo(() => buildRoster(model, asOf), [model, asOf]);
  const rows = roster.rows;
  const totalVisits = rows.reduce((a, r) => a + r.visits, 0);
  const top = useMemo(() => [...rows].sort((a, b) => b.points - a.points).slice(0, TOP_N), [rows]);

  return (
    <div className="dashboard-page">
      <div className="pagehead dashboard-head">
        <div>
          <p className="eyebrow">نظرة عامة</p>
          <h1>لوحة المؤشرات</h1>
          <p className="sub">ملخص الأداء السنوي والمؤشرات الرئيسية للموظفين.</p>
        </div>
      </div>

      {model.appliedCorrections.map((c) => (
        <div key={c.id} className="banner warn" role="status">
          <Icon name="alert" />
          <div>
            <b>تصحيح بيانات معتمد:</b> تاريخ التحاق الموظف {c.code} عُدِّل من {fmtSerial(c.from, model.date1904)} إلى {fmtSerial(c.to, model.date1904)}.{' '}
            <button className="btn sm ghost" onClick={() => commit('إلغاء تصحيح', (m) => revertCorrection(m, c))}>تراجع عن التصحيح</button>
          </div>
        </div>
      ))}
      {roster.overflow > 0 && <div className="banner err"><Icon name="alert" /><div>تجاوز عدد الموظفين سعة الشيت ({roster.overflow} موظف لن يظهروا في ملف Excel).</div></div>}

      <section className="kpis" aria-label="المؤشرات الرئيسية">
        <div className="kpi"><div className="kpi-ic"><Icon name="chart" /></div><div className="kpi-body"><small>إجمالي الزيارات السنوي</small><b><CountUp value={totalVisits} /></b></div></div>
        <div className="kpi"><div className="kpi-ic"><Icon name="users" /></div><div className="kpi-body"><small>عدد الموظفين</small><b><CountUp value={rows.length} /></b></div></div>
      </section>

      <div className="twocol dashboard-grid">
        <section className="card">
          <div className="card-head"><h2>الأعلى نقاطاً</h2><span className="muted small">أفضل {TOP_N} موظفين</span></div>
          {top.length === 0 ? <div className="empty">لا توجد بيانات</div> : (
            <ol className="rank">{top.map((r, i) => <li key={String(r.code)}><span className="n">{i + 1}</span><span className="nm">{r.name}</span><GradeChip grade={r.grade} /><span className="pt">{r.points}</span></li>)}</ol>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>مفتاح الدرجات</h2><span className="muted small">مرجع احتساب التقدير</span></div>
          <div className="legend">
            {GRADE_KEY.map(([g, r]) => <div key={g}><GradeChip grade={g} /><span>{r}</span></div>)}
          </div>
        </section>
      </div>
    </div>
  );
}
