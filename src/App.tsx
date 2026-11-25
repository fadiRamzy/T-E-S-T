import { useEffect, useState } from 'react';
import { App as ManagementApp } from './apps/management/App';
import { AppProvider } from './apps/management/state/store';
import { App as EvaluationApp } from './apps/evaluation/ui/App';
import { ErrorBoundary } from './components/ErrorBoundary';

/**
 * Unified portal — merges the two original projects without changing either:
 *  • نظام إدارة المخاطر (fadiRamzy/test)        → #/mgmt/…  (src/apps/management)
 *  • تقييم مسئولي المخاطر (fadiRamzy/T-E-S-T)   → #/eval/…  (src/apps/evaluation)
 * Legacy hashes from both originals keep working: #/employees… → management,
 * #dashboard / #monthly / #files (no slash) → evaluation.
 */
type View = 'portal' | 'mgmt' | 'eval';

const EVAL_LEGACY = new Set(['dashboard', 'employees', 'monthly', 'files']);

function viewFromHash(hash: string): View {
  if (hash.startsWith('#/mgmt')) return 'mgmt';
  if (hash.startsWith('#/eval')) return 'eval';
  if (hash.startsWith('#/')) return hash.length > 2 ? 'mgmt' : 'portal'; // legacy management routes
  const bare = hash.replace(/^#/, '');
  if (EVAL_LEGACY.has(bare)) return 'eval'; // legacy evaluation routes (no slash)
  return 'portal';
}

function useHashView(): View {
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setView(viewFromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return view;
}

const TITLES: Record<View, string> = {
  portal: 'منظومة إدارة المخاطر الموحدة',
  mgmt: 'نظام إدارة المخاطر — الموظفون والمتابعة',
  eval: 'تقييم مسئولي المخاطر',
};

export default function App() {
  const view = useHashView();

  useEffect(() => {
    document.title = TITLES[view];
  }, [view]);

  if (view === 'mgmt') {
    return (
      <ErrorBoundary name="management">
        <AppProvider>
          <ManagementApp />
        </AppProvider>
        <SiteSwitchButton view="mgmt" />
      </ErrorBoundary>
    );
  }
  if (view === 'eval') {
    return (
      <ErrorBoundary name="evaluation">
        <EvaluationApp />
        <SiteSwitchButton view="eval" />
      </ErrorBoundary>
    );
  }
  return <ErrorBoundary name="portal"><Portal /></ErrorBoundary>;
}

/**
 * Dynamic website-switching button — always shows the NAME of the OTHER website:
 *  • inside the Risk Follow-up System (موقع المتابعة) → «تقييمات الموظفين» → #/eval/dashboard
 *  • inside the Employee Evaluations site (تقييمات الموظفين) → «موقع المتابعة» → #/mgmt/employees
 */
const SITE_SWITCH_TARGET: Record<'mgmt' | 'eval', { label: string; href: string }> = {
  mgmt: { label: 'موقع المتابعة', href: '#/mgmt/employees' },
  eval: { label: 'تقييمات الموظفين', href: '#/eval/dashboard' },
};

function SiteSwitchButton({ view }: { view: 'mgmt' | 'eval' }) {
  const target = view === 'mgmt' ? SITE_SWITCH_TARGET.eval : SITE_SWITCH_TARGET.mgmt;
  return (
    <a className="site-switch" href={target.href} aria-label={`الانتقال إلى ${target.label}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4v13" /><path d="m3.5 13.5 3.5 3.5 3.5-3.5" />
        <path d="M17 20V7" /><path d="m13.5 10.5 3.5-3.5 3.5 3.5" />
      </svg>
      <span>{target.label}</span>
    </a>
  );
}

function Portal() {
  return (
    <div className="portal">
      <div className="portal-hero">
        <span className="portal-eyebrow">منظومة موحدة</span>
        <h1 className="portal-title">منظومة إدارة المخاطر الموحدة</h1>
        <div className="portal-subtitle">وصول سريع وواضح إلى نظام المتابعة ونظام التقييمات في تجربة واحدة متناسقة.</div>
      </div>
      <div className="portal-actions">
        <a className="portal-btn portal-btn--mgmt" href="#/mgmt/employees">
          <span className="portal-btn__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5Z"/><path d="M8 15.5v-4m4 4v-7m4 7v-2.5"/></svg>
          </span>
          <span className="portal-btn__label">نظام المتابعة</span>
          <span className="portal-btn__desc" aria-hidden="true"></span>
          <span className="portal-btn__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 7l5 5-5 5"/></svg></span>
        </a>
        <a className="portal-btn portal-btn--eval" href="#/eval/dashboard">
          <span className="portal-btn__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.47L20.7 9.3l-4.35 4.24 1.03 5.98L12 16.7l-5.38 2.83 1.03-5.98L3.3 9.3l6-0.83Z"/></svg>
          </span>
          <span className="portal-btn__label">نظام التقييمات</span>
          <span className="portal-btn__desc" aria-hidden="true"></span>
          <span className="portal-btn__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 7l5 5-5 5"/></svg></span>
        </a>
      </div>
    </div>
  );
}
