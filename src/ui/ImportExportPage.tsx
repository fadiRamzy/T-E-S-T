import { useMemo, useRef, useState } from 'react';
import { makeBackup, parseBackup } from '../db/db';
import { computeQuality } from '../domain/quality';
import { revertCorrection } from '../domain/model';
import type { AppModel, QualityItem } from '../domain/types';
import seed from '../data/seed.json';
import { exportWorkbook, type ExportSummary } from '../xlsx/export';
import { buildFixtureWorkbook, type Seed } from '../xlsx/fixture';
import { importWorkbook, ImportError } from '../xlsx/import';
import { downloadBlob, Modal } from './kit';
import { commit, confirmDialog, getTemplateBytes, loadImported, markExported, replaceModel, setAsOf, toast, useStore } from './store';

const sevLabel = { error: 'خطأ', warn: 'تنبيه', info: 'معلومة' } as const;

export function QualityPanel({ items }: { items: QualityItem[] }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const shown = items.filter((i) => filter === 'all' || i.severity === filter);
  const count = (s: string) => items.filter((i) => i.severity === s).length;
  return (
    <div className="card">
      <h2>لوحة جودة البيانات <span className="note">— تُعرض للاطلاع فقط ولا يُصحَّح شيء تلقائياً</span></h2>
      <div className="tabs">
        {(['all', 'error', 'warn', 'info'] as const).map((f) => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'الكل' : sevLabel[f]}<small>{f === 'all' ? items.length : count(f)}</small></button>
        ))}
      </div>
      {shown.map((i) => (
        <div key={i.id} className={`qitem ${i.severity}`}>
          <b>{i.title}</b><span>{i.detail}</span>
          {i.where && <div className="note">{i.where}</div>}
        </div>
      ))}
    </div>
  );
}

