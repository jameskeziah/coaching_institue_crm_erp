import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const runtimeEnv = loadEnv(mode, __dirname, '');
  const apiUrl = runtimeEnv.API_URL || 'http://localhost:4000/api';

  return {
    plugins: [react()],
    define: {
      __API_URL__: JSON.stringify(apiUrl.replace(/\/+$/, '')),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
