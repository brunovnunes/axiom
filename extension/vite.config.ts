import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'chrome120',
    minify: true,
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/background.js',
      formats: ['es'],
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: {
        format: 'es',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
