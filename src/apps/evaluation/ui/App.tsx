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
const isMgmt = (x: string) => x === 'mgmt/employees';

export function App() {
  const ready = useStore((s) => s.ready);
  const model = useStore((s) => s.model);
  const saving = useStore((s) => s.saving);
  const lastSaved = useStore((s) => s.lastSaved);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const changes = useStore((s) => s.changesSinceExport);
  // [merged] this app lives under the #/eval/ namespace of the unified portal (legacy #<page> hashes still accepted)
  const [page, setPage] = useState<PageId | 'mgmt/employees'>(() => {
    const seg = location.hash.replace(/^#\/?/, '').replace(/^eval\//, '');
    if (isMgmt(seg)) return 'mgmt/employees';
    return isPage(seg) ? (seg as PageId) : 'dashboard';
  });

  useEffect(() => { init(); }, []);
  useEffect(() => {
    const target = page === 'mgmt/employees' ? '#/mgmt/employees' : `/eval/${page}`;
    location.hash = target;
  }, [page]);
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

  const effective: PageId | 'mgmt/employees' = !model ? 'files' : page;
  const isMgmtPage = page === 'mgmt/employees';

  return (
    <div className="shell scope-eval">
      <header className="eval-desktop-topbar print-hide" aria-label="رأس الصفحة">
        <div className="eval-desktop-topbar__inner">
          <div>
            <span className="eval-desktop-topbar__eyebrow">منظومة رسمية</span>
            <strong className="eval-desktop-topbar__title">نظام تقييم مسئولي المخاطر</strong>
          </div>
          <a className="eval-desktop-topbar__switch" href="#/mgmt/employees"><Icon name="chart" /><span>نظام المتابعة</span></a>
        </div>
      </header>
      <header className="eval-mobile-topbar print-hide">
        <div className="eval-mobile-topbar__title">تقييم مسئولي المخاطر</div>
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
                <span className="bottom-nav__icon"><Icon name={p.icon} size={18} /></span>
                <span className="bottom-nav__label">{p.label}</span>
              </a>
            );
          })}
          <a
            href="#/mgmt/employees"
            className={`bottom-nav__item ${isMgmtPage ? 'is-active' : ''}`}
            title="نظام المتابعة"
            aria-label="الانتقال إلى نظام المتابعة"
          >
            <span className="bottom-nav__icon"><Icon name="chart" size={18} /></span>
            <span className="bottom-nav__label">نظام المتابعة</span>
          </a>
        </div>
      </nav>

      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
