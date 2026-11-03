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
      <div className="portal-glow portal-glow--a" aria-hidden="true" />
      <div className="portal-glow portal-glow--b" aria-hidden="true" />
      <header className="portal-head">
        <span className="portal-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 17l5-6 4 3 7-9" /></svg>
        </span>
        <div>
          <h1>منظومة إدارة المخاطر الموحدة</h1>
          <p>نظامان متكاملان في تطبيق واحد — اختر النظام للبدء، وبيانات كل نظام محفوظة محليًا على هذا الجهاز كما في النسخ الأصلية.</p>
        </div>
      </header>

      <main className="portal-grid">
        <article className="portal-card">
          <span className="portal-card__icon portal-card__icon--mgmt" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 15.3c2 .6 3.5 2.2 4 4.7" /></svg>
          </span>
          <h2>نظام إدارة المخاطر</h2>
          <p className="portal-card__sub">الموظفون والمتابعة اليومية</p>
          <ul>
            <li>ملفات الموظفين والملاحظات السنوية والتقييمات الشهرية</li>
            <li>المحاضر اليومية وتوقيت الزيارات الميدانية</li>
            <li>الإجازات والأذونات وتأخيرات الحضور والانصراف</li>
            <li>التقارير والنسخ الاحتياطي وتقارير PDF عربية</li>
          </ul>
          <a className="portal-enter" href="#/mgmt/employees">دخول النظام
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-7-7 7 7 7" /></svg>
          </a>
        </article>

        <article className="portal-card">
          <span className="portal-card__icon portal-card__icon--eval" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 20V10m5.5 10V4M15 20v-8m5 8V7" /></svg>
          </span>
          <h2>تقييم مسئولي المخاطر</h2>
          <p className="portal-card__sub">التقييم الشهري وملفات Excel</p>
          <ul>
            <li>لوحة مؤشرات وترتيب المسئولين حسب الأداء</li>
            <li>إدارة الموظفين والقطاعات والمحافظات</li>
            <li>التقييم الشهري وحساب الدرجات آليًا</li>
            <li>استيراد وتصدير ملفات Excel بنفس القوالب الأصلية</li>
          </ul>
          <a className="portal-enter" href="#/eval/dashboard">دخول النظام
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-7-7 7 7 7" /></svg>
          </a>
        </article>
      </main>

      <footer className="portal-foot">
        <span>قاعدتا بيانات محليتان منفصلتان كما في المشروعين الأصليين — لا تُرسل أي بيانات خارج هذا الجهاز.</span>
      </footer>
    </div>
  );
}
