import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths — the same dist/ is served by Tauri AND by GitHub Pages
  // under /<repo>/demo/, so absolute '/assets/…' would break on Pages
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // the samples tree and doc files can be locked by AV scanners on Windows —
      // they don't need HMR anyway
      ignored: ['**/src-tauri/**', '**/target/**', '**/public/samples/**', '**/LICENSE', '**/*.md', '**/scripts/**'],
      ignorePermissionErrors: true,
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    // @strudel/soundfonts pulls its own @strudel/core copy — force one instance
    dedupe: ['@strudel/core', '@strudel/webaudio', '@strudel/mini', '@strudel/tonal'],
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
  },
});
