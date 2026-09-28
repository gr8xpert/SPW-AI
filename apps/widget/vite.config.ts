import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

// dist/version.json = hash of the bundle. The API reports it (sync-meta,
// widget-config) and the WordPress plugin loads spm-widget.umd.js?ver=<hash>,
// so a new widget reaches client sites without purging the CDN cache.
function widgetVersionFile() {
  return {
    name: 'spm-widget-version',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      const hash = createHash('sha256').update(readFileSync(resolve(dist, 'spm-widget.umd.js'))).digest('hex').slice(0, 12);
      writeFileSync(resolve(dist, 'version.json'), JSON.stringify({ version: hash, builtAt: new Date().toISOString() }));
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    ...(command === 'build' ? [preact(), cssInjectedByJsPlugin(), widgetVersionFile()] : []),
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
        // Keep console.warn / console.error: they tell a site builder why a
        // filter was ignored (an unknown id, an ambiguous name). Only the
        // chatty development logs are removed.
        pure_funcs: ['console.log', 'console.debug', 'console.info'],
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
