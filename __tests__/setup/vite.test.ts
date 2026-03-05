import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Vite + Electron Configuration', () => {
  it('should have vite.config.ts', () => {
    const configPath = join(process.cwd(), 'vite.config.ts');
    expect(existsSync(configPath)).toBe(true);
  });

  it('should configure electron plugin', async () => {
    const configContent = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf-8');
    expect(configContent).toContain('electron');
  });

  it('should have electron main process file', () => {
    const mainPath = join(process.cwd(), 'electron', 'main.ts');
    expect(existsSync(mainPath)).toBe(true);
  });

  it('should have electron preload file', () => {
    const preloadPath = join(process.cwd(), 'electron', 'preload.ts');
    expect(existsSync(preloadPath)).toBe(true);
  });

  it('should have index.html entry point', () => {
    const htmlPath = join(process.cwd(), 'index.html');
    expect(existsSync(htmlPath)).toBe(true);
  });

  it('should have React entry point', () => {
    const mainPath = join(process.cwd(), 'src', 'main.tsx');
    expect(existsSync(mainPath)).toBe(true);
  });
});
