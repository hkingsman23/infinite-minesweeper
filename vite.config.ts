import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS is opt-in via VITE_HTTPS=1 (see NOTES.md) — needed to test mobile-only
// browser APIs like navigator.vibrate(), which modern Chrome/Safari restrict
// to secure contexts and won't run at all over a plain http://<lan-ip> dev
// URL. Left off by default since the automated desktop preview tooling talks
// to the plain-http server directly.
export default defineConfig({
  plugins: process.env.VITE_HTTPS ? [basicSsl()] : [],
  server: { port: 5183, strictPort: true },
  // Vite only builds index.html by default — privacy.html and terms.html are
  // additional static entry points (no JS bundle of their own) that need to
  // exist as real crawlable pages for the AdSense/Lemon Squeezy reviews and
  // aren't part of the game SPA itself.
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        privacy: 'privacy.html',
        terms: 'terms.html',
      },
    },
  },
});
