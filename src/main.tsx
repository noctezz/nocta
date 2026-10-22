// Sur Android TV, le pont avec l'appareil doit exister avant tout le reste (profils, réglages)
import './platform/android';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App';
import { MpvOverlay } from './components/MpvOverlay';
import { IS_TV } from './lib/tv';

if (window.nocta?.platform) document.documentElement.dataset.platform = window.nocta.platform;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sur la TV : fondus simples, sans mouvements ni zooms coûteux pour la box */}
    <MotionConfig reducedMotion={IS_TV ? 'always' : 'never'}>
      {new URLSearchParams(location.search).has('overlay') ? <MpvOverlay /> : <App />}
    </MotionConfig>
  </StrictMode>,
);
