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
      name: 'SPM',
      formats: ['iife', 'es', 'umd'],
      fileName: (format) => `spm-widget.${format}.js`,
    },
    rollupOptions: {
      output: {
        assetFileNames: 'spm-widget.[ext]',
        // The entry mixes named exports (store/actions/selectors/types) with
        // `export default { init }`. Without `exports: 'named'`, Rollup warns
        // that UMD consumers will need `SPM.default.init()`. Since the
        // widget auto-initialises on DOMContentLoaded anyway and the
        // named exports are the public API for advanced embedders, mark
        // the output as named-only to silence the warning. Consumers that
        // explicitly want the default export still get it via `SPM.default`.
        exports: 'named',
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
    sourcemap: false,
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
