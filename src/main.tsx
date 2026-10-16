import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Initialises i18next, restores the stored language, and sets <html lang>.
import './i18n';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
