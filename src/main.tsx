import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Institutional typography with full Arabic coverage (Latin + Arabic subsets).
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/latin-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/ibm-plex-sans-arabic/latin-700.css';
import './styles/tokens.css';
// Each original project's styles, isolated under .scope-mgmt / .scope-eval
// (see scripts/scope-css.mjs) so their shared class names never collide.
import './apps/management/styles/base.css';
import './apps/management/styles/design.css';
import './apps/evaluation/styles.css';
import './apps/evaluation/design.css';
// final UI polish layers (visual only) — must stay after each app's own CSS
import './apps/management/styles/polish.css';
import './apps/evaluation/polish.css';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Both original projects are Arabic RTL apps.
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

const rootEl = document.getElementById('root');

function renderFatal(err: unknown) {
  if (!rootEl) return;
  const message = err instanceof Error ? (err.stack || err.message) : String(err);
  const safe = message.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c] as string));
  rootEl.innerHTML = `<div style="padding:24px;margin:24px;border:1px solid rgba(0,0,0,0.1);border-radius:16px;background:#fff;color:#1d1d1f;font-family:system-ui,sans-serif" dir="rtl"><h2 style="margin:0 0 8px;font-size:20px">تعذّر تحميل التطبيق</h2><p style="margin:0 0 12px;color:#6e6e73;font-size:14px">حدث خطأ أثناء التشغيل. يرجى تحديث الصفحة.</p><button type="button" onclick="location.reload()" style="height:40px;padding:0 20px;border-radius:12px;border:1px solid rgba(0,0,0,0.12);background:#0071e3;color:#fff;font-weight:600;cursor:pointer;margin-bottom:12px">تحديث الصفحة</button><pre style="margin:0;padding:12px;background:#f5f5f7;border-radius:10px;white-space:pre-wrap;font-size:12px;direction:ltr;text-align:left">${safe}</pre></div>`;
}

function rootIsEmpty() {
  return !rootEl || rootEl.childElementCount === 0;
}

function handleFatal(err: unknown) {
  console.error('[fatal]', err);
  if (rootIsEmpty()) { renderFatal(err); return; }
  // React may unmount asynchronously after an unrecoverable render error.
  setTimeout(() => { if (rootIsEmpty()) renderFatal(err); }, 0);
  setTimeout(() => { if (rootIsEmpty()) renderFatal(err); }, 250);
}

window.addEventListener('error', (e) => {
  handleFatal(e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  handleFatal(e.reason);
});

try {
  createRoot(rootEl!).render(
    <StrictMode>
      <ErrorBoundary name="root">
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (err) {
  console.error('[boot]', err);
  renderFatal(err);
}
