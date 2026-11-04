import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/base.css';
import './styles/design.css';
import { App } from './App';
import { AppProvider } from './state/store';
import { registerServiceWorker } from './serviceWorker';

// ضمان اتجاه RTL واللغة العربية على مستوى المستند
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);

registerServiceWorker();
