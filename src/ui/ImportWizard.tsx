import { useMemo, useState } from 'react';
import { planMerge, type Strategy } from '../domain/merge';
import { MONTH_NAMES } from '../domain/constants';
import type { AppModel } from '../domain/types';
import type { Analysis } from '../xlsx/import';
import { Icon } from './icons';
import { Modal, Pagination, slicePage } from './kit';
import { applyImport, toast } from './store';

const ST = { ok: '✓', warn: '!', missing: '–', error: '✕' } as const;
const KIND = { new: 'جديد', updated: 'تحديث', removed: 'حذف', kept: 'محفوظ' } as const;

const STRATEGIES: Array<{ id: Strategy; title: string; text: string }> = [
  { id: 'merge', title: 'دمج وتحديث (موصى به)', text: 'تُطابَق السجلات بالكود والشهر: يُضاف الجديد، وتُحدَّث بيانات الموجود بقيم الملف، ويبقى ما ليس في الملف كما هو.' },
  { id: 'add-only', title: 'إضافة الجديد فقط', text: 'تُضاف الأكواد/السجلات غير الموجودة فقط، ولا يتغير أي سجل موجود في التطبيق.' },
  { id: 'replace', title: 'استبدال كامل', text: 'تُستبدل بيانات التطبيق بالكامل بمحتوى الملف (يمكن التراجع بعدها).' },
];

