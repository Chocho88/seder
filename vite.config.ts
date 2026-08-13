import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5183,
    strictPort: true,
    fs: {
      // design system lives one level up, shared across KLOD apps
      allow: ['..'],
    },
  },
});
