import type { Config } from 'drizzle-kit';
import os from 'os';
import path from 'path';

export default {
  schema: './database/schema.ts',
  out: './database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(os.homedir(), 'Library', 'Application Support', 'TuskerBrain', 'tuskerbrain.db'),
  },
} satisfies Config;
