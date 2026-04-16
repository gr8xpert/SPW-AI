import { defineConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    cssInjectedByJsPlugin(), // Injects CSS into JS bundle
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SPW',
      formats: ['iife', 'es', 'umd'],
      fileName: (format) => `spw-widget.${format}.js`,
    },
    rollupOptions: {
      output: {
        // Ensure CSS is bundled
        assetFileNames: 'spw-widget.[ext]',
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
