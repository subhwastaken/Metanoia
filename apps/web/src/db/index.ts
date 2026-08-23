import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // During build phase, database url might be missing, fall back to empty or log warning
  console.warn('Warning: DATABASE_URL is not set. Database operations will fail.');
}

const sql = neon(connectionString || '');
export const db = drizzle(sql, { schema });
