/**
 * Vendors layer: libsql
 *
 * The ONLY place in the codebase allowed to import the raw `@libsql/client`
 * package. The single sanctioned edge importing this wrapper is
 * foundations/database (see foundations/database/index.ts).
 */
import {
  createClient,
  type Client,
  type Config,
  type InValue,
  type ResultSet,
  type Row,
} from '@libsql/client';

export { createClient };
export type { Client, Config, InValue, ResultSet, Row };
