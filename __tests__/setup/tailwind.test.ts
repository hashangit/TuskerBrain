import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Tailwind CSS Configuration', () => {
  it('should have tailwind.config.ts', () => {
    const configPath = join(process.cwd(), 'tailwind.config.ts');
    expect(existsSync(configPath)).toBe(true);
  });

  it('should have postcss.config.js', () => {
    const configPath = join(process.cwd(), 'postcss.config.js');
    expect(existsSync(configPath)).toBe(true);
  });

  it('should configure content paths', async () => {
    const configContent = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf-8');
    expect(configContent).toContain('content');
    expect(configContent).toContain('./src/**/*.{js,ts,jsx,tsx}');
  });
});
