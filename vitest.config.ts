import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'dist-electron'],
    setupFiles: ['__tests__/setup/react.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', '__tests__'],
    },
    // Use jsdom environment for tsx files
    environmentMatchGlobs: [
      ['__tests__/**/*.test.tsx', 'jsdom'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './core'),
      '@db': path.resolve(__dirname, './database'),
      '@electron': path.resolve(__dirname, './electron'),
    },
  },
});
