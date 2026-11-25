import { defineConfig, type Plugin } from 'vite';

// Network is blocked by the browser itself. Added to the build only:
// the dev server needs a websocket and inline styles for hot reload.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  base: './', // works under any GitHub Pages path
  plugins: [csp],
  build: { modulePreload: { polyfill: false } }, // the polyfill uses fetch
});
