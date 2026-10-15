import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { i18nReady } from './i18n';
import './styles/app.css';

// the interface language's texts load first, so the app never flashes in English
await i18nReady;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
