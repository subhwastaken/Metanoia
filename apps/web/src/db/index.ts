import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleLocal } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('Warning: DATABASE_URL is not set. Database operations will fail.');
}

const isNeon = connectionString?.includes('neon.tech');

let dbInstance: any;

if (isNeon) {
  const sql = neon(connectionString || '');
  dbInstance = drizzleNeon(sql, { schema });
} else {
  const queryClient = postgres(connectionString || '');
  dbInstance = drizzleLocal(queryClient, { schema });
}

export const db = dbInstance;
