import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const frontendNodeModules = path.resolve(__dirname, 'node_modules');
  const apiProxyTarget = (env.VITE_API_URL || env.BACKEND_AI_URL || 'https://sentinel-core-xcrz.onrender.com').replace(/\/+$/, '');
  const devServerPort = Number(env.PORT || env.VITE_DEV_PORT || 5173);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'lucide-react'],
      alias: [
        { find: '@', replacement: path.resolve(__dirname, 'src') },
        { find: '@admin', replacement: path.resolve(__dirname, '../admin/pages') },
        { find: /^react$/, replacement: path.resolve(frontendNodeModules, 'react') },
        { find: /^react\/jsx-runtime$/, replacement: path.resolve(frontendNodeModules, 'react/jsx-runtime.js') },
        { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(frontendNodeModules, 'react/jsx-dev-runtime.js') },
        { find: /^react-dom$/, replacement: path.resolve(frontendNodeModules, 'react-dom') },
        { find: /^react-dom\/client$/, replacement: path.resolve(frontendNodeModules, 'react-dom/client.js') },
        { find: /^react-router$/, replacement: path.resolve(frontendNodeModules, 'react-router') },
        { find: /^react-router-dom$/, replacement: path.resolve(frontendNodeModules, 'react-router-dom') },
        { find: /^lucide-react$/, replacement: path.resolve(frontendNodeModules, 'lucide-react') },
        { find: /^axios$/, replacement: path.resolve(__dirname, 'src/services/axios.ts') },
        { find: /^@tanstack\/react-table$/, replacement: path.resolve(__dirname, 'src/shims/tanstack-react-table.ts') },
      ],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      host: '0.0.0.0',
      port: Number.isFinite(devServerPort) ? devServerPort : 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/health': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
