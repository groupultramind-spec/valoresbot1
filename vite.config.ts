import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      legacy({
        targets: ['defaults', 'not IE 11', 'ios >= 11', 'android >= 5'],
        modernTargets: ['ios >= 11', 'android >= 5', 'chrome >= 61', 'safari >= 11'],
        modernPolyfills: true,
        polyfills: true,
      })
    ],
    base: '/',
    define: {
      'process.env': {}
    },
    build: {
      target: ['es2015', 'chrome61', 'safari11', 'ios11'],
      cssTarget: ['chrome61', 'safari11']
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: true,
    },
  };
});
