import { useRef, useState } from 'react';
import type { AppModel } from '../domain/types';
import { exportWorkbook } from '../xlsx/export';
import { Icon } from './icons';
import { downloadBlob, Modal } from './kit';
import { importFiles, type ImportReport } from './importFiles';
import { getTemplateBytes, markExported, toast, undo, useStore } from './store';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Two actions only: pick (several) Excel files → accumulate into the data; download one consolidated workbook. */
export function FilesPage({ model }: { model: AppModel | null }) {
  const tpl = useStore((s) => s.template);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const pick = async (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (!files.length) return;
    setBusy(true);
    try { setReport(await importFiles(files)); }
    catch (e) { toast(`تعذّر الاستيراد: ${(e as Error).message}`, 'err'); }
    finally { setBusy(false); }
  };

  const download = async () => {
    const bytes = getTemplateBytes();
    if (!model || !bytes || !tpl) return;
    setBusy(true);
    try {
      const r = await exportWorkbook(bytes, model, { originalName: tpl.name });
      downloadBlob(r.bytes as unknown as BlobPart, r.fileName, XLSX_MIME);
      markExported();
      toast(`تم التنزيل: ${r.fileName}`, 'ok');
      r.warnings.forEach((w) => toast(w, 'info'));
    } catch (e) { toast(`فشل التنزيل: ${(e as Error).message}`, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="filesbox">
        <button className="bigbtn primary" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" /><span>اختيار ملف</span></button>
        <input ref={fileRef} data-testid="xlsx-input" type="file" multiple accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
        <button className="bigbtn" disabled={busy || !model || !tpl} onClick={download} data-testid="export-btn"><Icon name="download" /><span>تنزيل ملف محدث</span></button>
      </div>
      {report && <ReportDialog report={report} onClose={() => setReport(null)} />}
    </>
  );
}

function ReportDialog({ report, onClose }: { report: ImportReport; onClose: () => void }) {
  const failed = report.files.filter((f) => !f.ok);
  const done = report.files.filter((f) => f.ok);
  return (
    <Modal title="نتيجة الاستيراد" onClose={onClose}>
      <div data-testid="import-report">
        {done.length > 0 && (
          <div className="banner ok" role="status"><div>
            <b>تم استيراد {done.length} {done.length === 1 ? 'ملف' : 'ملفات'}</b> — إجمالي الموظفين الآن {report.employees}
            <ul className="filelist">
              {done.map((f, i) => (
                <li key={i}><b dir="auto">{f.name}</b><span>{f.added} جديد · {f.updated} محدَّث · {f.unchanged} دون تغيير{f.ignoredDuplicates ? ` · ${f.ignoredDuplicates} مكرر مُتجاهَل` : ''}{f.dropped ? ` · ${f.dropped} بلا مكان` : ''}</span></li>
              ))}
            </ul>
          </div></div>
        )}
        {failed.map((f, i) => (
          <div key={i} className="banner err" role="alert"><Icon name="alert" /><div>
            <b dir="auto">لم يُستورد: {f.name}</b>
            <ul className="filelist">{f.errors.map((e, j) => <li key={j}><span>{e}</span></li>)}</ul>
          </div></div>
        ))}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={onClose} autoFocus>إغلاق</button>
        {report.undoable && <button className="btn" onClick={() => { undo(); onClose(); }}>تراجع عن الاستيراد</button>}
      </div>
    </Modal>
  );
}
