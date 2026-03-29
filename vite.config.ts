import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import fs from 'fs';

const resolveAliases = {
  '@': path.resolve(__dirname, './src'),
  '@core': path.resolve(__dirname, './core'),
  '@db': path.resolve(__dirname, './database'),
  '@electron': path.resolve(__dirname, './electron'),
};

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          // Copy preload.cjs to dist-electron
          const preloadSrc = path.join(__dirname, 'electron/preload.cjs');
          const preloadDest = path.join(__dirname, 'dist-electron/preload.cjs');
          fs.copyFileSync(preloadSrc, preloadDest);
          console.log('Copied preload.cjs to dist-electron');

          // Copy database migrations to dist-electron/migrations
          const migrationsSrc = path.join(__dirname, 'database/migrations');
          const migrationsDest = path.join(__dirname, 'dist-electron/migrations');
          fs.cpSync(migrationsSrc, migrationsDest, { recursive: true });
          console.log('Copied migrations to dist-electron/migrations');

          options.startup();
        },
        vite: {
          resolve: {
            alias: resolveAliases,
          },
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
            rollupOptions: {
              external: [
                'electron-log',
                '@libsql/client',
                'googleapis',
                '@langchain/core',
                '@langchain/langgraph',
                '@ai-sdk/anthropic',
                '@ai-sdk/google',
                '@ai-sdk/openai',
                'drizzle-orm',
                'uuid',
              ],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: resolveAliases,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