export function ImportExportPage({ model, onImported }: { model: AppModel | null; onImported?: () => void }) {
  const tpl = useStore((s) => s.template);
  const asOf = useStore((s) => s.asOf);
  const changes = useStore((s) => s.changesSinceExport);
  const lastSaved = useStore((s) => s.lastSaved);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const quality = useMemo(() => (model ? computeQuality(model, asOf) : []), [model, asOf]);

  const doImport = async (file: File) => {
    setErr(null); setWarnings([]);
    if (!/\.xlsx$/i.test(file.name)) return setErr('يُقبل ملف بصيغة .xlsx فقط.');
    if (model && !(await confirmDialog('استبدال البيانات الحالية بمحتوى الملف المرفوع؟', { detail: 'سيصبح هذا الملف هو القالب الأساسي للتصدير. يمكنك التراجع باستيراد نسخة احتياطية JSON فقط إن صدّرتها.', okLabel: 'استبدال', danger: true }))) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await importWorkbook(bytes, { fileName: file.name });
      await loadImported(r.model, { bytes, name: file.name, hash: r.hash, importedAt: Date.now() });
      setWarnings(r.warnings);
      toast(`تم الاستيراد: ${r.model.months.length} صف شهري، ${r.model.visits.length} موظف زيارات، ${r.model.leave.length} سجل إجازة`, 'ok');
      if (r.model.appliedCorrections.length) toast('طُبّق تصحيح تاريخ التحاق معتمد منك — راجع لوحة الجودة', 'info');
      if (!r.warnings.length) onImported?.();
    } catch (e) {
      setErr(e instanceof ImportError || e instanceof Error ? e.message : 'تعذّر الاستيراد');
    } finally { setBusy(false); }
  };

  const loadDemo = async () => {
    if (model && !(await confirmDialog('استبدال البيانات الحالية بالملف التجريبي؟', { danger: true, okLabel: 'استبدال' }))) return;
    setBusy(true); setErr(null);
    try {
      const bytes = await buildFixtureWorkbook(seed as unknown as Seed);
      const r = await importWorkbook(bytes);
      await loadImported(r.model, { bytes, name: 'تقييم_تجريبي.xlsx', hash: r.hash, importedAt: Date.now() });
      toast('تم تحميل المصنف التجريبي (مبني من بيانات الملحق A)', 'ok');
      onImported?.();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const doExport = async () => {
    const bytes = getTemplateBytes();
    if (!model || !bytes || !tpl) return setErr('لا يوجد قالب Excel محفوظ — ارفع ملف المصنف أولاً.');
    setBusy(true); setErr(null);
    try {
      const r = await exportWorkbook(bytes, model, { originalName: tpl.name });
      downloadBlob(r.bytes as unknown as BlobPart, r.fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setSummary(r); markExported();
      toast(`تم التصدير: ${r.fileName}`, 'ok');
    } catch (e) { setErr(`فشل التصدير: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  const importJson = async (f: File) => {
    try {
      const m = parseBackup(await f.text());
      if (!(await confirmDialog('استبدال البيانات الحالية بالنسخة الاحتياطية؟', { danger: true, okLabel: 'استبدال' }))) return;
      if (model) replaceModel('استيراد نسخة احتياطية', m);
      else toast('ارفع ملف Excel أولاً ثم استورد النسخة الاحتياطية.', 'err');
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      {changes >= 20 && <div className="banner warn">⚠ لديك {changes} تعديلاً منذ آخر تصدير. البيانات محفوظة في هذا المتصفح فقط — صدّر ملف Excel الآن.</div>}
      <div className="twocol">
        <div className="card">
          <h2>1) استيراد ملف Excel</h2>
          <div className={`drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) doImport(f); }}>
            <p style={{ marginTop: 0 }}>اسحب ملف <b>.xlsx</b> هنا أو</p>
            <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>اختيار ملف…</button>
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }} />
            <p className="note" style={{ marginBottom: 0 }}>يُحفظ الملف الأصلي كقالب رئيسي للتصدير (تُحفظ كل أجزائه كما هي).</p>
          </div>
          <p><button className="btn sm" disabled={busy} onClick={loadDemo}>تجربة بمصنف تجريبي مُولَّد</button></p>
          {tpl && (
            <dl className="kv">
              <dt>القالب الحالي</dt><dd>{tpl.name}</dd>
              <dt>وقت الاستيراد</dt><dd>{new Date(tpl.importedAt).toLocaleString('ar-EG')}</dd>
              <dt>البصمة SHA-256</dt><dd dir="ltr" style={{ fontSize: 11 }}>{tpl.hash.slice(0, 32)}…</dd>
            </dl>
          )}
        </div>
        <div className="card">
          <h2>2) تصدير ملف Excel محدّث</h2>
          <p className="note" style={{ marginTop: 0 }}>يُعدَّل القالب الأصلي خلايا الإدخال فقط؛ تبقى المعادلات والتنسيقات والقوائم المنسدلة والصور وإعدادات الطباعة كما هي، ويُعاد حساب المعادلات عند فتح الملف في Excel.</p>
          <button className="btn primary" disabled={busy || !tpl} onClick={doExport}>⬇ تصدير Excel</button>
          <div style={{ marginTop: 10 }} className="status"><span className={`dot ${changes ? 'saving' : ''}`} />{changes ? `${changes} تعديل لم يُصدَّر بعد` : 'لا تعديلات غير مصدّرة'}</div>
          {summary && (
            <div className="banner info" style={{ marginTop: 10, display: 'block' }}>
              <b>{summary.fileName}</b><br />
              {summary.totalChanged === 0 ? 'لا تغييرات — الملف مطابق للقالب.' : Object.entries(summary.changedCells).map(([k, v]) => `${k}: ${v} خلية`).join(' · ')}
              {summary.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
          <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>نسخة احتياطية JSON</h3>
          <button className="btn sm" disabled={!model} onClick={() => model && downloadBlob(makeBackup(model), `field-risk-backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json')}>تنزيل نسخة احتياطية</button>{' '}
          <button className="btn sm" disabled={!model} onClick={() => jsonRef.current?.click()}>استعادة من نسخة…</button>
          <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>تاريخ الاحتساب (بديل TODAY())</h3>
          <input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
          <p className="note">يُستخدم لحساب «عدد أشهر الالتحاق» والدرجة داخل التطبيق فقط (افتراضياً اليوم). Excel يستخدم تاريخ فتح الملف.</p>
        </div>
      </div>
      {err && <div className="banner err" role="alert">{err}</div>}
      {warnings.length > 0 && <div className="banner warn" style={{ display: 'block' }}>{warnings.map((w, i) => <div key={i}>{w}</div>)}</div>}

      <div className="card">
        <h2>أين تُخزَّن بياناتي؟</h2>
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          <li>البيانات تُحفظ تلقائياً في <b>IndexedDB</b> داخل هذا المتصفح وعلى هذا الجهاز فقط{lastSaved ? ` (آخر حفظ: ${new Date(lastSaved).toLocaleTimeString('ar-EG')})` : ''}.</li>
          <li>لا تُشارَك بين الأجهزة/المتصفحات، وقد تُمسح عند «مسح بيانات الموقع» أو الوضع الخاص أو ضغط التخزين. لا توجد مزامنة متعددة المستخدمين.</li>
          <li>ملف Excel هو وسيط المزامنة: صدّر بانتظام، وافتح الملف المحدّث على أي جهاز.</li>
          <li>يتطلب Excel 2021/365 لمعادلات XLOOKUP / LET / SEQUENCE؛ قد لا تعمل في LibreOffice أو النسخ الأقدم.</li>
        </ul>
      </div>
      {model && model.appliedCorrections.length > 0 && (
        <div className="card">
          <h2>تصحيحات مُطبَّقة بموافقتك</h2>
          {model.appliedCorrections.map((c) => (
            <div key={c.id} className="banner warn"><span className="grow">{c.reason} — الكود {c.code}</span>
              <button className="btn sm" onClick={() => commit('إلغاء تصحيح', (m) => revertCorrection(m, c))}>إلغاء التصحيح</button></div>
          ))}
        </div>
      )}
      {model && <QualityPanel items={quality} />}
    </>
  );
}
void Modal;
