import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // build stamp shown in the account panel - lets anyone confirm two
  // devices run the same version (iOS PWAs cache hard)
  define: {
    __SEDER_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  server: {
    port: 5183,
    strictPort: true,
    host: true, // expose on LAN so the iPhone can reach it over Wi-Fi

    fs: {
      // design system lives one level up, shared across KLOD apps
      allow: ['..'],
    },
  },
});
