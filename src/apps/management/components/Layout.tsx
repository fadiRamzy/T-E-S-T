import { useEffect } from 'react';
import { useAppMeta } from '../state/store';
import { useRoute } from '../state/router';
import { Icon, type IconName } from './Icon';
import { CollapseProvider } from './ui';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { cn } from '../lib/utils';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/employees', label: 'الموظفون', icon: 'employees' },
  { path: '/notes', label: 'الملاحظات والمتابعة', icon: 'edit' },
  { path: '/visit-times', label: 'توقيت الزيارات', icon: 'visits' },
  { path: '/minutes', label: 'المحاضر', icon: 'minutes' },
  { path: '/leave-permissions', label: 'الإجازات', icon: 'calendar' },
  { path: '/attendance-delays', label: 'تأخيرات الحضور', icon: 'clock' },
  { path: '/reports', label: 'التقارير', icon: 'reports' },
  { path: '/eval/dashboard', label: 'نظام التقييمات', icon: 'chart' },
];

const isMgmtPath = (path: string) => !path.startsWith('/eval');

export function Layout({ children }: { children: React.ReactNode }) {
  const { settings, ready } = useAppMeta();
  const route = useRoute();
  const isActive = (path: string) =>
    path === '/employees'
      ? route.path === '/' || route.path === path || route.path.startsWith(`${path}/`)
      : route.path === path;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.path]);

  return (
    <div className="app-shell">
      <header className="desktop-topbar print-hide" aria-label="رأس الصفحة">
        <div className="desktop-topbar__inner">
          <div className="desktop-topbar__title">
            <span className="desktop-topbar__eyebrow">منظومة رسمية</span>
            <strong>نظام المتابعة وإدارة المخاطر</strong>
          </div>
          <div className="desktop-topbar__meta">
            <span className="desktop-topbar__org">
              <Icon name="building" size={14} /> {settings.organizationName}
            </span>
          </div>
        </div>
      </header>

      <CollapseProvider signal={{ version: 0, collapsed: false }}>
        <main className="page" id="main-content">
          <ErrorBoundary name="mgmt-page">
            {ready ? children : <div className="loading">جارٍ فتح البيانات المحلية…</div>}
          </ErrorBoundary>
        </main>
      </CollapseProvider>

      <nav className="bottom-nav sidebar__nav" aria-label="التنقل الرئيسي">
        <div className="bottom-nav__inner sidebar__nav">
          {NAV_ITEMS.map((item) => {
            const active =
              item.path.startsWith('/eval')
                ? route.path === '/eval/dashboard' || route.path.startsWith('/eval/')
                : isActive(item.path);
            return (
              <a
                key={item.path}
                href={`#${item.path}`}
                className={cn('bottom-nav__item', active && 'is-active')}
                aria-current={active ? 'page' : undefined}
                title={item.label}
              >
                <span className="bottom-nav__icon">
                  <Icon name={item.icon} size={18} strokeWidth={1.65} />
                </span>
                <span className="bottom-nav__label">{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>

      <footer className="appfoot print-hide">
        <span>البيانات محفوظة محليًا على هذا الجهاز فقط</span>
      </footer>
    </div>
  );
}
