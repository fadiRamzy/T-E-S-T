import { useEffect, useState } from 'react';
import { DashboardPage } from './DashboardPage';
import { EmployeesPage } from './EmployeesPage';
import { FilesPage } from './FilesPage';
import { MonthlyPage } from './MonthlyPage';
import { ConfirmHost, Empty, ToastHost } from './kit';
import { EGYPT_GOVERNORATES } from '../domain/constants';
import { Icon, type IconName } from './icons';
import { init, redo, undo, useStore } from './store';

const PAGES: Array<{ id: string; label: string; icon: IconName }> = [
  { id: 'dashboard', label: 'لوحة المؤشرات', icon: 'dashboard' },
  { id: 'employees', label: 'الموظفون', icon: 'users' },
  { id: 'monthly', label: 'التقييم الشهري', icon: 'calendar' },
  { id: 'files', label: 'الملفات', icon: 'file' },
];
type PageId = 'dashboard' | 'employees' | 'monthly' | 'files';
const isPage = (x: string): x is PageId => PAGES.some((p) => p.id === x);

export function App() {
  const ready = useStore((s) => s.ready);
  const model = useStore((s) => s.model);
  const saving = useStore((s) => s.saving);
  const lastSaved = useStore((s) => s.lastSaved);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const changes = useStore((s) => s.changesSinceExport);
  const [page, setPage] = useState<PageId>(isPage(location.hash.slice(1)) ? (location.hash.slice(1) as PageId) : 'dashboard');

  useEffect(() => { init(); }, []);
  useEffect(() => { location.hash = page; }, [page]);
  // with no data yet the only useful page is «الملفات»; staying on it keeps the import result visible after the first import
  useEffect(() => { if (ready && !model) setPage('files'); }, [ready, model]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (!(e.ctrlKey || e.metaKey) || t === 'INPUT' || t === 'TEXTAREA') return;
      if (e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const effective: PageId = !model ? 'files' : page;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l5-6 4 3 7-9" /></svg></span>
          <b>تقييم مسئولي المخاطر</b>
        </div>
        <nav className="navbar" aria-label="التنقل الرئيسي">
          {PAGES.map((p) => {
            const off = !model && p.id !== 'files';
            return (
              <button key={p.id} className={`nav ${effective === p.id ? 'active' : ''}`} onClick={() => setPage(p.id as PageId)} aria-current={effective === p.id ? 'page' : undefined} disabled={off}>
                <Icon name={p.icon} /><span className="lbl">{p.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="side-foot">
          <span className="status" aria-live="polite" data-testid="save-status">
            <span className={`dot ${saving ? 'saving' : ''}`} />
            <span className="txt">{saving ? 'جارٍ الحفظ…' : lastSaved ? `محفوظ ${new Date(lastSaved).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : 'غير محفوظ'}{changes > 0 ? ` · ${changes} غير مُصدَّر` : ''}</span>
          </span>
          <span className="undo-tools">
            <button className="iconbtn" onClick={undo} disabled={!canUndo} title="تراجع (Ctrl+Z)" aria-label="تراجع"><Icon name="undo" /></button>
            <button className="iconbtn" onClick={redo} disabled={!canRedo} title="إعادة (Ctrl+Y)" aria-label="إعادة"><Icon name="redo" /></button>
          </span>
        </div>
      </aside>
      <div className="main">
        <main className="container">
          {!ready ? <Empty>جارٍ التحميل…</Empty> : (
            <>
              {model && (
                <>
                  <datalist id="dl-sectors">{model.lists.sectors.map((s) => <option key={s} value={s} />)}</datalist>
                  <datalist id="dl-govs">{[...new Set([...model.lists.governorates, ...EGYPT_GOVERNORATES])].map((s) => <option key={s} value={s} />)}</datalist>
                </>
              )}
              {effective === 'dashboard' && model && <DashboardPage model={model} />}
              {effective === 'employees' && model && <EmployeesPage model={model} />}
              {effective === 'monthly' && model && <MonthlyPage model={model} />}
              {effective === 'files' && <FilesPage model={model} />}
            </>
          )}
        </main>
      </div>
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
