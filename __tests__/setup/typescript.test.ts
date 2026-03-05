import { describe, it, expect } from 'vitest';

describe('TypeScript Configuration', () => {
  it('should have strict mode enabled', async () => {
    const config = await import('../../tsconfig.json');
    expect(config.compilerOptions.strict).toBe(true);
  });

  it('should have React JSX configured', async () => {
    const config = await import('../../tsconfig.json');
    expect(config.compilerOptions.jsx).toBe('react-jsx');
  });
});