/** Preview → strategy → explicit confirmation. Nothing touches the app data before the confirm button. */
export function ImportWizard({ analysis, current, onClose, onDone }: { analysis: Analysis; current: AppModel | null; onClose: () => void; onDone: () => void }) {
  const [strategy, setStrategy] = useState<Strategy>('merge');
  const [removeMissing, setRemoveMissing] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const hasData = !!current && current.months.length > 0;
  const plan = useMemo(
    () => planMerge(hasData ? current : null, analysis.model, { strategy: hasData ? strategy : 'replace', removeMissing: hasData && strategy !== 'replace' && removeMissing }),
    [analysis, current, hasData, strategy, removeMissing],
  );
  const errors = analysis.issues.filter((i) => i.level === 'error');
  const others = analysis.issues.filter((i) => i.level !== 'error');
  const s = plan.stats;
  const changes = plan.changes.filter((c) => c.kind !== 'kept');
  const monthsWithData = analysis.counts.filter((c) => c.records > 0).length;
  const employees = new Set(analysis.model.months.map((r) => String(r.code ?? '')).filter(Boolean)).size;

  const apply = async () => {
    setBusy(true);
    try {
      await applyImport(plan.model, { bytes: analysis.templateBytes, name: analysis.fileName, hash: analysis.hash, importedAt: Date.now() }, 'استيراد ملف Excel');
      toast(hasData ? `تم الاستيراد: ${s.added} جديد، ${s.updated} محدَّث، ${s.removed} محذوف` : `تم الاستيراد: ${employees} موظف`, 'ok', hasData);
      if (analysis.model.appliedCorrections.length) toast('طُبّق تصحيح تاريخ التحاق معتمد منك — راجع لوحة المؤشرات', 'info');
      onDone();
    } catch (e) {
      toast(`تعذّر تطبيق الاستيراد: ${(e as Error).message}`, 'err');
    } finally { setBusy(false); }
  };

  return (
    <Modal title="معاينة الاستيراد" onClose={onClose} wide>
      <div className="steps"><span className="step on"><i>1</i>اختيار الملف</span><span className="step on"><i>2</i>المعاينة والاستراتيجية</span><span className="step"><i>3</i>التأكيد</span></div>
      <p style={{ margin: '0 0 10px' }}><b dir="auto">{analysis.fileName}</b> <span className="note">· صيغة {analysis.format === 'xls' ? 'xls القديمة (تُحوَّل إلى xlsx للتصدير)' : 'xlsx'} · {analysis.layout.reports.length} شيت</span></p>

      {errors.length > 0 && (
        <>
          <div className="banner err" role="alert"><Icon name="alert" /><div><b>لا يمكن استيراد هذا الملف:</b> ينقصه ما يلي (لم يُغيَّر أي شيء في بياناتك).</div></div>
          <ul className="issuelist">{errors.map((e, i) => <li key={i} className="error">{e.message}</li>)}</ul>
          <p className="note">يُتعرَّف على الشيتات بأسمائها أو بمحتواها، وعلى الأعمدة بعناوينها، لذا يكفي أن يحتوي كل شيت شهري على أعمدة: الكود، اسم الموظف، عمود الزيارات (عنوانه اسم الشهر)، ثم 8 أعمدة تقييم، ثم الإجمالي.</p>
          <div className="actions"><button className="btn" onClick={onClose}>إغلاق</button></div>
        </>
      )}

      {errors.length === 0 && (
        <>
          <div className="stats">
            <div className="stat"><b>{employees}</b><small>موظف في الملف</small></div>
            <div className="stat"><b>{analysis.model.months.length}</b><small>سجل شهري</small></div>
            <div className="stat"><b>{monthsWithData}</b><small>شهر به بيانات</small></div>
            <div className="stat"><b>{analysis.ignored.length}</b><small>صف مكرر تم تجاهله</small></div>
          </div>

          <h3 style={{ margin: '8px 0 4px' }}>ما تم التعرف عليه في الملف</h3>
          {(() => {
            const row = (r: Analysis['layout']['reports'][number], i: number) => (
              <div key={i}><span className={`st ${r.status}`} aria-hidden>{ST[r.status]}</span><b>{r.sheet}{r.rows !== undefined ? ` · ${r.rows}` : ''}</b><span className="note">{r.detail}</span></div>
            );
            const reps = analysis.layout.reports;
            const months = reps.filter((r) => r.kind === 'month');
            const okMonths = months.length > 0 && months.every((r) => r.status === 'ok');
            return (
              <div className="sheetrep">
                {reps.filter((r) => !okMonths || r.kind !== 'month').map(row)}
                {okMonths && (
                  <details style={{ padding: '6px 0' }}>
                    <summary><span className="st ok" style={{ display: 'inline-grid', marginInlineEnd: 8 }} aria-hidden>✓</span><b>{months.length} شيتاً شهرياً</b> <span className="note">— تم التعرف على الأعمدة في كلها (اضغط للتفاصيل)</span></summary>
                    {months.map(row)}
                  </details>
                )}
              </div>
            );
          })()}

          {others.length > 0 && (
            <>
              <h3 style={{ margin: '14px 0 6px' }}>تنبيهات</h3>
              <ul className="issuelist">{others.map((e, i) => <li key={i} className={e.level}>{e.message}</li>)}</ul>
            </>
          )}
          {analysis.ignored.length > 0 && (
            <details style={{ marginTop: 10 }}><summary>الصفوف المكررة المتجاهلة ({analysis.ignored.length})</summary>
              <ul className="issuelist" style={{ marginTop: 6 }}>{analysis.ignored.slice(0, 50).map((x, i) => <li key={i} className="warn">{x.sheet} · صف {x.row} · كود {x.code}: {x.reason}</li>)}</ul>
            </details>
          )}
          {analysis.model.appliedCorrections.length > 0 && <div className="banner warn" style={{ marginTop: 12 }}><Icon name="alert" /><div>سيُطبَّق تصحيح تاريخ الالتحاق المعتمد منك (الكود 1001523) — ويظل ظاهراً وقابلاً للتراجع.</div></div>}

          <h3 style={{ margin: '16px 0 8px' }}>طريقة الاستيراد</h3>
          {hasData ? (
            <>
              {STRATEGIES.map((o) => (
                <label key={o.id} className={`opt ${strategy === o.id ? 'on' : ''}`}>
                  <input type="radio" name="strategy" checked={strategy === o.id} onChange={() => setStrategy(o.id)} />
                  <span><b>{o.title}</b><span className="note">{o.text}</span></span>
                </label>
              ))}
              <label className="opt" style={{ opacity: strategy === 'replace' ? 0.5 : 1 }}>
                <input type="checkbox" checked={removeMissing || strategy === 'replace'} disabled={strategy === 'replace'} onChange={(e) => setRemoveMissing(e.target.checked)} />
                <span><b>حذف السجلات غير الموجودة في الملف</b><span className="note">اختياري. غير مفعّل افتراضياً حتى لا يُحذف أي موظف بالخطأ.</span></span>
              </label>
            </>
          ) : <p className="note">لا توجد بيانات حالية في التطبيق، لذلك سيُستورد محتوى الملف كما هو.</p>}

          <div className="stats">
            <div className="stat"><b>{s.added}</b><small>سجلات جديدة</small></div>
            {hasData && <div className="stat"><b>{s.updated}</b><small>سجلات ستُحدَّث</small></div>}
            {hasData && <div className="stat"><b>{s.unchanged}</b><small>دون تغيير</small></div>}
            {hasData && <div className="stat"><b>{s.kept}</b><small>باقية (ليست في الملف)</small></div>}
            {hasData && <div className="stat"><b>{s.removed}</b><small>ستُحذف</small></div>}
            <div className="stat"><b>{s.newEmployees}</b><small>موظف جديد</small></div>
            {hasData && <div className="stat"><b>{s.removedEmployees}</b><small>موظف سيُحذف بالكامل</small></div>}
          </div>
          {s.dropped > 0 && <div className="banner err"><Icon name="alert" /><div>{s.dropped} سجل لن يجد صفاً فارغاً في الشهر (السعة {50}) وسيُهمل.</div></div>}

          {hasData && changes.length > 0 && (
            <>
              <h3 style={{ margin: '8px 0 6px' }}>تفاصيل التغييرات</h3>
              <div className="tablewrap" style={{ maxHeight: 280 }}>
                <table className="mini">
                  <thead><tr><th>النوع</th><th>الشهر</th><th>الكود</th><th>الاسم</th><th>الحقول المتغيرة</th></tr></thead>
                  <tbody>{slicePage(changes, page, 8).map((c, i) => (
                    <tr key={i}><td><span className={`tagk ${c.kind}`}>{KIND[c.kind]}</span></td><td>{MONTH_NAMES[c.month - 1]}</td><td>{c.code}</td><td>{c.name}</td><td className="diff">{c.fields.join('، ')}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <Pagination total={changes.length} page={page} size={8} onPage={setPage} sizes={[8]} />
            </>
          )}

          <p className="note">الشيتات «الاجازات والاذونات» و«الزيارات الميدانية» غير مدعومة: تُتجاهل عند الاستيراد وتُحذف من ملف Excel المُصدَّر.</p>
          <div className="actions">
            <button className="btn primary" disabled={busy} onClick={apply} data-testid="confirm-import"><Icon name="upload" /> تأكيد وتطبيق الاستيراد</button>
            <button className="btn" onClick={onClose}>إلغاء</button>
          </div>
        </>
      )}
    </Modal>
  );
}
