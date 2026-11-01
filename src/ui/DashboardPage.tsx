import { useMemo } from 'react';
import { GRADE_BASE, GRADE_COLORS } from '../domain/constants';
import { fmtSerial } from '../domain/dates';
import { computeQuality } from '../domain/quality';
import { buildRoster } from '../domain/roster';
import type { AppModel, Grade } from '../domain/types';
import { Icon } from './icons';
import { GradeChip } from './kit';
import { useStore } from './store';

const GRADES: Grade[] = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'];

export function DashboardPage({ model, go }: { model: AppModel; go: (p: 'employees' | 'files') => void }) {
  const asOf = useStore((s) => s.asOf);
  const roster = useMemo(() => buildRoster(model, asOf), [model, asOf]);
  const quality = useMemo(() => computeQuality(model, asOf), [model, asOf]);
  const rows = roster.rows;
  const totalVisits = rows.reduce((a, r) => a + r.visits, 0);
  const totalPoints = rows.reduce((a, r) => a + r.points, 0);
  const dist = GRADES.map((g) => [g, rows.filter((r) => r.grade === g).length] as const);
  const maxN = Math.max(1, ...dist.map(([, n]) => n));
  const byPoints = [...rows].sort((a, b) => b.points - a.points);
  const top = byPoints.slice(0, 5);
  const low = byPoints.length > 5 ? byPoints.slice(-5).reverse() : [];
  const attention = quality.filter((q) => q.severity !== 'info').length;

  return (
    <>
      <div className="pagehead">
        <div><h1>لوحة المؤشرات</h1><p>ملخص التقييم السنوي 2026 — بتاريخ احتساب {asOf}</p></div>
      </div>
      {model.appliedCorrections.map((c) => (
        <div key={c.id} className="banner warn" role="status">
          <Icon name="alert" />
          <div>
            <b>تصحيح بيانات معتمد منك:</b> تاريخ التحاق الموظف {c.code} عُدِّل من {fmtSerial(c.from, model.date1904)} إلى {fmtSerial(c.to, model.date1904)}.{' '}
            <button className="btn sm ghost" onClick={() => go('files')}>مراجعة / تراجع</button>
          </div>
        </div>
      ))}
      {roster.overflow > 0 && <div className="banner err"><Icon name="alert" /><div>تجاوز عدد الموظفين سعة الشيت ({roster.overflow} موظف لن يظهروا في ملف Excel).</div></div>}

      <div className="kpis">
        <div className="kpi"><small>عدد الموظفين</small><b>{rows.length}</b><span className="sub">من سعة 100 موظف</span></div>
        <div className="kpi"><small>إجمالي الزيارات السنوي</small><b>{totalVisits}</b></div>
        <div className="kpi"><small>إجمالي النقاط</small><b>{totalPoints}</b></div>
        <div className="kpi"><small>ملاحظات جودة البيانات</small><b>{attention}</b><span className="sub"><button className="btn sm ghost" style={{ padding: 0 }} onClick={() => go('files')}>عرض التفاصيل</button></span></div>
      </div>

      <div className="twocol">
        <div className="card">
          <h2>توزيع الدرجات</h2>
          <div className="bars">
            {dist.map(([g, n]) => (
              <div className="bar" key={g}>
                <GradeChip grade={g} />
                <div className="track"><div className="fill" style={{ width: `${(n / maxN) * 100}%`, background: GRADE_COLORS[g].bg, border: g === 'مقبول' && n > 0 ? '1px solid #d6d600' : undefined }} /></div>
                <b>{n}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>مفتاح الدرجات</h2>
          <div className="legend">
            {[['ممتاز', `${GRADE_BASE.vgood} فأكثر`], ['جيد جداً', `${GRADE_BASE.good} – ${GRADE_BASE.vgood - 1}`], ['جيد', `${GRADE_BASE.ok} – ${GRADE_BASE.good - 1}`], ['مقبول', `${GRADE_BASE.poor} – ${GRADE_BASE.ok - 1}`], ['ضعيف', `أقل من ${GRADE_BASE.poor}`]].map(([g, r]) => (
              <div key={g}><GradeChip grade={g} /><span>{r}</span></div>
            ))}
          </div>
          <p className="note" style={{ marginBottom: 0 }}>الحدود تُضرب في نسبة مدة الخدمة: حتى 3 أشهر ×25٪ · 6 أشهر ×50٪ · 9 أشهر ×75٪ · بعدها ×100٪ (الشهر = 30 يوماً).</p>
        </div>
      </div>

      <div className="twocol" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>الأعلى نقاطاً</h2>
          {top.length === 0 ? <p className="note">لا توجد بيانات.</p> : (
            <ol className="rank">{top.map((r, i) => <li key={String(r.code)}><span className="n">{i + 1}</span><span className="nm">{r.name}</span><GradeChip grade={r.grade} /><span className="pt">{r.points}</span></li>)}</ol>
          )}
        </div>
        <div className="card">
          <h2>الأقل نقاطاً</h2>
          {low.length === 0 ? <p className="note">تظهر القائمة عند وجود أكثر من 5 موظفين.</p> : (
            <ol className="rank">{low.map((r, i) => <li key={String(r.code)}><span className="n">{i + 1}</span><span className="nm">{r.name}</span><GradeChip grade={r.grade} /><span className="pt">{r.points}</span></li>)}</ol>
          )}
        </div>
      </div>
      <p style={{ marginTop: 14 }}><button className="btn" onClick={() => go('employees')}><Icon name="users" /> عرض كل الموظفين</button></p>
    </>
  );
}
