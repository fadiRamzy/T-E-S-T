import { useEffect, useState } from 'react';
import { DashboardPage } from './DashboardPage';
import { EmployeesPage } from './EmployeesPage';
import { FilesPage } from './FilesPage';
import { MonthlyPage } from './MonthlyPage';
import { ConfirmHost, Empty, ToastHost } from './kit';
import { EGYPT_GOVERNORATES } from '../domain/constants';
import { Icon, type IconName } from './icons';
import { init, redo, undo, useStore } from './store';

const PAGES: Array<{ id: string; label: string; icon: IconName; color?: string }> = [
  { id: 'dashboard', label: 'لوحة المؤشرات', icon: 'dashboard', color: 'var(--maroon-dark)' },
  { id: 'employees', label: 'الموظفون', icon: 'users', color: 'var(--maroon)' },
  { id: 'monthly', label: 'التقييم الشهري', icon: 'calendar', color: 'var(--gold-dark)' },
  { id: 'files', label: 'الملفات', icon: 'file', color: 'var(--text-2)' },
];
type PageId = 'dashboard' | 'employees' | 'monthly' | 'files';
const isPage = (x: string): x is PageId => PAGES.some((p) => p.id === x);
const pageFromHash = (hash: string): PageId => {
  const seg = hash.replace(/^#\/?/, '').replace(/^eval\//, '');
  return isPage(seg) ? seg : 'dashboard';
};

export function App() {
  const ready = useStore((s) => s.ready);
  const model = useStore((s) => s.model);
  const saving = useStore((s) => s.saving);
  const lastSaved = useStore((s) => s.lastSaved);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const changes = useStore((s) => s.changesSinceExport);
  // [merged] this app lives under the #/eval/ namespace of the unified portal (legacy #<page> hashes still accepted)
  const [page, setPage] = useState<PageId>(() => pageFromHash(location.hash));

  useEffect(() => { init(); }, []);
  useEffect(() => {
    location.hash = `/eval/${page}`;
  }, [page]);
  // keep the page in sync when the hash changes without a nav click (browser Back/Forward, typed URL)
  useEffect(() => {
    const onHash = () => {
      if (!location.hash.startsWith('#/eval')) return; // leaving for the management site is handled by the portal
      setPage(pageFromHash(location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
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
    <div className="shell scope-eval">
      <header className="eval-desktop-topbar print-hide" aria-label="رأس الصفحة">
        <div className="eval-desktop-topbar__inner">
          <a className="eval-desktop-topbar__switch" href="#/mgmt/employees"><Icon name="chart" /><span>نظام المتابعة</span></a>
        </div>
      </header>
      <header className="eval-mobile-topbar print-hide">
        <div className="eval-mobile-topbar__title">نظام التقييم</div>
        <a className="eval-mobile-topbar__switch" href="#/mgmt/employees">نظام المتابعة</a>
      </header>
      <main className="container">
        {model && (
          <>
            <datalist id="dl-sectors">{model.lists.sectors.map((s) => <option key={s} value={s} />)}</datalist>
            <datalist id="dl-govs">{[...new Set([...model.lists.governorates, ...EGYPT_GOVERNORATES])].map((s) => <option key={s} value={s} />)}</datalist>
          </>
        )}
        {!ready ? <Empty>جارٍ التحميل…</Empty> : (
          <div key={effective} className={effective === 'monthly' ? 'page page--monthly' : 'page'}>
            {effective === 'dashboard' && model && <DashboardPage model={model} />}
            {effective === 'employees' && model && <EmployeesPage model={model} />}
            {effective === 'monthly' && model && <MonthlyPage model={model} />}
            {effective === 'files' && <FilesPage model={model} />}
          </div>
        )}
      </main>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        <div className="bottom-nav__inner">
          {PAGES.map((p) => {
            const off = !model && p.id !== 'files';
            const active = page === p.id;
            return (
              <a
                key={p.id}
                href={`#/eval/${p.id}`}
                className={`bottom-nav__item ${active ? 'is-active' : ''} ${off ? 'opacity-50 pointer-events-none' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={p.label}
                title={p.label}
                onClick={(e) => {
                  if (off) e.preventDefault();
                  else setPage(p.id as PageId);
                }}
              >
                <span className="bottom-nav__icon"><Icon name={p.icon} size={18} style={{ color: p.color }} /></span>
                <span className="bottom-nav__label">{p.label}</span>
              </a>
            );
          })}
          <a
            href="#/mgmt/employees"
            className="bottom-nav__item"
            title="نظام المتابعة"
            aria-label="الانتقال إلى نظام المتابعة"
          >
            <span className="bottom-nav__icon"><Icon name="chart" size={18} style={{ color: 'var(--gold-dark)' }} /></span>
            <span className="bottom-nav__label">نظام المتابعة</span>
          </a>
        </div>
      </nav>

      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
