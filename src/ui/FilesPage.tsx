import { useMemo, useRef, useState } from 'react';
import seed from '../data/seed.json';
import { makeBackup, parseBackup } from '../db/db';
import { revertCorrection } from '../domain/model';
import { computeQuality } from '../domain/quality';
import { fmtSerial } from '../domain/dates';
import type { AppModel } from '../domain/types';
import { exportWorkbook, type ExportSummary } from '../xlsx/export';
import { buildFixtureWorkbook, type Seed } from '../xlsx/fixture';
import { analyzeWorkbook, ImportError, type Analysis } from '../xlsx/import';
import { Icon } from './icons';
import { downloadBlob } from './kit';
import { ImportWizard } from './ImportWizard';
import { QualityPanel } from './QualityPanel';
import { commit, confirmDialog, getTemplateBytes, markExported, replaceModel, setAsOf, toast, useStore } from './store';

export function FilesPage({ model, onImported }: { model: AppModel | null; onImported: () => void }) {
  const tpl = useStore((s) => s.template);
  const asOf = useStore((s) => s.asOf);
  const changes = useStore((s) => s.changesSinceExport);
  const lastSaved = useStore((s) => s.lastSaved);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const quality = useMemo(() => (model ? computeQuality(model, asOf) : []), [model, asOf]);

  const analyze = async (name: string, bytes: Uint8Array) => {
    setErr(null); setSummary(null);
    setBusy(true);
    try {
      setAnalysis(await analyzeWorkbook(bytes, name));
    } catch (e) {
      setErr(e instanceof ImportError || e instanceof Error ? e.message : 'تعذّر قراءة الملف');
    } finally { setBusy(false); }
  };
  const pick = async (file: File) => {
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) return setErr('الصيغ المقبولة: .xlsx أو .xls');
    await analyze(file.name, new Uint8Array(await file.arrayBuffer()));
  };
  const demo = async () => analyze('تقييم_تجريبي.xlsx', await buildFixtureWorkbook(seed as unknown as Seed));

  const doExport = async () => {
    const bytes = getTemplateBytes();
    if (!model || !bytes || !tpl) return setErr('لا يوجد ملف Excel مستورد — استورد ملفاً أولاً.');
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
      if (!model) return toast('استورد ملف Excel أولاً ثم استعد النسخة الاحتياطية.', 'err');
      if (!(await confirmDialog('استبدال البيانات الحالية بالنسخة الاحتياطية؟', { danger: true, okLabel: 'استبدال', detail: 'يمكنك التراجع بعدها بزر «تراجع».' }))) return;
      replaceModel('استعادة نسخة احتياطية', m);
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <div className="pagehead"><div><h1>الملفات</h1><p>استيراد وتصدير ملف Excel، والنسخ الاحتياطية، وجودة البيانات</p></div></div>
      {changes >= 20 && <div className="banner warn"><Icon name="alert" /><div>لديك {changes} تعديلاً منذ آخر تصدير. البيانات محفوظة في هذا المتصفح فقط — صدّر ملف Excel الآن.</div></div>}
      {!model && <div className="banner info"><div>ابدأ باستيراد ملف Excel (أو جرّب المصنف التجريبي) — ستظهر معاينة قبل أي تغيير.</div></div>}
      {err && <div className="banner err" role="alert"><Icon name="alert" /><div>{err}</div></div>}

      <div className="twocol">
        <div className="card">
          <h2>استيراد من Excel</h2>
          <div className={`drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) pick(f); }}>
            <Icon name="upload" />
            <p style={{ margin: '6px 0 10px' }}>اسحب ملف <b>.xlsx</b> أو <b>.xls</b> هنا</p>
            <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>اختيار ملف…</button>
            <input ref={fileRef} data-testid="xlsx-input" type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
            <p className="note" style={{ marginBottom: 0 }}>يُقبل أي ملف يحتوي على الشيتات الشهرية بأعمدتها — لا يشترط تطابق التنسيق أو المعادلات. تظهر معاينة وتأكيد قبل أي تغيير.</p>
          </div>
          <p><button className="btn sm" disabled={busy} onClick={demo}>تجربة بمصنف تجريبي مُولَّد</button></p>
          {tpl && (
            <dl className="kv" style={{ marginBottom: 0 }}>
              <dt>الملف الحالي</dt><dd dir="auto">{tpl.name}</dd>
              <dt>وقت الاستيراد</dt><dd>{new Date(tpl.importedAt).toLocaleString('ar-EG')}</dd>
            </dl>
          )}
        </div>

        <div className="card">
          <h2>تصدير Excel محدّث</h2>
          <p className="note" style={{ marginTop: 0 }}>يُنتج ملفاً يحتوي الشيتات المدعومة فقط (التقييم السنوي، الشهور، Data) مع بقاء المعادلات والتنسيقات والعرض من اليمين لليسار. شيتا الزيارات والإجازات لا يُصدَّران.</p>
          <button className="btn teal" disabled={busy || !tpl} onClick={doExport} data-testid="export-btn"><Icon name="download" /> تصدير Excel</button>
          <div style={{ marginTop: 10 }} className="note">{changes ? `${changes} تعديل لم يُصدَّر بعد` : 'لا تعديلات غير مصدّرة'}</div>
          {summary && (
            <div className="banner ok" style={{ marginTop: 10 }}>
              <div>
                <b dir="auto">{summary.fileName}</b><br />
                {summary.totalChanged === 0 ? 'لم تتغير خلايا الإدخال.' : Object.entries(summary.changedCells).map(([k, v]) => `${k}: ${v} خلية`).join(' · ')}
                {summary.removedSheets.length > 0 && <div>حُذف من الملف: {summary.removedSheets.join('، ')}</div>}
                {summary.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            </div>
          )}
          <h3 style={{ margin: '16px 0 6px' }}>نسخة احتياطية JSON</h3>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn sm" disabled={!model} onClick={() => model && downloadBlob(makeBackup(model), `field-risk-backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json')}>تنزيل نسخة</button>
            <button className="btn sm" disabled={!model} onClick={() => jsonRef.current?.click()}>استعادة من نسخة…</button>
            <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          </div>
          <h3 style={{ margin: '16px 0 6px' }}>تاريخ الاحتساب (بديل TODAY())</h3>
          <input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} style={{ maxWidth: 200 }} aria-label="تاريخ الاحتساب" />
          <p className="note" style={{ marginBottom: 0 }}>لحساب «أشهر الالتحاق» والدرجة داخل التطبيق فقط (افتراضياً اليوم). Excel يستخدم تاريخ فتح الملف.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>أين تُخزَّن بياناتي؟</h2>
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          <li>تُحفظ تلقائياً في <b>IndexedDB</b> داخل هذا المتصفح وعلى هذا الجهاز فقط{lastSaved ? ` (آخر حفظ: ${new Date(lastSaved).toLocaleTimeString('ar-EG')})` : ''}. لا توجد خدمات سحابية.</li>
          <li>لا تُشارَك بين الأجهزة، وقد تُمسح عند «مسح بيانات الموقع» أو الوضع الخاص. ملف Excel هو وسيط النقل: صدّر بانتظام.</li>
          <li>يتطلب Excel 2021/365 لمعادلات XLOOKUP / LET / SEQUENCE في الملفات الأصلية.</li>
        </ul>
      </div>

      {model && model.appliedCorrections.length > 0 && (
        <div className="card">
          <h2>تصحيحات مُطبَّقة بموافقتك</h2>
          {model.appliedCorrections.map((c) => (
            <div key={c.id} className="banner warn" style={{ marginBottom: 8 }}>
              <div>{c.reason} — الكود {c.code}: {fmtSerial(c.from, model.date1904)} ← {fmtSerial(c.to, model.date1904)}</div>
              <button className="btn sm" onClick={() => commit('إلغاء تصحيح', (m) => revertCorrection(m, c))}>إلغاء التصحيح</button>
            </div>
          ))}
        </div>
      )}
      {model && <QualityPanel items={quality} />}

      {analysis && <ImportWizard analysis={analysis} current={model} onClose={() => setAnalysis(null)} onDone={() => { setAnalysis(null); onImported(); }} />}
    </>
  );
}
