// api/_auth.js — shared helper: verifies the Clerk session token sent by
// the frontend and returns the authenticated user's ID, or null if the
// request isn't authenticated.

import { verifyToken } from "@clerk/backend";

export async function getUserId(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    return payload.sub; // Clerk's user ID
  } catch {
    return null;
  }
}
