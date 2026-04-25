import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { resolve } from 'path';

export default defineConfig(({ command }) => ({
  plugins: [
    ...(command === 'build' ? [preact(), cssInjectedByJsPlugin()] : []),
  ],
  esbuild: command === 'serve' ? {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  } : undefined,
  server: {
    open: '/test/search-listing.html',
    fs: {
      allow: ['.'],
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SPW',
      formats: ['iife', 'es', 'umd'],
      fileName: (format) => `spw-widget.${format}.js`,
    },
    rollupOptions: {
      output: {
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
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
}));
