// NOCTA Mini : l'interface minimaliste (films, séries) autour de la même bibliothèque que NOCTA
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '../styles.css';
import './mini.css';
import { MiniApp } from './MiniApp';

if (window.nocta?.platform) document.documentElement.dataset.platform = window.nocta.platform;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MiniApp />
  </StrictMode>,
);
