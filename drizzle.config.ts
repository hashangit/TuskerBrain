import type { Config } from 'drizzle-kit';
import os from 'os';
import path from 'path';

export default {
  schema: './foundations/database/schema.ts',
  out: './foundations/database/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: `file:${path.join(os.homedir(), 'Library', 'Application Support', 'TuskerBrain', 'tuskerbrain.db')}`,
  },
} satisfies Config;
