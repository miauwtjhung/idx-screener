// api/_db.js — shared helper: a single Neon serverless SQL client, reused
// across API routes. Uses the pooled connection (DATABASE_URL), which is
// the right choice for short-lived serverless function invocations.

import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);
