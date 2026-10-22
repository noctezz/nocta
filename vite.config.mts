import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// CSP ajoutée uniquement au build (en dev, Vite injecte des scripts inline)
const csp: Plugin = {
  name: 'nocta-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src * data: blob:; media-src * blob: data:; connect-src *; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src https://www.youtube-nocookie.com https://www.youtube.com; script-src 'self'" />`,
    ),
};

// Version TV (Android) : compilée pour les moteurs web plus anciens des box et TV
const TV = !!process.env.NOCTA_TV;

export default defineConfig({
  base: './',
  plugins: TV ? [react()] : [react(), csp],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: TV ? ['chrome69', 'es2019'] : 'chrome120', cssTarget: TV ? 'chrome69' : 'chrome120' },
});
