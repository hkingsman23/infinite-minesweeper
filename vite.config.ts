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
});
