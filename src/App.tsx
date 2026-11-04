import { useEffect, useState } from 'react';
import { Switch } from 'glisse';
import { applyTheme, useTheme } from './theme';
import { App as ManagementApp } from './apps/management/App';
import { AppProvider } from './apps/management/state/store';
import { App as EvaluationApp } from './apps/evaluation/ui/App';

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
      <>
        <AppProvider>
          <ManagementApp />
        </AppProvider>
        <SiteSwitchButton view="mgmt" />
      </>
    );
  }
  if (view === 'eval') {
    return (
      <>
        <EvaluationApp />
        <SiteSwitchButton view="eval" />
      </>
    );
  }
  return <Portal />;
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
  const theme = useTheme();
  return (
    <div className="portal">
      <div className="portal-theme" title={theme === 'dark' ? 'الوضع الداكن' : 'الوضع الفاتح'}>
        <span className="portal-theme-label">داكن</span>
        <Switch checked={theme === 'dark'} onCheckedChange={(v) => applyTheme(v ? 'dark' : 'light')} aria-label="تبديل الوضع الداكن" />
      </div>
      <h1 className="portal-title">منظومة إدارة المخاطر الموحدة</h1>
      <div className="portal-actions">
        <a className="portal-btn portal-btn--mgmt" href="#/mgmt/employees">نظام المتابعة</a>
        <a className="portal-btn portal-btn--eval" href="#/eval/dashboard">نظام التقييمات</a>
      </div>
    </div>
  );
}
