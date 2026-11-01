import { useEffect, useState } from 'react';
import { DashboardPage } from './DashboardPage';
import { EmployeesPage } from './EmployeesPage';
import { FilesPage } from './FilesPage';
import { MonthlyPage } from './MonthlyPage';
import { ConfirmHost, Empty, ToastHost } from './kit';
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
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l5-6 4 3 7-9" /></svg></span>
            <div><b>تقييم مسئولي المخاطر</b><small>بني سويف والفيوم · 2026</small></div>
          </div>
          <nav className="navbar" aria-label="التنقل الرئيسي">
            {PAGES.map((p) => (
              <button key={p.id} className={`nav ${effective === p.id ? 'active' : ''}`} onClick={() => setPage(p.id as PageId)} aria-current={effective === p.id ? 'page' : undefined} disabled={!model && p.id !== 'files'} style={!model && p.id !== 'files' ? { opacity: 0.45, cursor: 'default' } : undefined}>
                <Icon name={p.icon} /><span className="lbl">{p.label}</span>
              </button>
            ))}
          </nav>
          <div className="topbar-tools">
            <span className="status" aria-live="polite" data-testid="save-status">
              <span className={`dot ${saving ? 'saving' : ''}`} />
              <span className="txt">{saving ? 'جارٍ الحفظ…' : lastSaved ? `محفوظ ${new Date(lastSaved).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : 'غير محفوظ'}{changes > 0 ? ` · ${changes} غير مُصدَّر` : ''}</span>
            </span>
            <button className="iconbtn" onClick={undo} disabled={!canUndo} title="تراجع (Ctrl+Z)" aria-label="تراجع"><Icon name="undo" /></button>
            <button className="iconbtn" onClick={redo} disabled={!canRedo} title="إعادة (Ctrl+Y)" aria-label="إعادة"><Icon name="redo" /></button>
          </div>
        </div>
      </header>
      <main className="container">
        {!ready ? <Empty>جارٍ التحميل…</Empty> : (
          <>
            {model && (
              <>
                <datalist id="dl-sectors">{model.lists.sectors.map((s) => <option key={s} value={s} />)}</datalist>
                <datalist id="dl-govs">{model.lists.governorates.map((s) => <option key={s} value={s} />)}</datalist>
              </>
            )}
            {effective === 'dashboard' && model && <DashboardPage model={model} go={setPage} />}
            {effective === 'employees' && model && <EmployeesPage model={model} />}
            {effective === 'monthly' && model && <MonthlyPage model={model} />}
            {effective === 'files' && <FilesPage model={model} onImported={() => setPage('dashboard')} />}
          </>
        )}
      </main>
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
