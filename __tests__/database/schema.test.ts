import { describe, it, expect } from 'vitest';

describe('Database Schema', () => {
  it('should export emails table schema', async () => {
    const schema = await import('@foundations/database/schema');
    expect(schema.emails).toBeDefined();
  });

  it('should export topics table schema', async () => {
    const schema = await import('@foundations/database/schema');
    expect(schema.topics).toBeDefined();
  });

  it('should export jobs table schema', async () => {
    const schema = await import('@foundations/database/schema');
    expect(schema.jobs).toBeDefined();
  });
});
