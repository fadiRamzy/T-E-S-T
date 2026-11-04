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
// Each original project's styles, isolated under .scope-mgmt / .scope-eval
// (see scripts/scope-css.mjs) so their shared class names never collide.
import './apps/management/styles/base.css';
import './apps/management/styles/design.css';
import './apps/evaluation/styles.css';
import './apps/evaluation/design.css';
import './index.css';
// Glisse (Apple Liquid Glass) design system: real tokens + component styles,
// then our theme layer which maps both apps onto it (light + dark).
import 'glisse/styles.css';
import './theme.css';
import App from './App';
import { initTheme } from './theme';
import { initGlassLens } from './glass';

// Both original projects are Arabic RTL apps.
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';
initTheme();
initGlassLens();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
