import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
// Each original project's styles, isolated under .scope-mgmt / .scope-eval
// (see scripts/scope-css.mjs) so their shared class names never collide.
import './apps/management/styles/base.css';
import './apps/management/styles/reference.css';
import './apps/management/styles/reference-compat.css';
import './apps/evaluation/styles.css';
import './index.css';
import App from './App';

// Both original projects are Arabic RTL apps.
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
