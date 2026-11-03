import { useEffect, useState } from 'react';
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
        <PortalHomeChip />
      </>
    );
  }
  if (view === 'eval') {
    return (
      <>
        <EvaluationApp />
        <PortalHomeChip />
      </>
    );
  }
  return <Portal />;
}

function PortalHomeChip() {
  return (
    <a className="portal-home-chip" href="#/" aria-label="العودة إلى البوابة الموحدة">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M10 20v-5h4v5" /></svg>
      <span>البوابة الموحدة</span>
    </a>
  );
}

function Portal() {
  return (
    <div className="portal">
      <h1 className="portal-title">منظومة إدارة المخاطر الموحدة</h1>
      <div className="portal-actions">
        <a className="portal-btn portal-btn--mgmt" href="#/mgmt/employees">نظام المتابعة</a>
        <a className="portal-btn portal-btn--eval" href="#/eval/dashboard">نظام التقييمات</a>
      </div>
    </div>
  );
}
