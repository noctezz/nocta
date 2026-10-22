// Sur Android TV, le pont avec l'appareil doit exister avant tout le reste (profils, réglages)
import './platform/android';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App';
import { MpvOverlay } from './components/MpvOverlay';

if (window.nocta?.platform) document.documentElement.dataset.platform = window.nocta.platform;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {new URLSearchParams(location.search).has('overlay') ? <MpvOverlay /> : <App />}
  </StrictMode>,
);
