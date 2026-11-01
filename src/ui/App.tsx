import { useEffect, useState } from 'react';
import { AnnualPage } from './AnnualPage';
import { ImportExportPage } from './ImportExportPage';
import { LeavePage } from './LeavePage';
import { ListsPage } from './ListsPage';
import { MonthlyPage } from './MonthlyPage';
import { VisitsPage } from './VisitsPage';
import { ConfirmHost, Empty, ToastHost } from './kit';
import { init, redo, undo, useStore } from './store';

const PAGES = [
  { id: 'annual', label: 'لوحة التقييم السنوي', icon: '📊' },
  { id: 'monthly', label: 'التقييم الشهري', icon: '🗓️' },
  { id: 'visits', label: 'الزيارات الميدانية', icon: '📍' },
  { id: 'leave', label: 'الاجازات والاذونات', icon: '🏖️' },
  { id: 'lists', label: 'القوائم', icon: '📋' },
  { id: 'io', label: 'استيراد / تصدير', icon: '🔄' },
] as const;
type PageId = (typeof PAGES)[number]['id'];

export function App() {
  const ready = useStore((s) => s.ready);
  const model = useStore((s) => s.model);
  const saving = useStore((s) => s.saving);
  const lastSaved = useStore((s) => s.lastSaved);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const changes = useStore((s) => s.changesSinceExport);
  const [page, setPage] = useState<PageId>((location.hash.slice(1) as PageId) || 'annual');
  const [open, setOpen] = useState(false);

  useEffect(() => { init(); }, []);
  useEffect(() => { location.hash = page; }, [page]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const cur = PAGES.find((p) => p.id === page)!;
  const effective: PageId = !model && page !== 'io' ? 'io' : page;

  return (
    <div className="app">
      <nav className={`rail ${open ? 'open' : ''}`} aria-label="التنقل">
        <div className="brand"><b>تقييم مسئولي المخاطر</b><small>بني سويف والفيوم · 2026</small></div>
        {PAGES.map((p) => (
          <button key={p.id} className={`nav ${effective === p.id ? 'active' : ''}`} onClick={() => { setPage(p.id); setOpen(false); }} aria-current={effective === p.id ? 'page' : undefined}>
            <span className="ic" aria-hidden>{p.icon}</span>{p.label}
          </button>
        ))}
        <div className="foot">واجهة إدخال لقالب Excel الرئيسي — التطبيق لا يستبدل الملف.</div>
      </nav>
      <main className="main">
        <div className="topbar">
          <button className="btn hamburger" onClick={() => setOpen(!open)} aria-label="القائمة">☰</button>
          <h1>{PAGES.find((p) => p.id === effective)?.label ?? cur.label}</h1>
          <div className="status" aria-live="polite">
            <span className={`dot ${saving ? 'saving' : ''}`} />
            {saving ? 'جارٍ الحفظ…' : lastSaved ? `آخر حفظ ${new Date(lastSaved).toLocaleTimeString('ar-EG')}` : 'غير محفوظ'}
            {changes > 0 && <span className="chip" style={{ background: '#fff3cd' }}>{changes} تعديل غير مُصدَّر</span>}
          </div>
          <button className="btn sm" onClick={undo} disabled={!canUndo} title="Ctrl+Z">↶ تراجع</button>
          <button className="btn sm" onClick={redo} disabled={!canRedo} title="Ctrl+Y">↷ إعادة</button>
        </div>
        {!ready ? <Empty>جارٍ التحميل…</Empty> : (
          <>
            {!model && effective === 'io' && <div className="banner info">ابدأ برفع ملف Excel الرئيسي (أو جرّب المصنف التجريبي) — جميع الصفحات تعتمد على بيانات الملف.</div>}
            {model && (
              <>
                <datalist id="dl-sectors">{model.lists.sectors.map((s) => <option key={s} value={s} />)}</datalist>
                <datalist id="dl-govs">{model.lists.governorates.map((s) => <option key={s} value={s} />)}</datalist>
              </>
            )}
            {effective === 'annual' && model && <AnnualPage model={model} />}
            {effective === 'monthly' && model && <MonthlyPage model={model} />}
            {effective === 'visits' && model && <VisitsPage model={model} />}
            {effective === 'leave' && model && <LeavePage model={model} />}
            {effective === 'lists' && model && <ListsPage model={model} />}
            {effective === 'io' && <ImportExportPage model={model} onImported={() => setPage('annual')} />}
          </>
        )}
      </main>
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
