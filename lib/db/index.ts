import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let cached: ReturnType<typeof createDb> | null = null;

function createDb() {
  return drizzle(neon(process.env.DATABASE_URL!), { schema });
}

/** Lazy-Singleton, damit Builds ohne DATABASE_URL nicht scheitern. */
export function getDb() {
  if (!cached) cached = createDb();
  return cached;
}

export { schema };
