import { defineConfig, mergeConfig } from 'vite';
import frontendConfig from '../../frontend/confidence-panel/vite.config.ts';

// Overlay only the dev proxy. The frontend's files and public asset settings are unchanged.
export default defineConfig(mergeConfig(frontendConfig, {
  server: { proxy: { '/api': `http://127.0.0.1:${process.env.PORT || 8787}` } },
}));
