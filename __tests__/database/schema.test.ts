import { describe, it, expect } from 'vitest';

describe('Database Schema', () => {
  it('should export emails table schema', async () => {
    const schema = await import('@db/schema');
    expect(schema.emails).toBeDefined();
  });

  it('should export topics table schema', async () => {
    const schema = await import('@db/schema');
    expect(schema.topics).toBeDefined();
  });

  it('should export jobs table schema', async () => {
    const schema = await import('@db/schema');
    expect(schema.jobs).toBeDefined();
  });
});
