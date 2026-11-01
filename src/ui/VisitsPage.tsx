import { MONTH_NAMES, CAP } from '../domain/constants';
import { num } from '../domain/calc';
import { addVisitRow, deleteVisitRow, updateVisitRow } from '../domain/model';
import { normName } from '../domain/quality';
import { buildRoster } from '../domain/roster';
import type { AppModel } from '../domain/types';
import { CellInput, Empty, TextCell } from './kit';
import { commit, confirmDialog, toast } from './store';

export function VisitsPage({ model }: { model: AppModel }) {
  const roster = buildRoster(model).rows;
  const names = new Set(roster.map((r) => normName(r.name)));
  const exact = new Set(roster.map((r) => r.name));
  const rowTotal = (i: number) => model.visits[i].months.reduce<number>((a, x) => a + num(x), 0);
  const grand = model.visits.reduce((a, _v, i) => a + rowTotal(i), 0);
  const colTotals = MONTH_NAMES.map((_, mi) => model.visits.reduce((a, v) => a + num(v.months[mi]), 0));

  const add = () => commit('إضافة صف زيارات', (m) => addVisitRow(m, { no: m.visits.length + 1, name: '', area: '', months: Array(12).fill(null) }));
  const del = async (i: number) => {
    const v = model.visits[i];
    if (await confirmDialog(`حذف «${v.name || 'الصف'}» من لوحة الزيارات؟`, { danger: true, okLabel: 'حذف', detail: 'تُزاح الصفوف التالية لأعلى وتُفرَّغ الخلايا الأخيرة في Excel.' }))
      if (commit('حذف صف زيارات', (m) => deleteVisitRow(m, i))) toast('تم الحذف', 'ok', true);
  };

  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(135deg,#1B3A6B,#2E75B6)', color: '#fff' }}>
        <h2 style={{ color: '#fff', marginBottom: 2 }}>لوحة متابعة الأداء — محافظة بني سويف والفيوم 2026</h2>
        <div style={{ opacity: .85 }}>المدير المباشر: فادي عادل · ملخص زيارات الموظفين</div>
      </div>
      <div className="filters">
        <button className="btn primary" onClick={add} disabled={model.visits.length >= CAP.visitMax}>+ إضافة موظف</button>
        <span className="note">جدول يدوي مستقل (غير مرتبط بالشيتات الشهرية) — الأسماء هنا هي المفتاح وليس الكود. النص (مثل «مستقيل») يُحفظ ويُحسب 0.</span>
        <button className="btn sm" onClick={() => window.print()}>طباعة</button>
      </div>
      <div className="tablewrap">
        {model.visits.length === 0 ? <Empty>لا توجد صفوف بعد.</Empty> : (
          <table className="grid">
            <thead><tr><th>#</th><th className="sticky1">اسم الموظف</th><th>المنطقة</th>{MONTH_NAMES.map((m) => <th key={m}>{m}</th>)}<th style={{ background: '#4b6b2a' }}>إجمالي الزيارات</th><th /></tr></thead>
            <tbody>
              {model.visits.map((v, i) => {
                const mismatch = v.name && !exact.has(v.name) ? (names.has(normName(v.name)) ? 'إملاء الاسم يختلف عن الشيت الرئيسي' : 'الاسم غير موجود في الشيت الرئيسي (لم يُربط تلقائياً)') : '';
                return (
                  <tr key={v.row}>
                    <td className="c"><CellInput value={v.no} onCommit={(x) => commit('تعديل زيارات', (m) => updateVisitRow(m, i, { ...v, no: x }))} width={42} /></td>
                    <td className="name sticky1" style={{ minWidth: 190 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TextCell value={v.name} width={170} onCommit={(x) => commit('تعديل زيارات', (m) => updateVisitRow(m, i, { ...v, name: x }))} />
                        {mismatch && <span className="warnchip" title={mismatch}>!</span>}
                      </div>
                    </td>
                    <td><TextCell value={v.area} width={90} onCommit={(x) => commit('تعديل زيارات', (m) => updateVisitRow(m, i, { ...v, area: x }))} /></td>
                    {v.months.map((c, mi) => (
                      <td key={mi}><CellInput value={c} width={46} title={typeof c === 'string' ? 'نص — يُحسب 0' : MONTH_NAMES[mi]}
                        onCommit={(x) => commit('تعديل زيارات', (m) => updateVisitRow(m, i, { ...v, months: v.months.map((y, j) => (j === mi ? x : y)) }))} /></td>
                    ))}
                    <td className="c" style={{ background: '#f5f7e9', fontWeight: 700 }}>{rowTotal(i)}</td>
                    <td><button className="btn sm danger" onClick={() => del(i)}>حذف</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'end', fontWeight: 700, color: '#002060' }}>اجمالي الزيارات عن العام</td>
                {colTotals.map((t, i) => <td key={i} className="c note">{t}</td>)}
                <td className="c" style={{ background: '#ffffcc', fontWeight: 800, fontSize: 16 }}>{grand}</td><td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
