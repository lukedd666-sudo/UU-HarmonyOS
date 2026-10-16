import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    lib: { entry: 'src/main.ts', name: 'UUReaController', formats: ['iife'], fileName: () => 'app.js', cssFileName: 'style' },
    rollupOptions: { output: { inlineDynamicImports: true, banner: '/*! UU-REA: includes MIT code (c) 2026 iola1999; licenses in THIRD_PARTY_NOTICES.md. */' } },
  },
  plugins: [{ name: 'local-classic-entry', closeBundle() {
    writeFileSync('dist/index.html', readFileSync('index.html'));
    writeFileSync('dist/THIRD_PARTY_NOTICES.md', readFileSync('../THIRD_PARTY_NOTICES.md'));
  } }],
});
